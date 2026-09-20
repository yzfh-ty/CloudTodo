package app

import (
	"net/http"
	"strings"
	"time"
)

func (a *App) adminNotificationSubscriptions(w http.ResponseWriter, r *http.Request, actor identity) {
	userID := r.PathValue("id")
	rows, err := a.DB.Query(`SELECT id,channel,enabled,COALESCE(email,''),COALESCE(target_url,''),COALESCE(chat_id,''),version,created_at,updated_at FROM notification_subscriptions WHERE user_id=? ORDER BY channel`, userID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not list user notifications", nil)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, channel, email, targetURL, chatID, created, updated string
		var enabled bool
		var version int
		_ = rows.Scan(&id, &channel, &enabled, &email, &targetURL, &chatID, &version, &created, &updated)
		items = append(items, map[string]any{"id": id, "channel": channel, "enabled": enabled, "email": maskValue(email), "target_url": maskURL(targetURL), "chat_id": maskValue(chatID), "version": version, "created_at": created, "updated_at": updated})
	}
	writeJSON(w, 200, map[string]any{"items": items, "next_cursor": nil, "has_more": false})
}

func (a *App) adminNotificationSubscription(w http.ResponseWriter, r *http.Request, actor identity) {
	userID := r.PathValue("id")
	subscriptionID := r.PathValue("subscription_id")
	if r.Method == http.MethodDelete {
		res, err := a.DB.Exec(`DELETE FROM notification_subscriptions WHERE id=? AND user_id=?`, subscriptionID, userID)
		if err != nil {
			errorJSON(w, 500, "INTERNAL_ERROR", "could not delete notification subscription", nil)
			return
		}
		n, _ := res.RowsAffected()
		if n != 1 {
			errorJSON(w, 404, "RESOURCE_NOT_FOUND", "notification subscription not found", nil)
			return
		}
		writeJSON(w, 200, map[string]any{"deleted": true, "subscription_id": subscriptionID})
		return
	}
	if r.Method != http.MethodPatch {
		errorJSON(w, 405, "METHOD_NOT_ALLOWED", "method not allowed", nil)
		return
	}
	var in struct {
		Enabled                          *bool
		Email, TargetURL, Secret, ChatID string
		Version                          int
	}
	if !decode(r, &in) {
		errorJSON(w, 400, "VALIDATION_ERROR", "invalid notification subscription", nil)
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	res, err := a.DB.Exec(`UPDATE notification_subscriptions SET enabled=COALESCE(?,enabled),email=COALESCE(NULLIF(?,''),email),target_url=COALESCE(NULLIF(?,''),target_url),secret=COALESCE(NULLIF(?,''),secret),chat_id=COALESCE(NULLIF(?,''),chat_id),version=version+1,updated_at=? WHERE id=? AND user_id=?`, in.Enabled, strings.TrimSpace(in.Email), strings.TrimSpace(in.TargetURL), strings.TrimSpace(in.Secret), strings.TrimSpace(in.ChatID), now, subscriptionID, userID)
	if err != nil {
		errorJSON(w, 400, "VALIDATION_ERROR", "could not update notification subscription", nil)
		return
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		errorJSON(w, 404, "RESOURCE_NOT_FOUND", "notification subscription not found", nil)
		return
	}
	writeJSON(w, 200, map[string]any{"updated": true, "subscription_id": subscriptionID})
}

func (a *App) adminNotificationSubscriptionStatus(w http.ResponseWriter, r *http.Request, actor identity) {
	userID := r.PathValue("id")
	subscriptionID := r.PathValue("subscription_id")
	enabled := strings.HasSuffix(r.URL.Path, "/enable")
	res, err := a.DB.Exec(`UPDATE notification_subscriptions SET enabled=?,version=version+1,updated_at=? WHERE id=? AND user_id=?`, enabled, time.Now().UTC().Format(time.RFC3339Nano), subscriptionID, userID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not update notification subscription", nil)
		return
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		errorJSON(w, 404, "RESOURCE_NOT_FOUND", "notification subscription not found", nil)
		return
	}
	writeJSON(w, 200, map[string]any{"updated": true, "enabled": enabled, "subscription_id": subscriptionID})
}

func (a *App) adminNotificationDeliveries(w http.ResponseWriter, r *http.Request, actor identity) {
	userID := r.PathValue("id")
	rows, err := a.DB.Query(`SELECT id,event_id,subscription_id,channel,status,attempt_count,COALESCE(response_code,0),COALESCE(error_code,''),created_at,COALESCE(completed_at,'') FROM notification_deliveries WHERE user_id=? ORDER BY created_at DESC LIMIT 100`, userID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not list notification deliveries", nil)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var did, eid, sid, channel, status, errorCode, created, completed string
		var attempts, response int
		_ = rows.Scan(&did, &eid, &sid, &channel, &status, &attempts, &response, &errorCode, &created, &completed)
		items = append(items, map[string]any{"id": did, "event_id": eid, "subscription_id": sid, "channel": channel, "status": status, "attempt_count": attempts, "response_code": response, "error_code": nullIfEmpty(errorCode), "created_at": created, "completed_at": nullIfEmpty(completed)})
	}
	writeJSON(w, 200, map[string]any{"items": items, "next_cursor": nil, "has_more": false})
}

func maskValue(value string) string {
	if value == "" {
		return ""
	}
	if len(value) <= 4 {
		return "••••"
	}
	return value[:2] + "••••" + value[len(value)-2:]
}
func maskURL(value string) string {
	if value == "" {
		return ""
	}
	if len(value) <= 24 {
		return "••••"
	}
	return value[:18] + "••••" + value[len(value)-4:]
}
