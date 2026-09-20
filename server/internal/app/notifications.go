package app

import (
	"crypto/hmac"
	"crypto/sha256"
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
	UserID       string `json:"user_id"`
	TodoID       string `json:"todo_id"`
	TodoTitle    string `json:"todo_title"`
	ScheduledFor string `json:"scheduled_for"`
}

func (a *App) testSubscription(w http.ResponseWriter, r *http.Request, id identity) {
	subscriptionID := r.PathValue("id")
	var channel, email, targetURL, secret, chatID string
	var enabled bool
	err := a.DB.QueryRow(`SELECT channel,enabled,COALESCE(email,''),COALESCE(target_url,''),COALESCE(secret,''),COALESCE(chat_id,'') FROM notification_subscriptions WHERE id=? AND user_id=?`, subscriptionID, id.ID).Scan(&channel, &enabled, &email, &targetURL, &secret, &chatID)
	if err != nil {
		errorJSON(w, 404, "RESOURCE_NOT_FOUND", "subscription not found", nil)
		return
	}
	if !enabled {
		errorJSON(w, 400, "SUBSCRIPTION_DISABLED", "subscription is disabled", nil)
		return
	}
	payload := reminderPayload{EventID: newID(), EventType: "notification.test", TriggeredAt: time.Now().UTC().Format(time.RFC3339Nano), UserID: id.ID, TodoTitle: "CloudTodo test notification"}
	if code := a.deliver(channel, email, targetURL, secret, chatID, payload); code != "" {
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
	var userID, todoID, channel, scheduledFor, title string
	if err := a.DB.QueryRow(`SELECT e.user_id,e.todo_id,e.channel,e.scheduled_for,COALESCE(t.title,'') FROM reminder_events e JOIN todos t ON t.id=e.todo_id WHERE e.id=?`, eventID).Scan(&userID, &todoID, &channel, &scheduledFor, &title); err != nil {
		return
	}
	if channel == "local" {
		return
	}
	var subscriptionID, email, targetURL, secret, chatID string
	var enabled bool
	if err := a.DB.QueryRow(`SELECT id,enabled,COALESCE(email,''),COALESCE(target_url,''),COALESCE(secret,''),COALESCE(chat_id,'') FROM notification_subscriptions WHERE user_id=? AND channel=?`, userID, channel).Scan(&subscriptionID, &enabled, &email, &targetURL, &secret, &chatID); err != nil || !enabled {
		return
	}
	payload := reminderPayload{EventID: eventID, EventType: "reminder.triggered", TriggeredAt: time.Now().UTC().Format(time.RFC3339Nano), UserID: userID, TodoID: todoID, TodoTitle: title, ScheduledFor: scheduledFor}
	code := a.deliver(channel, email, targetURL, secret, chatID, payload)
	status := "success"
	if code != "" {
		status = "failed"
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, _ = a.DB.Exec(`INSERT INTO notification_deliveries(id,user_id,subscription_id,event_id,channel,status,attempt_count,error_code,created_at,completed_at) VALUES(?,?,?,?,?, ?,1,?,?,?)`, newID(), userID, subscriptionID, eventID, channel, status, nullable(code), now, now)
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

func (a *App) deliverWebhook(targetURL, secret string, payload reminderPayload) string {
	if err := validateWebhookURL(targetURL); err != nil {
		return "WEBHOOK_URL_REJECTED"
	}
	body, _ := json.Marshal(payload)
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
	body := "From: " + cfg.SMTPFrom + "\r\nTo: " + address + "\r\nSubject: CloudTodo reminder\r\nList-Unsubscribe: <" + publicBaseURL() + "/api/notifications/email/unsubscribe?token=" + url.QueryEscape(unsubscribe) + ">\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n\r\n" + payload.TodoTitle + "\r\n" + payload.ScheduledFor + "\r\n"
	var auth smtp.Auth
	if cfg.SMTPUser != "" {
		auth = smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPHost)
	}
	if err := smtp.SendMail(cfg.SMTPHost+":"+port, auth, cfg.SMTPFrom, []string{address}, []byte(body)); err != nil {
		return "EMAIL_DELIVERY_FAILED"
	}
	return ""
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
