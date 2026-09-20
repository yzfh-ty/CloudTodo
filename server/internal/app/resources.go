package app

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

func (a *App) lists(w http.ResponseWriter, r *http.Request, id identity) {
	switch r.Method {
	case http.MethodGet:
		limit, err := parseLimit(r)
		if err != nil {
			errorJSON(w, 400, "VALIDATION_ERROR", err.Error(), nil)
			return
		}
		where := "user_id=? AND deleted_at IS NULL"
		args := []any{id.ID}
		if value := r.URL.Query().Get("cursor"); value != "" {
			cursor, err := decodePageCursor(value)
			if err != nil {
				errorJSON(w, 400, "INVALID_CURSOR", "cursor is invalid", nil)
				return
			}
			where += " AND (updated_at<? OR (updated_at=? AND id<?))"
			args = append(args, cursor.Time, cursor.Time, cursor.ID)
		}
		args = append(args, limit+1)
		rows, err := a.DB.Query(`SELECT id,name,COALESCE(color,''),sort_order,version,created_at,updated_at,COALESCE(deleted_at,'') FROM lists WHERE `+where+` ORDER BY updated_at DESC,id DESC LIMIT ?`, args...)
		if err != nil {
			errorJSON(w, 500, "INTERNAL_ERROR", "could not list lists", nil)
			return
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			var listID, name, color, created, updated, deleted string
			var sortOrder, version int
			if err := rows.Scan(&listID, &name, &color, &sortOrder, &version, &created, &updated, &deleted); err != nil {
				errorJSON(w, 500, "INTERNAL_ERROR", "could not decode lists", nil)
				return
			}
			items = append(items, map[string]any{"id": listID, "name": name, "color": nullIfEmpty(color), "sort_order": sortOrder, "version": version, "created_at": created, "updated_at": updated, "deleted_at": nullIfEmpty(deleted)})
		}
		items, next, more := finishPage(items, limit, "updated_at")
		writeJSON(w, 200, map[string]any{"items": items, "next_cursor": next, "has_more": more})
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
		_, _ = a.DB.Exec(`UPDATE todos SET list_id=NULL,updated_at=? WHERE list_id=? AND user_id=? AND status!='deleted'`, time.Now().UTC().Format(time.RFC3339Nano), listID, id.ID)
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
		limit, err := parseLimit(r)
		if err != nil {
			errorJSON(w, 400, "VALIDATION_ERROR", err.Error(), nil)
			return
		}
		where := "user_id=? AND deleted_at IS NULL"
		args := []any{id.ID}
		if value := r.URL.Query().Get("cursor"); value != "" {
			cursor, err := decodePageCursor(value)
			if err != nil {
				errorJSON(w, 400, "INVALID_CURSOR", "cursor is invalid", nil)
				return
			}
			where += " AND (updated_at<? OR (updated_at=? AND id<?))"
			args = append(args, cursor.Time, cursor.Time, cursor.ID)
		}
		args = append(args, limit+1)
		rows, err := a.DB.Query(`SELECT id,name,COALESCE(color,''),version,created_at,updated_at,COALESCE(deleted_at,'') FROM tags WHERE `+where+` ORDER BY updated_at DESC,id DESC LIMIT ?`, args...)
		if err != nil {
			errorJSON(w, 500, "INTERNAL_ERROR", "could not list tags", nil)
			return
		}
		defer rows.Close()
		items := []map[string]any{}
		for rows.Next() {
			var tagID, name, color, created, updated, deleted string
			var version int
			if err := rows.Scan(&tagID, &name, &color, &version, &created, &updated, &deleted); err != nil {
				errorJSON(w, 500, "INTERNAL_ERROR", "could not decode tags", nil)
				return
			}
			items = append(items, map[string]any{"id": tagID, "name": name, "color": nullIfEmpty(color), "version": version, "created_at": created, "updated_at": updated, "deleted_at": nullIfEmpty(deleted)})
		}
		items, next, more := finishPage(items, limit, "updated_at")
		writeJSON(w, 200, map[string]any{"items": items, "next_cursor": next, "has_more": more})
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

type repeatInput struct {
	Type string `json:"type"`
	Rule any    `json:"rule"`
}

type reminderInput struct {
	Channels []string    `json:"channels"`
	RemindAt string      `json:"remind_at"`
	Repeat   repeatInput `json:"repeat"`
}

func validateReminderChannels(channels []string) error {
	if len(channels) == 0 {
		return fmt.Errorf("channels are required")
	}
	seen := map[string]bool{}
	for _, channel := range channels {
		if channel != "local" && channel != "webhook" && channel != "email" && channel != "telegram" {
			return fmt.Errorf("unsupported notification channel")
		}
		if seen[channel] {
			return fmt.Errorf("duplicate notification channel")
		}
		seen[channel] = true
	}
	return nil
}

func validateRepeat(repeat repeatInput) error {
	if repeat.Type == "" {
		repeat.Type = "none"
	}
	if repeat.Type != "none" && repeat.Type != "daily" && repeat.Type != "weekly" && repeat.Type != "workday" {
		return fmt.Errorf("unsupported repeat type")
	}
	return nil
}

func (a *App) createReminder(w http.ResponseWriter, r *http.Request, id identity) {
	todoID := r.PathValue("id")
	var owns int
	if err := a.DB.QueryRow(`SELECT COUNT(1) FROM todos WHERE id=? AND user_id=? AND deleted_at IS NULL`, todoID, id.ID).Scan(&owns); err != nil || owns != 1 {
		errorJSON(w, 404, "RESOURCE_NOT_FOUND", "todo not found", nil)
		return
	}
	var in reminderInput
	if !decode(r, &in) || in.RemindAt == "" {
		errorJSON(w, 400, "VALIDATION_ERROR", "remind_at is required", nil)
		return
	}
	if err := validateReminderChannels(in.Channels); err != nil {
		errorJSON(w, 400, "VALIDATION_ERROR", err.Error(), nil)
		return
	}
	if in.Repeat.Type == "" {
		in.Repeat.Type = "none"
	}
	if err := validateRepeat(in.Repeat); err != nil {
		errorJSON(w, 400, "VALIDATION_ERROR", err.Error(), nil)
		return
	}
	var rule any
	if in.Repeat.Rule != nil {
		encoded, _ := json.Marshal(in.Repeat.Rule)
		rule = string(encoded)
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	reminderID := newID()
	channels, _ := json.Marshal(in.Channels)
	_, err := a.DB.Exec(`INSERT INTO reminders(id,user_id,todo_id,channels_json,remind_at,repeat_type,repeat_rule,status,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'pending',1,?,?)`, reminderID, id.ID, todoID, string(channels), in.RemindAt, in.Repeat.Type, rule, now, now)
	if err != nil {
		errorJSON(w, 400, "VALIDATION_ERROR", "could not create reminder", nil)
		return
	}
	object, err := a.reminderObject(reminderID, id.ID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not read created reminder", nil)
		return
	}
	writeJSON(w, 201, object)
}

func (a *App) reminders(w http.ResponseWriter, r *http.Request, id identity) {
	limit, err := parseLimit(r)
	if err != nil {
		errorJSON(w, 400, "VALIDATION_ERROR", err.Error(), nil)
		return
	}
	where := []string{"user_id=?", "deleted_at IS NULL"}
	args := []any{id.ID}
	if value := r.URL.Query().Get("cursor"); value != "" {
		cursor, err := decodePageCursor(value)
		if err != nil {
			errorJSON(w, 400, "INVALID_CURSOR", "cursor is invalid", nil)
			return
		}
		where = append(where, "(remind_at>? OR (remind_at=? AND id>?))")
		args = append(args, cursor.Time, cursor.Time, cursor.ID)
	}
	if strings.HasPrefix(r.URL.Path, "/api/todos/") {
		where = append(where, "todo_id=?")
		args = append(args, r.PathValue("id"))
	}
	if r.URL.Path == "/api/reminders/upcoming" {
		where = append(where, "status='pending'", "remind_at>=?")
		args = append(args, time.Now().UTC().Format(time.RFC3339Nano))
	}
	args = append(args, limit+1)
	rows, err := a.DB.Query(`SELECT id FROM reminders WHERE `+strings.Join(where, " AND ")+` ORDER BY remind_at,id LIMIT ?`, args...)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not list reminders", nil)
		return
	}
	reminderIDs := []string{}
	for rows.Next() {
		var reminderID string
		if err := rows.Scan(&reminderID); err != nil {
			rows.Close()
			errorJSON(w, 500, "INTERNAL_ERROR", "could not decode reminders", nil)
			return
		}
		reminderIDs = append(reminderIDs, reminderID)
	}
	rows.Close()
	items := []map[string]any{}
	for _, reminderID := range reminderIDs {
		object, err := a.reminderObject(reminderID, id.ID)
		if err == nil {
			items = append(items, object)
		}
	}
	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}
	var nextCursor any
	if hasMore && len(items) > 0 {
		last := items[len(items)-1]
		nextCursor = encodePageCursor(last["remind_at"].(string), last["id"].(string))
	}
	writeJSON(w, 200, map[string]any{"items": items, "next_cursor": nextCursor, "has_more": hasMore})
}
func (a *App) reminderObject(reminderID, userID string) (map[string]any, error) {
	var todoID, channelsJSON, remindAt, repeatType, repeatRule, statusValue, created, updated, deleted string
	var version int
	err := a.DB.QueryRow(`SELECT todo_id,channels_json,remind_at,repeat_type,COALESCE(repeat_rule,''),status,version,created_at,updated_at,COALESCE(deleted_at,'') FROM reminders WHERE id=? AND user_id=?`, reminderID, userID).Scan(&todoID, &channelsJSON, &remindAt, &repeatType, &repeatRule, &statusValue, &version, &created, &updated, &deleted)
	if err != nil {
		return nil, err
	}
	var channels []string
	_ = json.Unmarshal([]byte(channelsJSON), &channels)
	var rule any
	if repeatRule != "" {
		_ = json.Unmarshal([]byte(repeatRule), &rule)
	}
	return map[string]any{"id": reminderID, "todo_id": todoID, "channels": channels, "remind_at": remindAt, "repeat": map[string]any{"type": repeatType, "rule": rule}, "status": statusValue, "version": version, "created_at": created, "updated_at": updated, "deleted_at": nullIfEmpty(deleted)}, nil
}

func (a *App) reminder(w http.ResponseWriter, r *http.Request, id identity) {
	reminderID := r.PathValue("id")
	if r.Method == http.MethodGet {
		object, err := a.reminderObject(reminderID, id.ID)
		if err != nil {
			errorJSON(w, 404, "RESOURCE_NOT_FOUND", "reminder not found", nil)
			return
		}
		writeJSON(w, 200, object)
		return
	}
	if r.Method == http.MethodPatch {
		var in struct {
			Channels *[]string    `json:"channels"`
			RemindAt *string      `json:"remind_at"`
			Repeat   *repeatInput `json:"repeat"`
			Status   *string      `json:"status"`
			Version  int          `json:"version"`
		}
		if !decode(r, &in) || in.Version < 1 {
			errorJSON(w, 400, "VALIDATION_ERROR", "version is required", nil)
			return
		}
		updates := []string{}
		args := []any{}
		if in.Channels != nil {
			if err := validateReminderChannels(*in.Channels); err != nil {
				errorJSON(w, 400, "VALIDATION_ERROR", err.Error(), nil)
				return
			}
			encoded, _ := json.Marshal(*in.Channels)
			updates = append(updates, "channels_json=?")
			args = append(args, string(encoded))
		}
		if in.RemindAt != nil {
			if *in.RemindAt == "" {
				errorJSON(w, 400, "VALIDATION_ERROR", "remind_at is required", nil)
				return
			}
			updates = append(updates, "remind_at=?")
			args = append(args, *in.RemindAt)
		}
		if in.Repeat != nil {
			if in.Repeat.Type == "" {
				in.Repeat.Type = "none"
			}
			if err := validateRepeat(*in.Repeat); err != nil {
				errorJSON(w, 400, "VALIDATION_ERROR", err.Error(), nil)
				return
			}
			var rule any
			if in.Repeat.Rule != nil {
				encoded, _ := json.Marshal(in.Repeat.Rule)
				rule = string(encoded)
			}
			updates = append(updates, "repeat_type=?", "repeat_rule=?")
			args = append(args, in.Repeat.Type, rule)
		}
		if in.Status != nil {
			if *in.Status != "pending" && *in.Status != "triggered" && *in.Status != "cancelled" {
				errorJSON(w, 400, "VALIDATION_ERROR", "invalid reminder status", nil)
				return
			}
			updates = append(updates, "status=?")
			args = append(args, *in.Status)
		}
		if len(updates) == 0 {
			errorJSON(w, 400, "VALIDATION_ERROR", "no fields to update", nil)
			return
		}
		updates = append(updates, "version=version+1", "updated_at=?")
		args = append(args, time.Now().UTC().Format(time.RFC3339Nano), reminderID, id.ID, in.Version)
		res, err := a.DB.Exec(`UPDATE reminders SET `+strings.Join(updates, ",")+` WHERE id=? AND user_id=? AND version=? AND deleted_at IS NULL`, args...)
		if err != nil {
			errorJSON(w, 400, "VALIDATION_ERROR", "could not update reminder", nil)
			return
		}
		n, _ := res.RowsAffected()
		if n != 1 {
			errorJSON(w, 409, "RESOURCE_VERSION_CONFLICT", "resource version conflict", nil)
			return
		}
		object, err := a.reminderObject(reminderID, id.ID)
		if err != nil {
			errorJSON(w, 404, "RESOURCE_NOT_FOUND", "reminder not found", nil)
			return
		}
		writeJSON(w, 200, object)
		return
	}
	if r.Method == http.MethodDelete {
		now := time.Now().UTC().Format(time.RFC3339Nano)
		res, err := a.DB.Exec(`UPDATE reminders SET deleted_at=?,status='cancelled',version=version+1,updated_at=? WHERE id=? AND user_id=? AND deleted_at IS NULL`, now, now, reminderID, id.ID)
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
	limit, err := parseLimit(r)
	if err != nil {
		errorJSON(w, 400, "VALIDATION_ERROR", err.Error(), nil)
		return
	}
	where := "user_id=? AND status='pending'"
	args := []any{id.ID}
	if value := r.URL.Query().Get("cursor"); value != "" {
		cursor, err := decodePageCursor(value)
		if err != nil {
			errorJSON(w, 400, "INVALID_CURSOR", "cursor is invalid", nil)
			return
		}
		where += " AND (created_at>? OR (created_at=? AND id>?))"
		args = append(args, cursor.Time, cursor.Time, cursor.ID)
	}
	args = append(args, limit+1)
	rows, err := a.DB.Query(`SELECT id,reminder_id,todo_id,scheduled_for,status,created_at,COALESCE(acked_at,'') FROM reminder_events WHERE `+where+` ORDER BY created_at,id LIMIT ?`, args...)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not list reminder events", nil)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var eid, rid, tid, scheduled, status, created, acked string
		if err := rows.Scan(&eid, &rid, &tid, &scheduled, &status, &created, &acked); err != nil {
			errorJSON(w, 500, "INTERNAL_ERROR", "could not decode reminder events", nil)
			return
		}
		items = append(items, map[string]any{"id": eid, "reminder_id": rid, "todo_id": tid, "scheduled_for": scheduled, "status": status, "created_at": created, "acked_at": nullIfEmpty(acked)})
	}
	items, next, more := finishPage(items, limit, "created_at")
	writeJSON(w, 200, map[string]any{"items": items, "next_cursor": next, "has_more": more})
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
	var email, username, nickname, timezone string
	if err := a.DB.QueryRow(`SELECT email,username,nickname,timezone FROM users WHERE id=?`, id.ID).Scan(&email, &username, &nickname, &timezone); err != nil {
		errorJSON(w, 404, "RESOURCE_NOT_FOUND", "user not found", nil)
		return
	}
	lists, err := queryObjects(a.DB, `SELECT id,name,color,sort_order,version,created_at,updated_at,deleted_at FROM lists WHERE user_id=? ORDER BY updated_at,id`, id.ID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not export lists", nil)
		return
	}
	tags, err := queryObjects(a.DB, `SELECT id,name,color,version,created_at,updated_at,deleted_at FROM tags WHERE user_id=? ORDER BY updated_at,id`, id.ID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not export tags", nil)
		return
	}
	todos, err := queryObjects(a.DB, `SELECT id,list_id,title,description,status,priority,due_at,is_all_day,version,created_at,updated_at,deleted_at FROM todos WHERE user_id=? ORDER BY updated_at,id`, id.ID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not export todos", nil)
		return
	}
	for _, todo := range todos {
		if todoID, ok := todo["id"].(string); ok {
			todo["tag_ids"] = a.todoTagIDs(todoID, id.ID)
		}
	}
	reminders, err := queryObjects(a.DB, `SELECT id,todo_id,channels_json,remind_at,repeat_type,repeat_rule,status,version,created_at,updated_at,deleted_at FROM reminders WHERE user_id=? ORDER BY updated_at,id`, id.ID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not export reminders", nil)
		return
	}
	for _, reminder := range reminders {
		var channels []string
		if raw, ok := reminder["channels_json"].(string); ok {
			_ = json.Unmarshal([]byte(raw), &channels)
		}
		reminder["channels"] = channels
		reminder["repeat"] = map[string]any{"type": reminder["repeat_type"], "rule": reminder["repeat_rule"]}
		delete(reminder, "channels_json")
		delete(reminder, "repeat_type")
		delete(reminder, "repeat_rule")
	}
	subscriptions, err := queryObjects(a.DB, `SELECT id,channel,enabled,email,target_url,secret,chat_id,version,created_at,updated_at,COALESCE(deleted_at,'') AS deleted_at FROM notification_subscriptions WHERE user_id=? ORDER BY updated_at,id`, id.ID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not export subscriptions", nil)
		return
	}
	for _, subscription := range subscriptions {
		subscription["secret_configured"] = false
	}
	writeJSON(w, 200, map[string]any{
		"format": "cloudtodo-json", "version": 1, "exported_at": time.Now().UTC(),
		"user":  map[string]any{"id": id.ID, "email": email, "username": username, "nickname": nickname, "timezone": timezone},
		"lists": lists, "tags": tags, "todos": todos, "reminders": reminders, "notification_subscriptions": subscriptions,
	})
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
	limit, err := parseLimit(r)
	if err != nil {
		errorJSON(w, 400, "VALIDATION_ERROR", err.Error(), nil)
		return
	}
	where := "user_id=?"
	args := []any{id.ID}
	if value := r.URL.Query().Get("cursor"); value != "" {
		cursor, err := decodePageCursor(value)
		if err != nil {
			errorJSON(w, 400, "INVALID_CURSOR", "cursor is invalid", nil)
			return
		}
		where += " AND (created_at<? OR (created_at=? AND id<?))"
		args = append(args, cursor.Time, cursor.Time, cursor.ID)
	}
	args = append(args, limit+1)
	rows, err := a.DB.Query(`SELECT id,event_id,subscription_id,channel,status,attempt_count,COALESCE(response_code,0),COALESCE(error_code,''),created_at,COALESCE(completed_at,'') FROM notification_deliveries WHERE `+where+` ORDER BY created_at DESC,id DESC LIMIT ?`, args...)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not list deliveries", nil)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var did, eid, sid, channel, status, errorCode, created, completed string
		var attempts, response int
		if err := rows.Scan(&did, &eid, &sid, &channel, &status, &attempts, &response, &errorCode, &created, &completed); err != nil {
			errorJSON(w, 500, "INTERNAL_ERROR", "could not decode deliveries", nil)
			return
		}
		items = append(items, map[string]any{"id": did, "event_id": eid, "subscription_id": sid, "channel": channel, "status": status, "attempt_count": attempts, "response_code": nullIfZero(response), "error_code": nullIfEmpty(errorCode), "created_at": created, "completed_at": nullIfEmpty(completed)})
	}
	items, next, more := finishPage(items, limit, "created_at")
	writeJSON(w, 200, map[string]any{"items": items, "next_cursor": next, "has_more": more})
}
func (a *App) delivery(w http.ResponseWriter, r *http.Request, id identity) {
	deliveryID := r.PathValue("id")
	var eventID, subscriptionID, channel, status, errorCode, created, completed string
	var attempts, responseCode int
	err := a.DB.QueryRow(`SELECT event_id,subscription_id,channel,status,attempt_count,COALESCE(response_code,0),COALESCE(error_code,''),created_at,COALESCE(completed_at,'') FROM notification_deliveries WHERE id=? AND user_id=?`, deliveryID, id.ID).Scan(&eventID, &subscriptionID, &channel, &status, &attempts, &responseCode, &errorCode, &created, &completed)
	if err != nil {
		errorJSON(w, 404, "DELIVERY_NOT_FOUND", "delivery not found", nil)
		return
	}
	writeJSON(w, 200, map[string]any{"id": deliveryID, "event_id": eventID, "subscription_id": subscriptionID, "channel": channel, "status": status, "attempt_count": attempts, "response_code": nullIfZero(responseCode), "error_code": nullIfEmpty(errorCode), "created_at": created, "completed_at": nullIfEmpty(completed)})
}
func (a *App) todoTagIDs(todoID, userID string) []string {
	rows, err := a.DB.Query(`SELECT tt.tag_id FROM todo_tags tt JOIN tags t ON t.id=tt.tag_id WHERE tt.todo_id=? AND t.user_id=? AND t.deleted_at IS NULL ORDER BY tt.tag_id`, todoID, userID)
	if err != nil {
		return []string{}
	}
	defer rows.Close()
	items := []string{}
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			items = append(items, id)
		}
	}
	return items
}

func (a *App) validateTagIDs(userID string, tagIDs []string) error {
	for _, tagID := range tagIDs {
		var count int
		if err := a.DB.QueryRow(`SELECT COUNT(1) FROM tags WHERE id=? AND user_id=? AND deleted_at IS NULL`, tagID, userID).Scan(&count); err != nil || count != 1 {
			return fmt.Errorf("tag does not belong to user")
		}
	}
	return nil
}
func (a *App) replaceTodoTags(todoID, userID string, tagIDs []string) error {
	if _, err := a.DB.Exec(`DELETE FROM todo_tags WHERE todo_id=?`, todoID); err != nil {
		return err
	}
	for _, tagID := range tagIDs {
		var count int
		if err := a.DB.QueryRow(`SELECT COUNT(1) FROM tags WHERE id=? AND user_id=? AND deleted_at IS NULL`, tagID, userID).Scan(&count); err != nil || count != 1 {
			return fmt.Errorf("tag does not belong to user")
		}
		if _, err := a.DB.Exec(`INSERT INTO todo_tags(todo_id,tag_id) VALUES(?,?)`, todoID, tagID); err != nil {
			return err
		}
	}
	return nil
}
