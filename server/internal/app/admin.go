package app

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

func (a *App) adminLogoutAll(w http.ResponseWriter, r *http.Request, id identity) {
	_, _ = a.DB.Exec(`UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL`, time.Now().UTC().Format(time.RFC3339Nano), id.ID)
	writeJSON(w, 200, map[string]any{"logged_out": true})
}

func (a *App) adminChangePassword(w http.ResponseWriter, r *http.Request, id identity) {
	var in struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if !decode(r, &in) || len(in.NewPassword) < 8 {
		errorJSON(w, 400, "VALIDATION_ERROR", "invalid password request", nil)
		return
	}
	var old string
	if err := a.DB.QueryRow(`SELECT password_hash FROM users WHERE id=? AND role='admin'`, id.ID).Scan(&old); err != nil || !verifyPassword(in.CurrentPassword, old) {
		errorJSON(w, 401, "AUTH_INVALID_CREDENTIALS", "current password is invalid", nil)
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, _ = a.DB.Exec(`UPDATE users SET password_hash=?,updated_at=? WHERE id=?`, hashPassword(in.NewPassword), now, id.ID)
	_, _ = a.DB.Exec(`UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL`, now, id.ID)
	a.recordAudit(id.ID, id.ID, "admin.change_password", nil)
	writeJSON(w, 200, map[string]any{"changed": true})
}

func (a *App) adminCreateUser(w http.ResponseWriter, r *http.Request, id identity) {
	var in struct{ Email, Username, Password, Nickname, Timezone string }
	if !decode(r, &in) || in.Email == "" || in.Username == "" || len(in.Password) < 8 {
		errorJSON(w, 400, "VALIDATION_ERROR", "email, username and password are required", nil)
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	if in.Nickname == "" {
		in.Nickname = in.Username
	}
	if in.Timezone == "" {
		in.Timezone = "Asia/Shanghai"
	}
	userID := newID()
	_, err := a.DB.Exec(`INSERT INTO users(id,email,username,password_hash,nickname,timezone,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'user','active',?,?)`, userID, strings.ToLower(strings.TrimSpace(in.Email)), strings.TrimSpace(in.Username), hashPassword(in.Password), in.Nickname, in.Timezone, now, now)
	if err != nil {
		errorJSON(w, 409, "DUPLICATE_RESOURCE", "email or username already exists", nil)
		return
	}
	a.recordAudit(id.ID, userID, "admin.create_user", map[string]any{"username": strings.TrimSpace(in.Username)})
	writeJSON(w, 201, map[string]any{"id": userID, "email": strings.ToLower(strings.TrimSpace(in.Email)), "username": strings.TrimSpace(in.Username), "nickname": in.Nickname, "timezone": in.Timezone, "role": "user", "status": "active", "created_at": now, "updated_at": now})
}

func (a *App) adminUser(w http.ResponseWriter, r *http.Request, actor identity) {
	targetID := r.PathValue("id")
	if r.Method == http.MethodGet {
		var email, username, nickname, timezone, role, status, created, updated string
		var lastLogin sqlNullString
		err := a.DB.QueryRow(`SELECT email,username,nickname,timezone,role,status,created_at,updated_at,last_login_at FROM users WHERE id=?`, targetID).Scan(&email, &username, &nickname, &timezone, &role, &status, &created, &updated, &lastLogin)
		if err != nil {
			errorJSON(w, 404, "RESOURCE_NOT_FOUND", "user not found", nil)
			return
		}
		writeJSON(w, 200, map[string]any{"id": targetID, "email": email, "username": username, "nickname": nickname, "timezone": timezone, "role": role, "status": status, "created_at": created, "updated_at": updated, "last_login_at": lastLogin.Value()})
		return
	}
	if r.Method == http.MethodPatch {
		var in struct{ Email, Username, Nickname, Timezone string }
		if !decode(r, &in) {
			errorJSON(w, 400, "VALIDATION_ERROR", "invalid user update", nil)
			return
		}
		_, err := a.DB.Exec(`UPDATE users SET email=COALESCE(NULLIF(?,''),email),username=COALESCE(NULLIF(?,''),username),nickname=COALESCE(NULLIF(?,''),nickname),timezone=COALESCE(NULLIF(?,''),timezone),updated_at=? WHERE id=?`, strings.ToLower(strings.TrimSpace(in.Email)), strings.TrimSpace(in.Username), strings.TrimSpace(in.Nickname), strings.TrimSpace(in.Timezone), time.Now().UTC().Format(time.RFC3339Nano), targetID)
		if err != nil {
			errorJSON(w, 409, "DUPLICATE_RESOURCE", "user update conflicts with an existing identity", nil)
			return
		}
		a.recordAudit(actor.ID, targetID, "admin.update_user", nil)
		r.Method = http.MethodGet
		a.adminUser(w, r, actor)
		return
	}
	errorJSON(w, 405, "METHOD_NOT_ALLOWED", "method not allowed", nil)
}

func (a *App) adminSetUserStatus(w http.ResponseWriter, r *http.Request, actor identity) {
	targetID := r.PathValue("id")
	status := "active"
	if strings.HasSuffix(r.URL.Path, "/disable") {
		status = "disabled"
	}
	if targetID == actor.ID {
		errorJSON(w, 400, "INVALID_OPERATION", "administrator cannot disable itself", nil)
		return
	}
	res, err := a.DB.Exec(`UPDATE users SET status=?,updated_at=? WHERE id=?`, status, time.Now().UTC().Format(time.RFC3339Nano), targetID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not update user status", nil)
		return
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		errorJSON(w, 404, "RESOURCE_NOT_FOUND", "user not found", nil)
		return
	}
	if status == "disabled" {
		_, _ = a.DB.Exec(`UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL`, time.Now().UTC().Format(time.RFC3339Nano), targetID)
	}
	a.recordAudit(actor.ID, targetID, "admin.set_user_status", map[string]any{"status": status})
	writeJSON(w, 200, map[string]any{"id": targetID, "status": status})
}

func (a *App) adminResetPassword(w http.ResponseWriter, r *http.Request, actor identity) {
	targetID := r.PathValue("id")
	var in struct{ Password, Reason string }
	if !decode(r, &in) || len(in.Password) < 8 {
		errorJSON(w, 400, "VALIDATION_ERROR", "password is required", nil)
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	res, err := a.DB.Exec(`UPDATE users SET password_hash=?,updated_at=? WHERE id=?`, hashPassword(in.Password), now, targetID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not reset password", nil)
		return
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		errorJSON(w, 404, "RESOURCE_NOT_FOUND", "user not found", nil)
		return
	}
	_, _ = a.DB.Exec(`UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL`, now, targetID)
	a.recordAudit(actor.ID, targetID, "admin.reset_password", nil)
	writeJSON(w, 200, map[string]any{"reset": true, "user_id": targetID})
}

func (a *App) adminDevices(w http.ResponseWriter, r *http.Request, actor identity) {
	targetID := r.PathValue("id")
	limit, err := parseLimit(r)
	if err != nil {
		errorJSON(w, 400, "VALIDATION_ERROR", err.Error(), nil)
		return
	}
	where := "user_id=? AND deleted_at IS NULL"
	args := []any{targetID}
	if value := r.URL.Query().Get("cursor"); value != "" {
		cursor, err := decodePageCursor(value)
		if err != nil {
			errorJSON(w, 400, "INVALID_CURSOR", "cursor is invalid", nil)
			return
		}
		where += " AND (last_active_at<? OR (last_active_at=? AND id<?))"
		args = append(args, cursor.Time, cursor.Time, cursor.ID)
	}
	args = append(args, limit+1)
	rows, err := a.DB.Query(`SELECT id,identifier,platform,name,app_version,last_active_at,is_online,created_at,updated_at FROM devices WHERE `+where+` ORDER BY last_active_at DESC,id DESC LIMIT ?`, args...)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not list devices", nil)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var deviceID, identifier, platform, name, version, last, created, updated string
		var online bool
		if err := rows.Scan(&deviceID, &identifier, &platform, &name, &version, &last, &online, &created, &updated); err != nil {
			errorJSON(w, 500, "INTERNAL_ERROR", "could not decode devices", nil)
			return
		}
		items = append(items, map[string]any{"id": deviceID, "identifier": identifier, "platform": platform, "name": name, "app_version": version, "last_active_at": last, "is_online": online, "created_at": created, "updated_at": updated})
	}
	items, next, more := finishPage(items, limit, "last_active_at")
	writeJSON(w, 200, map[string]any{"items": items, "next_cursor": next, "has_more": more})
}

func (a *App) adminAuditLogs(w http.ResponseWriter, r *http.Request, actor identity) {
	limit, err := parseLimit(r)
	if err != nil {
		errorJSON(w, 400, "VALIDATION_ERROR", err.Error(), nil)
		return
	}
	where := "1=1"
	args := []any{}
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
	rows, err := a.DB.Query(`SELECT id,COALESCE(actor_user_id,''),COALESCE(target_user_id,''),action,COALESCE(metadata_json,''),created_at FROM audit_logs WHERE `+where+` ORDER BY created_at DESC,id DESC LIMIT ?`, args...)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not list audit logs", nil)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var logID, actorID, targetID, action, metadata, created string
		if err := rows.Scan(&logID, &actorID, &targetID, &action, &metadata, &created); err != nil {
			errorJSON(w, 500, "INTERNAL_ERROR", "could not decode audit logs", nil)
			return
		}
		var parsed any
		if metadata != "" {
			if json.Unmarshal([]byte(metadata), &parsed) != nil {
				parsed = metadata
			}
		}
		items = append(items, map[string]any{"id": logID, "actor_user_id": nullIfEmpty(actorID), "target_user_id": nullIfEmpty(targetID), "action": action, "metadata": parsed, "created_at": created})
	}
	items, next, more := finishPage(items, limit, "created_at")
	writeJSON(w, 200, map[string]any{"items": items, "next_cursor": next, "has_more": more})
}

func (a *App) recordAudit(actorID, targetID, action string, metadata any) {
	encoded := ""
	if metadata != nil {
		if data, err := json.Marshal(metadata); err == nil {
			encoded = string(data)
		}
	}
	_, _ = a.DB.Exec(`INSERT INTO audit_logs(id,actor_user_id,target_user_id,action,metadata_json,created_at) VALUES(?,?,?,?,?,?)`, newID(), nullable(actorID), nullable(targetID), action, nullable(encoded), time.Now().UTC().Format(time.RFC3339Nano))
}

type sqlNullString struct {
	Valid  bool
	String string
}

func (v *sqlNullString) Scan(value any) error {
	if value == nil {
		v.Valid = false
		v.String = ""
		return nil
	}
	v.Valid = true
	v.String = fmt.Sprint(value)
	return nil
}
func (v sqlNullString) Value() any {
	if !v.Valid {
		return nil
	}
	return v.String
}
