package app

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/tls"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/mail"
	"net/smtp"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type reminderPayload struct {
	EventID      string `json:"event_id"`
	EventType    string `json:"event_type"`
	TriggeredAt  string `json:"triggered_at"`
	UserID       string `json:"-"`
	UserTimezone string `json:"-"`
	TodoID       string `json:"-"`
	TodoTitle    string `json:"-"`
	TodoStatus   string `json:"-"`
	TodoPriority string `json:"-"`
	ReminderID   string `json:"-"`
	ScheduledFor string `json:"-"`
}

func (a *App) testSubscription(w http.ResponseWriter, r *http.Request, id identity) {
	subscriptionID := r.PathValue("id")
	var channel, email, targetURL, secret, chatID string
	var enabled bool
	err := a.DB.QueryRow(`SELECT channel,enabled,COALESCE(email,''),COALESCE(target_url,''),COALESCE(secret,''),COALESCE(chat_id,'') FROM notification_subscriptions WHERE id=? AND user_id=? AND deleted_at IS NULL`, subscriptionID, id.ID).Scan(&channel, &enabled, &email, &targetURL, &secret, &chatID)
	if err != nil {
		errorJSON(w, 404, "RESOURCE_NOT_FOUND", "subscription not found", nil)
		return
	}
	if !enabled {
		errorJSON(w, 400, "SUBSCRIPTION_DISABLED", "subscription is disabled", nil)
		return
	}
	payload := reminderPayload{EventID: newID(), EventType: "notification.test", TriggeredAt: time.Now().UTC().Format(time.RFC3339Nano), UserID: id.ID, TodoTitle: "CloudTodo test notification"}
	if code, _ := a.deliverWithResponse(channel, email, targetURL, secret, chatID, payload); code != "" {
		errorJSON(w, 502, code, "notification delivery failed", nil)
		return
	}
	writeJSON(w, 200, map[string]any{"tested": true, "channel": channel})
}

func (a *App) unsubscribeEmail(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" && r.Method == http.MethodPost {
		var in struct {
			Token string `json:"token"`
		}
		if decode(r, &in) {
			token = in.Token
		}
	}
	userID, subscriptionID, ok := a.parseUnsubscribeToken(token)
	if !ok {
		errorJSON(w, 400, "EMAIL_UNSUBSCRIBE_TOKEN_INVALID", "unsubscribe token is invalid or expired", nil)
		return
	}
	res, err := a.DB.Exec(`UPDATE notification_subscriptions SET enabled=0,version=version+1,updated_at=? WHERE id=? AND user_id=? AND channel='email'`, time.Now().UTC().Format(time.RFC3339Nano), subscriptionID, userID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not unsubscribe email", nil)
		return
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		errorJSON(w, 404, "RESOURCE_NOT_FOUND", "email subscription not found", nil)
		return
	}
	writeJSON(w, 200, map[string]any{"unsubscribed": true})
}

func (a *App) dispatchEvent(eventID string) {
	var userID, todoID, reminderID, channel, scheduledFor, title, todoStatus, todoPriority, userTimezone string
	if err := a.DB.QueryRow(`SELECT e.user_id,e.todo_id,e.reminder_id,e.channel,e.scheduled_for,COALESCE(t.title,''),t.status,t.priority,u.timezone FROM reminder_events e JOIN todos t ON t.id=e.todo_id JOIN users u ON u.id=e.user_id WHERE e.id=?`, eventID).Scan(&userID, &todoID, &reminderID, &channel, &scheduledFor, &title, &todoStatus, &todoPriority, &userTimezone); err != nil {
		return
	}
	if channel == "local" {
		return
	}
	var subscriptionID, email, targetURL, secret, chatID string
	var enabled bool
	if err := a.DB.QueryRow(`SELECT id,enabled,COALESCE(email,''),COALESCE(target_url,''),COALESCE(secret,''),COALESCE(chat_id,'') FROM notification_subscriptions WHERE user_id=? AND channel=? AND deleted_at IS NULL`, userID, channel).Scan(&subscriptionID, &enabled, &email, &targetURL, &secret, &chatID); err != nil || !enabled {
		return
	}
	payload := reminderPayload{EventID: eventID, EventType: "reminder.triggered", TriggeredAt: time.Now().UTC().Format(time.RFC3339Nano), UserID: userID, UserTimezone: userTimezone, TodoID: todoID, TodoTitle: title, TodoStatus: todoStatus, TodoPriority: todoPriority, ReminderID: reminderID, ScheduledFor: scheduledFor}
	var alreadyDelivered int
	if a.DB.QueryRow(`SELECT COUNT(1) FROM notification_deliveries WHERE subscription_id=? AND event_id=? AND status='success'`, subscriptionID, eventID).Scan(&alreadyDelivered) == nil && alreadyDelivered > 0 {
		return
	}
	status := "failed"
	code := ""
	responseCode := 0
	attempts := 0
	for attempts < 3 {
		attempts++
		code, responseCode = a.deliverWithResponse(channel, email, targetURL, secret, chatID, payload)
		if code == "" {
			status = "success"
			break
		}
		if attempts < 3 {
			time.Sleep(time.Duration(attempts) * 100 * time.Millisecond)
		}
	}
	if status != "success" && attempts >= 3 {
		status = "dead_letter"
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, _ = a.DB.Exec(`INSERT INTO notification_deliveries(id,user_id,subscription_id,event_id,channel,status,attempt_count,error_code,created_at,completed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`, newID(), userID, subscriptionID, eventID, channel, status, attempts, responseCode, nullable(code), now, now)
}

func (a *App) deliverWithResponse(channel, email, targetURL, secret, chatID string, payload reminderPayload) (string, int) {
	switch channel {
	case "webhook":
		return deliverWebhookWithResponse(targetURL, secret, payload)
	case "telegram":
		return a.deliverTelegramWithResponse(chatID, payload)
	case "email":
		if code := a.deliverEmail(email, payload); code != "" {
			return code, 0
		}
		return "", 250
	case "local":
		return "", 0
	default:
		return "VALIDATION_ERROR", 0
	}
}
func (a *App) deliver(channel, email, targetURL, secret, chatID string, payload reminderPayload) string {
	switch channel {
	case "webhook":
		return a.deliverWebhook(targetURL, secret, payload)
	case "email":
		return a.deliverEmail(email, payload)
	case "telegram":
		return a.deliverTelegram(chatID, payload)
	case "local":
		return ""
	default:
		return "VALIDATION_ERROR"
	}
}

func webhookBody(payload reminderPayload) ([]byte, error) {
	userTimezone := payload.UserTimezone
	if userTimezone == "" {
		userTimezone = "Asia/Shanghai"
	}
	return json.Marshal(map[string]any{"event_id": payload.EventID, "event_type": payload.EventType, "triggered_at": payload.TriggeredAt, "user": map[string]any{"id": payload.UserID, "timezone": userTimezone}, "todo": map[string]any{"id": payload.TodoID, "title": payload.TodoTitle, "status": payload.TodoStatus, "priority": payload.TodoPriority}, "reminder": map[string]any{"id": payload.ReminderID, "scheduled_for": payload.ScheduledFor}})
}

func deliverWebhookWithResponse(targetURL, secret string, payload reminderPayload) (string, int) {
	if err := validateWebhookURL(targetURL); err != nil {
		return "WEBHOOK_URL_REJECTED", 0
	}
	body, err := webhookBody(payload)
	if err != nil {
		return "WEBHOOK_DELIVERY_FAILED", 0
	}
	req, err := http.NewRequest(http.MethodPost, targetURL, strings.NewReader(string(body)))
	if err != nil {
		return "WEBHOOK_DELIVERY_FAILED", 0
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CloudTodo-Event", payload.EventType)
	req.Header.Set("X-CloudTodo-Event-Id", payload.EventID)
	req.Header.Set("X-CloudTodo-Timestamp", payload.TriggeredAt)
	if secret != "" {
		req.Header.Set("X-CloudTodo-Signature", "sha256="+signWebhook(secret, payload.TriggeredAt+"."+payload.EventID+"."+string(body)))
	}
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return "WEBHOOK_DELIVERY_FAILED", 0
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 2048))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "WEBHOOK_DELIVERY_FAILED", resp.StatusCode
	}
	return "", resp.StatusCode
}

func (a *App) deliverTelegramWithResponse(chatID string, payload reminderPayload) (string, int) {
	cfg, err := a.loadProvider("telegram")
	if err != nil || !cfg.Enabled || cfg.BotToken == "" || chatID == "" {
		return "TELEGRAM_PROVIDER_NOT_CONFIGURED", 0
	}
	body, _ := json.Marshal(map[string]string{"chat_id": chatID, "text": "CloudTodo reminder\n" + payload.TodoTitle + "\n" + payload.ScheduledFor})
	req, err := http.NewRequest(http.MethodPost, "https://api.telegram.org/bot"+url.PathEscape(cfg.BotToken)+"/sendMessage", strings.NewReader(string(body)))
	if err != nil {
		return "TELEGRAM_DELIVERY_FAILED", 0
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return "TELEGRAM_DELIVERY_FAILED", 0
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "TELEGRAM_DELIVERY_FAILED", resp.StatusCode
	}
	return "", resp.StatusCode
}

func (a *App) deliverWebhook(targetURL, secret string, payload reminderPayload) string {
	if err := validateWebhookURL(targetURL); err != nil {
		return "WEBHOOK_URL_REJECTED"
	}
	userTimezone := payload.UserTimezone
	if userTimezone == "" {
		userTimezone = "Asia/Shanghai"
	}
	body, _ := webhookBody(payload)
	req, err := http.NewRequest(http.MethodPost, targetURL, strings.NewReader(string(body)))
	if err != nil {
		return "WEBHOOK_DELIVERY_FAILED"
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CloudTodo-Event", payload.EventType)
	req.Header.Set("X-CloudTodo-Event-Id", payload.EventID)
	req.Header.Set("X-CloudTodo-Timestamp", payload.TriggeredAt)
	if secret != "" {
		req.Header.Set("X-CloudTodo-Signature", "sha256="+signWebhook(secret, payload.TriggeredAt+"."+payload.EventID+"."+string(body)))
	}
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return "WEBHOOK_DELIVERY_FAILED"
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 2048))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "WEBHOOK_DELIVERY_FAILED"
	}
	return ""
}

func (a *App) deliverEmail(address string, payload reminderPayload) string {
	cfg, err := a.loadProvider("email")
	if err != nil || !cfg.Enabled {
		return "EMAIL_PROVIDER_NOT_CONFIGURED"
	}
	return a.deliverEmailWithConfig(cfg, address, payload)
}

func (a *App) deliverEmailWithConfig(cfg providerConfig, address string, payload reminderPayload) string {
	if _, err := mail.ParseAddress(address); err != nil {
		return "EMAIL_DELIVERY_FAILED"
	}
	if cfg.SMTPHost == "" || cfg.SMTPFrom == "" {
		return "EMAIL_PROVIDER_NOT_CONFIGURED"
	}
	port := cfg.SMTPPort
	if port == "" {
		port = "587"
	}
	unsubscribe := a.createUnsubscribeToken(payload.UserID)
	if unsubscribe == "" {
		return "EMAIL_PROVIDER_NOT_CONFIGURED"
	}
	fromHeader := (&mail.Address{Name: cfg.FromName, Address: cfg.SMTPFrom}).String()
	body := "From: " + fromHeader + "\r\nTo: " + address + "\r\nSubject: CloudTodo reminder\r\nList-Unsubscribe: <" + publicBaseURL() + "/api/notifications/email/unsubscribe?token=" + url.QueryEscape(unsubscribe) + ">\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n\r\n" + payload.TodoTitle + "\r\n" + payload.ScheduledFor + "\r\n"
	var auth smtp.Auth
	if cfg.SMTPUser != "" {
		auth = smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPHost)
	}
	if err := sendEmailSMTP(cfg, port, address, auth, []byte(body)); err != nil {
		return "EMAIL_DELIVERY_FAILED"
	}
	return ""
}

func sendEmailSMTP(cfg providerConfig, port, address string, auth smtp.Auth, body []byte) error {
	security := strings.ToLower(cfg.Security)
	if security == "" && port == "465" {
		security = "ssl"
	}
	server := cfg.SMTPHost + ":" + port
	if security == "ssl" || security == "tls" {
		conn, err := tls.Dial("tcp", server, &tls.Config{ServerName: cfg.SMTPHost, MinVersion: tls.VersionTLS12})
		if err != nil {
			return err
		}
		client, err := smtp.NewClient(conn, cfg.SMTPHost)
		if err != nil {
			return err
		}
		defer client.Close()
		if auth != nil {
			if err = client.Auth(auth); err != nil {
				return err
			}
		}
		return writeSMTPMessage(client, cfg.SMTPFrom, address, body)
	}
	if security == "starttls" {
		client, err := smtp.Dial(server)
		if err != nil {
			return err
		}
		defer client.Close()
		if err = client.StartTLS(&tls.Config{ServerName: cfg.SMTPHost, MinVersion: tls.VersionTLS12}); err != nil {
			return err
		}
		if auth != nil {
			if err = client.Auth(auth); err != nil {
				return err
			}
		}
		return writeSMTPMessage(client, cfg.SMTPFrom, address, body)
	}
	return smtp.SendMail(server, auth, cfg.SMTPFrom, []string{address}, body)
}

func writeSMTPMessage(client *smtp.Client, from, to string, body []byte) error {
	if err := client.Mail(from); err != nil {
		return err
	}
	if err := client.Rcpt(to); err != nil {
		return err
	}
	writer, err := client.Data()
	if err != nil {
		return err
	}
	if _, err = writer.Write(body); err != nil {
		_ = writer.Close()
		return err
	}
	if err = writer.Close(); err != nil {
		return err
	}
	return client.Quit()
}

func (a *App) deliverTelegram(chatID string, payload reminderPayload) string {
	cfg, err := a.loadProvider("telegram")
	if err != nil || !cfg.Enabled {
		return "TELEGRAM_PROVIDER_NOT_CONFIGURED"
	}
	return a.deliverTelegramWithConfig(cfg, chatID, payload)
}

func (a *App) deliverTelegramWithConfig(cfg providerConfig, chatID string, payload reminderPayload) string {
	if cfg.BotToken == "" || chatID == "" {
		return "TELEGRAM_PROVIDER_NOT_CONFIGURED"
	}
	body, _ := json.Marshal(map[string]string{"chat_id": chatID, "text": "CloudTodo reminder\n" + payload.TodoTitle + "\n" + payload.ScheduledFor})
	req, err := http.NewRequest(http.MethodPost, "https://api.telegram.org/bot"+url.PathEscape(cfg.BotToken)+"/sendMessage", strings.NewReader(string(body)))
	if err != nil {
		return "TELEGRAM_DELIVERY_FAILED"
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return "TELEGRAM_DELIVERY_FAILED"
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "TELEGRAM_DELIVERY_FAILED"
	}
	return ""
}
func validateWebhookURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Hostname() == "" || u.User != nil {
		return fmt.Errorf("invalid webhook URL")
	}
	if ip := net.ParseIP(u.Hostname()); ip != nil && (ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsMulticast()) {
		return fmt.Errorf("private address is not allowed")
	}
	return nil
}

func signWebhook(secret, value string) string {
	h := hmac.New(sha256.New, []byte(secret))
	_, _ = h.Write([]byte(value))
	return hex.EncodeToString(h.Sum(nil))
}

func (a *App) createUnsubscribeToken(userID string) string {
	var subscriptionID string
	if a.DB.QueryRow(`SELECT id FROM notification_subscriptions WHERE user_id=? AND channel='email'`, userID).Scan(&subscriptionID) != nil {
		return ""
	}
	secret := os.Getenv("CLOUDTODO_EMAIL_UNSUBSCRIBE_SECRET")
	if secret == "" {
		return ""
	}
	value := userID + ":" + subscriptionID + ":" + strconv.FormatInt(time.Now().Add(30*24*time.Hour).Unix(), 10)
	return base64.RawURLEncoding.EncodeToString([]byte(value + ":" + signWebhook(secret, value)))
}

func (a *App) parseUnsubscribeToken(token string) (string, string, bool) {
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return "", "", false
	}
	parts := strings.Split(string(raw), ":")
	if len(parts) != 4 {
		return "", "", false
	}
	exp, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil || time.Now().Unix() > exp {
		return "", "", false
	}
	secret := os.Getenv("CLOUDTODO_EMAIL_UNSUBSCRIBE_SECRET")
	if secret == "" {
		return "", "", false
	}
	value := strings.Join(parts[:3], ":")
	if !hmac.Equal([]byte(signWebhook(secret, value)), []byte(parts[3])) {
		return "", "", false
	}
	return parts[0], parts[1], true
}

func publicBaseURL() string {
	value := os.Getenv("CLOUDTODO_PUBLIC_BASE_URL")
	if value == "" {
		return "http://localhost:3000"
	}
	return strings.TrimRight(value, "/")
}

var _ = sql.ErrNoRows
