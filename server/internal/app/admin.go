package app

import (
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
	var in struct{ CurrentPassword, NewPassword string }
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
	writeJSON(w, 200, map[string]any{"reset": true, "user_id": targetID})
}

func (a *App) adminDevices(w http.ResponseWriter, r *http.Request, actor identity) {
	targetID := r.PathValue("id")
	rows, err := a.DB.Query(`SELECT id,identifier,platform,name,app_version,last_active_at,is_online,created_at,updated_at FROM devices WHERE user_id=? ORDER BY last_active_at DESC`, targetID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not list devices", nil)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var deviceID, identifier, platform, name, version, last, created, updated string
		var online bool
		_ = rows.Scan(&deviceID, &identifier, &platform, &name, &version, &last, &online, &created, &updated)
		items = append(items, map[string]any{"id": deviceID, "identifier": identifier, "platform": platform, "name": name, "app_version": version, "last_active_at": last, "is_online": online, "created_at": created, "updated_at": updated})
	}
	writeJSON(w, 200, map[string]any{"items": items, "next_cursor": nil, "has_more": false})
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
