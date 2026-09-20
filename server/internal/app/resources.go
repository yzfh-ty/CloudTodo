package app

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

func (a *App) lists(w http.ResponseWriter, r *http.Request, id identity) {
	switch r.Method {
	case http.MethodGet:
		rows, err := a.DB.Query(`SELECT id,name,COALESCE(color,''),sort_order,version,created_at,updated_at,COALESCE(deleted_at,'') FROM lists WHERE user_id=? AND deleted_at IS NULL ORDER BY sort_order,name`, id.ID)
		if err != nil {
			errorJSON(w, 500, "INTERNAL_ERROR", "could not list lists", nil)
			return
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			var listID, name, color, created, updated, deleted string
			var sortOrder, version int
			_ = rows.Scan(&listID, &name, &color, &sortOrder, &version, &created, &updated, &deleted)
			items = append(items, map[string]any{"id": listID, "name": name, "color": nullIfEmpty(color), "sort_order": sortOrder, "version": version, "created_at": created, "updated_at": updated, "deleted_at": nullIfEmpty(deleted)})
		}
		writeJSON(w, 200, map[string]any{"items": items, "next_cursor": nil, "has_more": false})
	case http.MethodPost:
		var in struct {
			Name, Color string
			SortOrder   int
		}
		if !decode(r, &in) || strings.TrimSpace(in.Name) == "" {
			errorJSON(w, 400, "VALIDATION_ERROR", "name is required", nil)
			return
		}
		now := time.Now().UTC().Format(time.RFC3339Nano)
		listID := newID()
		_, err := a.DB.Exec(`INSERT INTO lists(id,user_id,name,color,sort_order,version,created_at,updated_at) VALUES(?,?,?, ?,?,1,?,?)`, listID, id.ID, strings.TrimSpace(in.Name), nullable(in.Color), in.SortOrder, now, now)
		if err != nil {
			errorJSON(w, 409, "DUPLICATE_RESOURCE", "list already exists", nil)
			return
		}
		writeJSON(w, 201, map[string]any{"id": listID, "name": strings.TrimSpace(in.Name), "color": nullIfEmpty(in.Color), "sort_order": in.SortOrder, "version": 1, "created_at": now, "updated_at": now})
	default:
		errorJSON(w, 405, "METHOD_NOT_ALLOWED", "method not allowed", nil)
	}
}

func (a *App) list(w http.ResponseWriter, r *http.Request, id identity) {
	listID := r.PathValue("id")
	if r.Method == http.MethodGet {
		var name, color, created, updated, deleted string
		var sortOrder, version int
		err := a.DB.QueryRow(`SELECT name,COALESCE(color,''),sort_order,version,created_at,updated_at,COALESCE(deleted_at,'') FROM lists WHERE id=? AND user_id=? AND deleted_at IS NULL`, listID, id.ID).Scan(&name, &color, &sortOrder, &version, &created, &updated, &deleted)
		if err != nil {
			errorJSON(w, 404, "RESOURCE_NOT_FOUND", "list not found", nil)
			return
		}
		writeJSON(w, 200, map[string]any{"id": listID, "name": name, "color": nullIfEmpty(color), "sort_order": sortOrder, "version": version, "created_at": created, "updated_at": updated, "deleted_at": nullIfEmpty(deleted)})
		return
	}
	if r.Method == http.MethodPatch {
		var in struct {
			Name, Color string
			SortOrder   *int
			Version     int
		}
		if !decode(r, &in) || in.Version < 1 {
			errorJSON(w, 400, "VALIDATION_ERROR", "version is required", nil)
			return
		}
		now := time.Now().UTC().Format(time.RFC3339Nano)
		sort := 0
		if in.SortOrder != nil {
			sort = *in.SortOrder
		}
		res, err := a.DB.Exec(`UPDATE lists SET name=COALESCE(NULLIF(?,''),name),color=COALESCE(?,color),sort_order=CASE WHEN ? IS NULL THEN sort_order ELSE ? END,version=version+1,updated_at=? WHERE id=? AND user_id=? AND version=? AND deleted_at IS NULL`, in.Name, nullable(in.Color), in.SortOrder, sort, now, listID, id.ID, in.Version)
		if err != nil {
			errorJSON(w, 400, "VALIDATION_ERROR", "could not update list", nil)
			return
		}
		n, _ := res.RowsAffected()
		if n != 1 {
			errorJSON(w, 409, "RESOURCE_VERSION_CONFLICT", "resource version conflict", nil)
			return
		}
		a.list(w, r, id)
		return
	}
	if r.Method == http.MethodDelete {
		now := time.Now().UTC().Format(time.RFC3339Nano)
		res, err := a.DB.Exec(`UPDATE lists SET deleted_at=?,version=version+1,updated_at=? WHERE id=? AND user_id=? AND deleted_at IS NULL`, now, now, listID, id.ID)
		if err != nil {
			errorJSON(w, 500, "INTERNAL_ERROR", "could not delete list", nil)
			return
		}
		n, _ := res.RowsAffected()
		if n != 1 {
			errorJSON(w, 404, "RESOURCE_NOT_FOUND", "list not found", nil)
			return
		}
		writeJSON(w, 200, map[string]any{"deleted": true})
		return
	}
	errorJSON(w, 405, "METHOD_NOT_ALLOWED", "method not allowed", nil)
}

func (a *App) tags(w http.ResponseWriter, r *http.Request, id identity) {
	switch r.Method {
	case http.MethodGet:
		rows, err := a.DB.Query(`SELECT id,name,COALESCE(color,''),version,created_at,updated_at,COALESCE(deleted_at,'') FROM tags WHERE user_id=? AND deleted_at IS NULL ORDER BY name`, id.ID)
		if err != nil {
			errorJSON(w, 500, "INTERNAL_ERROR", "could not list tags", nil)
			return
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			var tagID, name, color, created, updated, deleted string
			var version int
			_ = rows.Scan(&tagID, &name, &color, &version, &created, &updated, &deleted)
			items = append(items, map[string]any{"id": tagID, "name": name, "color": nullIfEmpty(color), "version": version, "created_at": created, "updated_at": updated, "deleted_at": nullIfEmpty(deleted)})
		}
		writeJSON(w, 200, map[string]any{"items": items, "next_cursor": nil, "has_more": false})
	case http.MethodPost:
		var in struct{ Name, Color string }
		if !decode(r, &in) || strings.TrimSpace(in.Name) == "" {
			errorJSON(w, 400, "VALIDATION_ERROR", "name is required", nil)
			return
		}
		now := time.Now().UTC().Format(time.RFC3339Nano)
		tagID := newID()
		_, err := a.DB.Exec(`INSERT INTO tags(id,user_id,name,color,version,created_at,updated_at) VALUES(?,?,?, ?,1,?,?)`, tagID, id.ID, strings.TrimSpace(in.Name), nullable(in.Color), now, now)
		if err != nil {
			errorJSON(w, 409, "DUPLICATE_RESOURCE", "tag already exists", nil)
			return
		}
		writeJSON(w, 201, map[string]any{"id": tagID, "name": strings.TrimSpace(in.Name), "color": nullIfEmpty(in.Color), "version": 1, "created_at": now, "updated_at": now})
	default:
		errorJSON(w, 405, "METHOD_NOT_ALLOWED", "method not allowed", nil)
	}
}

func (a *App) tag(w http.ResponseWriter, r *http.Request, id identity) {
	tagID := r.PathValue("id")
	if r.Method == http.MethodGet {
		var name, color, created, updated, deleted string
		var version int
		err := a.DB.QueryRow(`SELECT name,COALESCE(color,''),version,created_at,updated_at,COALESCE(deleted_at,'') FROM tags WHERE id=? AND user_id=? AND deleted_at IS NULL`, tagID, id.ID).Scan(&name, &color, &version, &created, &updated, &deleted)
		if err != nil {
			errorJSON(w, 404, "RESOURCE_NOT_FOUND", "tag not found", nil)
			return
		}
		writeJSON(w, 200, map[string]any{"id": tagID, "name": name, "color": nullIfEmpty(color), "version": version, "created_at": created, "updated_at": updated, "deleted_at": nullIfEmpty(deleted)})
		return
	}
	if r.Method == http.MethodPatch {
		var in struct {
			Name, Color string
			Version     int
		}
		if !decode(r, &in) || in.Version < 1 {
			errorJSON(w, 400, "VALIDATION_ERROR", "version is required", nil)
			return
		}
		now := time.Now().UTC().Format(time.RFC3339Nano)
		res, err := a.DB.Exec(`UPDATE tags SET name=COALESCE(NULLIF(?,''),name),color=COALESCE(?,color),version=version+1,updated_at=? WHERE id=? AND user_id=? AND version=? AND deleted_at IS NULL`, in.Name, nullable(in.Color), now, tagID, id.ID, in.Version)
		if err != nil {
			errorJSON(w, 400, "VALIDATION_ERROR", "could not update tag", nil)
			return
		}
		n, _ := res.RowsAffected()
		if n != 1 {
			errorJSON(w, 409, "RESOURCE_VERSION_CONFLICT", "resource version conflict", nil)
			return
		}
		a.tag(w, r, id)
		return
	}
	if r.Method == http.MethodDelete {
		now := time.Now().UTC().Format(time.RFC3339Nano)
		res, err := a.DB.Exec(`UPDATE tags SET deleted_at=?,version=version+1,updated_at=? WHERE id=? AND user_id=? AND deleted_at IS NULL`, now, now, tagID, id.ID)
		if err != nil {
			errorJSON(w, 500, "INTERNAL_ERROR", "could not delete tag", nil)
			return
		}
		n, _ := res.RowsAffected()
		if n != 1 {
			errorJSON(w, 404, "RESOURCE_NOT_FOUND", "tag not found", nil)
			return
		}
		writeJSON(w, 200, map[string]any{"deleted": true})
		return
	}
	errorJSON(w, 405, "METHOD_NOT_ALLOWED", "method not allowed", nil)
}

type reminderInput struct {
	Channels []string       `json:"channels"`
	RemindAt string         `json:"remind_at"`
	Repeat   map[string]any `json:"repeat"`
}

func (a *App) createReminder(w http.ResponseWriter, r *http.Request, id identity) {
	todoID := r.PathValue("id")
	var owns int
	if err := a.DB.QueryRow(`SELECT COUNT(1) FROM todos WHERE id=? AND user_id=? AND deleted_at IS NULL`, todoID, id.ID).Scan(&owns); err != nil || owns != 1 {
		errorJSON(w, 404, "RESOURCE_NOT_FOUND", "todo not found", nil)
		return
	}
	var in reminderInput
	if !decode(r, &in) || in.RemindAt == "" || len(in.Channels) == 0 {
		errorJSON(w, 400, "VALIDATION_ERROR", "channels and remind_at are required", nil)
		return
	}
	channels, _ := json.Marshal(in.Channels)
	repeat, _ := json.Marshal(in.Repeat)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	rid := newID()
	_, err := a.DB.Exec(`INSERT INTO reminders(id,user_id,todo_id,channels_json,remind_at,repeat_type,repeat_rule,status,version,created_at,updated_at) VALUES(?,?,?,?,?, 'none',?,'pending',1,?,?)`, rid, id.ID, todoID, string(channels), in.RemindAt, string(repeat), now, now)
	if err != nil {
		errorJSON(w, 400, "VALIDATION_ERROR", "could not create reminder", nil)
		return
	}
	writeJSON(w, 201, map[string]any{"id": rid, "todo_id": todoID, "channels": in.Channels, "remind_at": in.RemindAt, "status": "pending", "version": 1, "created_at": now, "updated_at": now})
}
func (a *App) reminders(w http.ResponseWriter, r *http.Request, id identity) {
	if r.Method == http.MethodGet {
		rows, err := a.DB.Query(`SELECT id,todo_id,channels_json,remind_at,status,version,created_at,updated_at,COALESCE(deleted_at,'') FROM reminders WHERE user_id=? AND deleted_at IS NULL ORDER BY remind_at LIMIT 100`, id.ID)
		if err != nil {
			errorJSON(w, 500, "INTERNAL_ERROR", "could not list reminders", nil)
			return
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			var rid, tid, channels, at, status, created, updated, deleted string
			var version int
			_ = rows.Scan(&rid, &tid, &channels, &at, &status, &version, &created, &updated, &deleted)
			var parsed []string
			_ = json.Unmarshal([]byte(channels), &parsed)
			items = append(items, map[string]any{"id": rid, "todo_id": tid, "channels": parsed, "remind_at": at, "status": status, "version": version, "created_at": created, "updated_at": updated, "deleted_at": nullIfEmpty(deleted)})
		}
		writeJSON(w, 200, map[string]any{"items": items, "next_cursor": nil, "has_more": false})
		return
	}
	errorJSON(w, 405, "METHOD_NOT_ALLOWED", "method not allowed", nil)
}
func (a *App) reminder(w http.ResponseWriter, r *http.Request, id identity) {
	rid := r.PathValue("id")
	if r.Method == http.MethodGet {
		var tid, channels, at, status, created, updated, deleted string
		var version int
		err := a.DB.QueryRow(`SELECT todo_id,channels_json,remind_at,status,version,created_at,updated_at,COALESCE(deleted_at,'') FROM reminders WHERE id=? AND user_id=? AND deleted_at IS NULL`, rid, id.ID).Scan(&tid, &channels, &at, &status, &version, &created, &updated, &deleted)
		if err != nil {
			errorJSON(w, 404, "RESOURCE_NOT_FOUND", "reminder not found", nil)
			return
		}
		var parsed []string
		_ = json.Unmarshal([]byte(channels), &parsed)
		writeJSON(w, 200, map[string]any{"id": rid, "todo_id": tid, "channels": parsed, "remind_at": at, "status": status, "version": version, "created_at": created, "updated_at": updated, "deleted_at": nullIfEmpty(deleted)})
		return
	}
	if r.Method == http.MethodDelete {
		now := time.Now().UTC().Format(time.RFC3339Nano)
		res, err := a.DB.Exec(`UPDATE reminders SET deleted_at=?,status='cancelled',version=version+1,updated_at=? WHERE id=? AND user_id=? AND deleted_at IS NULL`, now, now, rid, id.ID)
		if err != nil {
			errorJSON(w, 500, "INTERNAL_ERROR", "could not delete reminder", nil)
			return
		}
		n, _ := res.RowsAffected()
		if n != 1 {
			errorJSON(w, 404, "RESOURCE_NOT_FOUND", "reminder not found", nil)
			return
		}
		writeJSON(w, 200, map[string]any{"deleted": true})
		return
	}
	errorJSON(w, 405, "METHOD_NOT_ALLOWED", "method not allowed", nil)
}
func (a *App) reminderEvents(w http.ResponseWriter, r *http.Request, id identity) {
	rows, err := a.DB.Query(`SELECT id,reminder_id,todo_id,scheduled_for,status,created_at,COALESCE(acked_at,'') FROM reminder_events WHERE user_id=? AND status='pending' ORDER BY created_at LIMIT 100`, id.ID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not list reminder events", nil)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var eid, rid, tid, scheduled, status, created, acked string
		_ = rows.Scan(&eid, &rid, &tid, &scheduled, &status, &created, &acked)
		items = append(items, map[string]any{"id": eid, "reminder_id": rid, "todo_id": tid, "scheduled_for": scheduled, "status": status, "created_at": created, "acked_at": nullIfEmpty(acked)})
	}
	writeJSON(w, 200, map[string]any{"items": items, "next_cursor": nil, "has_more": false})
}
func (a *App) ackReminderEvent(w http.ResponseWriter, r *http.Request, id identity) {
	eid := r.PathValue("id")
	now := time.Now().UTC().Format(time.RFC3339Nano)
	res, err := a.DB.Exec(`UPDATE reminder_events SET status='acked',acked_at=? WHERE id=? AND user_id=? AND status='pending'`, now, eid, id.ID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not acknowledge event", nil)
		return
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		errorJSON(w, 404, "RESOURCE_NOT_FOUND", "reminder event not found", nil)
		return
	}
	writeJSON(w, 200, map[string]any{"acknowledged": true})
}

func (a *App) exportMe(w http.ResponseWriter, r *http.Request, id identity) {
	var user map[string]any
	var email, username, nickname, timezone string
	if err := a.DB.QueryRow(`SELECT email,username,nickname,timezone FROM users WHERE id=?`, id.ID).Scan(&email, &username, &nickname, &timezone); err != nil {
		errorJSON(w, 404, "RESOURCE_NOT_FOUND", "user not found", nil)
		return
	}
	user = map[string]any{"id": id.ID, "email": email, "username": username, "nickname": nickname, "timezone": timezone}
	writeJSON(w, 200, map[string]any{"format": "cloudtodo-json", "version": 1, "exported_at": time.Now().UTC(), "user": user, "lists": []any{}, "tags": []any{}, "todos": []any{}, "reminders": []any{}, "notification_subscriptions": []any{}})
}
func (a *App) deleteMe(w http.ResponseWriter, r *http.Request, id identity) {
	var in struct{ Password, Confirmation string }
	if !decode(r, &in) || in.Confirmation != "DELETE" {
		errorJSON(w, 400, "ACCOUNT_DELETE_CONFIRMATION_REQUIRED", "account deletion confirmation required", nil)
		return
	}
	var hash string
	if err := a.DB.QueryRow(`SELECT password_hash FROM users WHERE id=?`, id.ID).Scan(&hash); err != nil || !verifyPassword(in.Password, hash) {
		errorJSON(w, 401, "ACCOUNT_DELETE_PASSWORD_INVALID", "password is invalid", nil)
		return
	}
	if _, err := a.DB.Exec(`DELETE FROM users WHERE id=?`, id.ID); err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not delete account", nil)
		return
	}
	writeJSON(w, 200, map[string]any{"deleted": true})
}
func (a *App) deliveries(w http.ResponseWriter, r *http.Request, id identity) {
	rows, err := a.DB.Query(`SELECT id,event_id,subscription_id,channel,status,attempt_count,COALESCE(response_code,0),COALESCE(error_code,''),created_at,COALESCE(completed_at,'') FROM notification_deliveries WHERE user_id=? ORDER BY created_at DESC LIMIT 100`, id.ID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not list deliveries", nil)
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
