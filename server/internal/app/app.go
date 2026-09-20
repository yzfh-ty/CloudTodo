package app

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"golang.org/x/crypto/argon2"
)

type App struct {
	DB          *sql.DB
	AccessTTL   time.Duration
	RefreshTTL  time.Duration
	AdminSecret string
}

type contextKey string

const userKey contextKey = "cloudtodo-user"

type identity struct {
	ID       string
	Role     string
	Session  string
	DeviceID sql.NullString
}

func EnsureAdmin(database *sql.DB) error {
	email := strings.ToLower(strings.TrimSpace(os.Getenv("CLOUDTODO_ADMIN_EMAIL")))
	password := os.Getenv("CLOUDTODO_ADMIN_PASSWORD")
	if email == "" || password == "" {
		return nil
	}
	username := strings.TrimSpace(os.Getenv("CLOUDTODO_ADMIN_USERNAME"))
	if username == "" {
		username = "admin"
	}
	nickname := strings.TrimSpace(os.Getenv("CLOUDTODO_ADMIN_NICKNAME"))
	if nickname == "" {
		nickname = username
	}
	var existing string
	err := database.QueryRow(`SELECT id FROM users WHERE email=? OR username=?`, email, username).Scan(&existing)
	if err == nil {
		return nil
	}
	if err != sql.ErrNoRows {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err = database.Exec(`INSERT INTO users(id,email,username,password_hash,nickname,timezone,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'admin','active',?,?)`, newID(), email, username, hashPassword(password), nickname, "Asia/Shanghai", now, now)
	return err
}

func New(database *sql.DB) *App {
	return &App{DB: database, AccessTTL: 30 * time.Minute, RefreshTTL: 30 * 24 * time.Hour}
}

func (a *App) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", a.health)
	mux.HandleFunc("GET /api/capabilities", a.capabilities)
	mux.HandleFunc("POST /api/auth/register", a.register)
	mux.HandleFunc("POST /api/auth/login", a.login)
	mux.HandleFunc("POST /api/auth/refresh", a.refresh)
	mux.HandleFunc("POST /api/auth/logout", a.logout)
	mux.HandleFunc("POST /api/auth/logout-all", a.logoutAll)
	mux.HandleFunc("GET /api/me", a.requireUser(a.me))
	mux.HandleFunc("PATCH /api/me", a.requireUser(a.updateMe))
	mux.HandleFunc("POST /api/me/change-password", a.requireUser(a.changePassword))
	mux.HandleFunc("GET /api/devices", a.requireUser(a.devices))
	mux.HandleFunc("PUT /api/devices/current", a.requireUser(a.updateDevice))
	mux.HandleFunc("POST /api/devices/current/heartbeat", a.requireUser(a.heartbeat))
	mux.HandleFunc("GET /api/lists", a.requireUser(a.lists))
	mux.HandleFunc("POST /api/lists", a.requireUser(a.lists))
	mux.HandleFunc("GET /api/lists/{id}", a.requireUser(a.list))
	mux.HandleFunc("PATCH /api/lists/{id}", a.requireUser(a.list))
	mux.HandleFunc("DELETE /api/lists/{id}", a.requireUser(a.list))
	mux.HandleFunc("GET /api/tags", a.requireUser(a.tags))
	mux.HandleFunc("POST /api/tags", a.requireUser(a.tags))
	mux.HandleFunc("GET /api/tags/{id}", a.requireUser(a.tag))
	mux.HandleFunc("PATCH /api/tags/{id}", a.requireUser(a.tag))
	mux.HandleFunc("DELETE /api/tags/{id}", a.requireUser(a.tag))
	mux.HandleFunc("GET /api/todos", a.requireUser(a.todos))
	mux.HandleFunc("POST /api/todos", a.requireUser(a.createTodo))
	mux.HandleFunc("GET /api/todos/{id}", a.requireUser(a.todo))
	mux.HandleFunc("PATCH /api/todos/{id}", a.requireUser(a.updateTodo))
	mux.HandleFunc("DELETE /api/todos/{id}", a.requireUser(a.deleteTodo))
	mux.HandleFunc("GET /api/todos/{id}/reminders", a.requireUser(a.reminders))
	mux.HandleFunc("POST /api/todos/{id}/reminders", a.requireUser(a.createReminder))
	mux.HandleFunc("GET /api/reminders/upcoming", a.requireUser(a.reminders))
	mux.HandleFunc("GET /api/reminders/{id}", a.requireUser(a.reminder))
	mux.HandleFunc("DELETE /api/reminders/{id}", a.requireUser(a.reminder))
	mux.HandleFunc("GET /api/reminder-events", a.requireUser(a.reminderEvents))
	mux.HandleFunc("POST /api/reminder-events/{id}/ack", a.requireUser(a.ackReminderEvent))
	mux.HandleFunc("GET /api/notification-subscriptions", a.requireUser(a.subscriptions))
	mux.HandleFunc("PUT /api/notification-subscriptions/{channel}", a.requireUser(a.putSubscription))
	mux.HandleFunc("POST /api/notification-subscriptions/{id}/test", a.requireUser(a.testSubscription))
	mux.HandleFunc("GET /api/notifications/email/unsubscribe", a.unsubscribeEmail)
	mux.HandleFunc("POST /api/notifications/email/unsubscribe", a.unsubscribeEmail)
	mux.HandleFunc("GET /api/me/export", a.requireUser(a.exportMe))
	mux.HandleFunc("DELETE /api/me", a.requireUser(a.deleteMe))
	mux.HandleFunc("GET /api/notification-deliveries", a.requireUser(a.deliveries))
	mux.HandleFunc("GET /api/sync/bootstrap", a.requireUser(a.syncBootstrap))
	mux.HandleFunc("GET /api/sync/changes", a.requireUser(a.syncChanges))
	mux.HandleFunc("POST /api/admin/auth/login", a.adminLogin)
	mux.HandleFunc("POST /api/admin/auth/refresh", a.adminRefresh)
	mux.HandleFunc("GET /api/admin/auth/me", a.requireAdmin(a.adminMe))
	mux.HandleFunc("POST /api/admin/auth/logout", a.requireAdmin(a.adminLogout))
	mux.HandleFunc("POST /api/admin/auth/logout-all", a.requireAdmin(a.adminLogoutAll))
	mux.HandleFunc("POST /api/admin/auth/change-password", a.requireAdmin(a.adminChangePassword))
	mux.HandleFunc("POST /api/admin/users", a.requireAdmin(a.adminCreateUser))
	mux.HandleFunc("GET /api/admin/users", a.requireAdmin(a.adminUsers))
	mux.HandleFunc("GET /api/admin/users/{id}", a.requireAdmin(a.adminUser))
	mux.HandleFunc("PATCH /api/admin/users/{id}", a.requireAdmin(a.adminUser))
	mux.HandleFunc("POST /api/admin/users/{id}/disable", a.requireAdmin(a.adminSetUserStatus))
	mux.HandleFunc("POST /api/admin/users/{id}/enable", a.requireAdmin(a.adminSetUserStatus))
	mux.HandleFunc("POST /api/admin/users/{id}/reset-password", a.requireAdmin(a.adminResetPassword))
	mux.HandleFunc("GET /api/admin/users/{id}/devices", a.requireAdmin(a.adminDevices))
	mux.HandleFunc("GET /api/admin/users/{id}/notification-subscriptions", a.requireAdmin(a.adminNotificationSubscriptions))
	mux.HandleFunc("GET /api/admin/users/{id}/notification-deliveries", a.requireAdmin(a.adminNotificationDeliveries))
	mux.HandleFunc("PATCH /api/admin/users/{id}/notification-subscriptions/{subscription_id}", a.requireAdmin(a.adminNotificationSubscription))
	mux.HandleFunc("DELETE /api/admin/users/{id}/notification-subscriptions/{subscription_id}", a.requireAdmin(a.adminNotificationSubscription))
	mux.HandleFunc("POST /api/admin/users/{id}/notification-subscriptions/{subscription_id}/enable", a.requireAdmin(a.adminNotificationSubscriptionStatus))
	mux.HandleFunc("POST /api/admin/users/{id}/notification-subscriptions/{subscription_id}/disable", a.requireAdmin(a.adminNotificationSubscriptionStatus))
	mux.HandleFunc("GET /api/admin/system/status", a.requireAdmin(a.adminStatus))
	mux.HandleFunc("GET /api/admin/notification-providers/{channel}", a.requireAdmin(a.provider))
	mux.HandleFunc("PATCH /api/admin/notification-providers/{channel}", a.requireAdmin(a.provider))
	mux.HandleFunc("POST /api/admin/notification-providers/{channel}/test", a.requireAdmin(a.providerTest))
	return requestID(jsonMiddleware(mux))
}

func requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if id == "" {
			id = newID()
		}
		w.Header().Set("X-Request-ID", id)
		next.ServeHTTP(w, r)
	})
}

func jsonMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		next.ServeHTTP(w, r)
	})
}

func (a *App) health(w http.ResponseWriter, r *http.Request) {
	if err := a.DB.PingContext(r.Context()); err != nil {
		errorJSON(w, http.StatusServiceUnavailable, "SERVICE_UNHEALTHY", "database unavailable", nil)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "service": "cloudtodo", "version": "0.1.0", "database": "ok", "time": time.Now().UTC()})
}

func (a *App) capabilities(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"server_version": "0.1.0", "api_base": "/api", "channels": map[string]bool{"local": true, "webhook": true, "email": false, "telegram": false}, "limits": map[string]int{"max_todos_per_page": 100, "max_webhook_subscriptions": 10}, "features": map[string]bool{"data_export": true, "account_deletion": true, "incremental_sync": true}})
}

func (a *App) register(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email, Username, Password, Nickname, Timezone string
		Device                                        deviceInput `json:"device"`
	}
	if !decode(r, &in) || len(in.Password) < 8 || in.Email == "" || in.Username == "" {
		errorJSON(w, 400, "VALIDATION_ERROR", "invalid registration request", nil)
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	id := newID()
	nickname := in.Nickname
	if nickname == "" {
		nickname = in.Username
	}
	timezone := in.Timezone
	if timezone == "" {
		timezone = "Asia/Shanghai"
	}
	_, err := a.DB.ExecContext(r.Context(), "INSERT INTO users(id,email,username,password_hash,nickname,timezone,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'user','active',?,?)", id, strings.ToLower(strings.TrimSpace(in.Email)), strings.TrimSpace(in.Username), hashPassword(in.Password), nickname, timezone, now, now)
	if err != nil {
		errorJSON(w, 409, "DUPLICATE_RESOURCE", "email or username already exists", nil)
		return
	}
	deviceID, err := a.upsertDevice(r, id, in.Device)
	if err != nil {
		errorJSON(w, 400, "VALIDATION_ERROR", err.Error(), nil)
		return
	}
	access, refresh, err := a.issueSession(r, id, deviceID, "user")
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not create session", nil)
		return
	}
	writeJSON(w, 201, map[string]any{"user": map[string]any{"id": id, "email": in.Email, "username": in.Username, "nickname": nickname, "timezone": timezone, "created_at": now, "updated_at": now}, "session": map[string]any{"access_token": access, "refresh_token": refresh}})
}

func (a *App) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Account, Password string
		Device            deviceInput `json:"device"`
	}
	if !decode(r, &in) {
		errorJSON(w, 400, "VALIDATION_ERROR", "invalid login request", nil)
		return
	}
	var id, email, username, nickname, timezone, passwordHash, status string
	err := a.DB.QueryRowContext(r.Context(), `SELECT id,email,username,nickname,timezone,password_hash,status FROM users WHERE email=? OR username=?`, strings.ToLower(strings.TrimSpace(in.Account)), strings.TrimSpace(in.Account)).Scan(&id, &email, &username, &nickname, &timezone, &passwordHash, &status)
	if err != nil || status != "active" || !verifyPassword(in.Password, passwordHash) {
		errorJSON(w, 401, "AUTH_INVALID_CREDENTIALS", "invalid credentials", nil)
		return
	}
	deviceID, err := a.upsertDevice(r, id, in.Device)
	if err != nil {
		errorJSON(w, 400, "VALIDATION_ERROR", err.Error(), nil)
		return
	}
	access, refresh, err := a.issueSession(r, id, deviceID, "user")
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not create session", nil)
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, _ = a.DB.Exec(`UPDATE users SET last_login_at=?,updated_at=? WHERE id=?`, now, now, id)
	writeJSON(w, 200, map[string]any{"user": map[string]any{"id": id, "email": email, "username": username, "nickname": nickname, "timezone": timezone}, "session": map[string]any{"access_token": access, "refresh_token": refresh}})
}

func (a *App) refresh(w http.ResponseWriter, r *http.Request) {
	var in struct {
		RefreshToken string `json:"refresh_token"`
	}
	if !decode(r, &in) || in.RefreshToken == "" {
		errorJSON(w, 400, "VALIDATION_ERROR", "refresh_token is required", nil)
		return
	}
	hash := tokenHash(in.RefreshToken)
	var id, device, kind, expires string
	err := a.DB.QueryRow(`SELECT user_id,COALESCE(device_id,''),kind,expires_at FROM sessions WHERE token_hash=? AND revoked_at IS NULL`, hash).Scan(&id, &device, &kind, &expires)
	if err != nil || kind != "refresh" {
		errorJSON(w, 401, "SESSION_EXPIRED", "refresh token is invalid", nil)
		return
	}
	exp, _ := time.Parse(time.RFC3339Nano, expires)
	if time.Now().After(exp) {
		errorJSON(w, 401, "SESSION_EXPIRED", "refresh token is expired", nil)
		return
	}
	_, _ = a.DB.Exec(`UPDATE sessions SET revoked_at=? WHERE token_hash=?`, time.Now().UTC().Format(time.RFC3339Nano), hash)
	access, newRefresh, err := a.issueSession(r, id, sql.NullString{String: device, Valid: device != ""}, "user")
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not refresh session", nil)
		return
	}
	writeJSON(w, 200, map[string]any{"session": map[string]any{"access_token": access, "refresh_token": newRefresh}})
}

func (a *App) logout(w http.ResponseWriter, r *http.Request) {
	a.revokeFromRequest(r)
	writeJSON(w, 200, map[string]any{"logged_out": true})
}
func (a *App) logoutAll(w http.ResponseWriter, r *http.Request) {
	id, ok := a.identity(r)
	if !ok {
		errorJSON(w, 401, "AUTH_REQUIRED", "authentication required", nil)
		return
	}
	_, _ = a.DB.Exec(`UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL`, time.Now().UTC().Format(time.RFC3339Nano), id.ID)
	writeJSON(w, 200, map[string]any{"logged_out": true})
}

func (a *App) me(w http.ResponseWriter, r *http.Request, id identity) {
	var email, username, nickname, timezone, created, updated string
	if err := a.DB.QueryRow(`SELECT email,username,nickname,timezone,created_at,updated_at FROM users WHERE id=?`, id.ID).Scan(&email, &username, &nickname, &timezone, &created, &updated); err != nil {
		errorJSON(w, 404, "RESOURCE_NOT_FOUND", "user not found", nil)
		return
	}
	writeJSON(w, 200, map[string]any{"user": map[string]any{"id": id.ID, "email": email, "username": username, "nickname": nickname, "timezone": timezone, "created_at": created, "updated_at": updated}})
}
func (a *App) updateMe(w http.ResponseWriter, r *http.Request, id identity) {
	var in struct{ Nickname, Timezone string }
	if !decode(r, &in) {
		errorJSON(w, 400, "VALIDATION_ERROR", "invalid request", nil)
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, err := a.DB.Exec(`UPDATE users SET nickname=COALESCE(NULLIF(?,''),nickname),timezone=COALESCE(NULLIF(?,''),timezone),updated_at=? WHERE id=?`, in.Nickname, in.Timezone, now, id.ID)
	if err != nil {
		errorJSON(w, 400, "VALIDATION_ERROR", "could not update profile", nil)
		return
	}
	a.me(w, r, id)
}
func (a *App) changePassword(w http.ResponseWriter, r *http.Request, id identity) {
	var in struct{ CurrentPassword, NewPassword string }
	if !decode(r, &in) || len(in.NewPassword) < 8 {
		errorJSON(w, 400, "VALIDATION_ERROR", "invalid password request", nil)
		return
	}
	var old string
	if err := a.DB.QueryRow(`SELECT password_hash FROM users WHERE id=?`, id.ID).Scan(&old); err != nil || !verifyPassword(in.CurrentPassword, old) {
		errorJSON(w, 401, "AUTH_INVALID_CREDENTIALS", "current password is invalid", nil)
		return
	}
	_, _ = a.DB.Exec(`UPDATE users SET password_hash=?,updated_at=? WHERE id=?`, hashPassword(in.NewPassword), time.Now().UTC().Format(time.RFC3339Nano), id.ID)
	_, _ = a.DB.Exec(`UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL`, time.Now().UTC().Format(time.RFC3339Nano), id.ID)
	writeJSON(w, 200, map[string]any{"changed": true})
}

type deviceInput struct {
	Identifier, Platform, Name, AppVersion, PushToken string
}

func (d *deviceInput) UnmarshalJSON(b []byte) error {
	var x map[string]string
	if err := json.Unmarshal(b, &x); err != nil {
		return err
	}
	d.Identifier = x["identifier"]
	d.Platform = x["platform"]
	d.Name = x["name"]
	d.AppVersion = x["app_version"]
	d.PushToken = x["push_token"]
	return nil
}
func (a *App) upsertDevice(r *http.Request, userID string, in deviceInput) (sql.NullString, error) {
	if in.Identifier == "" {
		return sql.NullString{}, errors.New("device.identifier is required")
	}
	if in.Platform == "" {
		in.Platform = "unknown"
	}
	if in.Name == "" {
		in.Name = in.Platform
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	var id string
	err := a.DB.QueryRow(`SELECT id FROM devices WHERE user_id=? AND identifier=?`, userID, in.Identifier).Scan(&id)
	if err == sql.ErrNoRows {
		id = newID()
		_, err = a.DB.Exec(`INSERT INTO devices(id,user_id,identifier,platform,name,app_version,push_token,last_active_at,is_online,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?,?)`, id, userID, in.Identifier, in.Platform, in.Name, in.AppVersion, in.PushToken, now, now, now)
	} else if err == nil {
		_, err = a.DB.Exec(`UPDATE devices SET platform=?,name=?,app_version=?,push_token=?,last_active_at=?,is_online=1,updated_at=? WHERE id=?`, in.Platform, in.Name, in.AppVersion, in.PushToken, now, now, id)
	}
	return sql.NullString{String: id, Valid: err == nil}, err
}
func (a *App) devices(w http.ResponseWriter, r *http.Request, id identity) {
	rows, err := a.DB.Query(`SELECT id,identifier,platform,name,app_version,last_active_at,is_online,created_at,updated_at FROM devices WHERE user_id=? ORDER BY last_active_at DESC`, id.ID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not list devices", nil)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var did, ident, plat, name, ver, last, created, updated string
		var online bool
		_ = rows.Scan(&did, &ident, &plat, &name, &ver, &last, &online, &created, &updated)
		items = append(items, map[string]any{"id": did, "identifier": ident, "platform": plat, "name": name, "app_version": ver, "last_active_at": last, "is_online": online, "created_at": created, "updated_at": updated})
	}
	writeJSON(w, 200, map[string]any{"items": items, "next_cursor": nil, "has_more": false})
}
func (a *App) updateDevice(w http.ResponseWriter, r *http.Request, id identity) {
	var in deviceInput
	if !decode(r, &in) {
		errorJSON(w, 400, "VALIDATION_ERROR", "invalid device request", nil)
		return
	}
	device, err := a.upsertDevice(r, id.ID, in)
	if err != nil {
		errorJSON(w, 400, "VALIDATION_ERROR", err.Error(), nil)
		return
	}
	writeJSON(w, 200, map[string]any{"device_id": device.String})
}
func (a *App) heartbeat(w http.ResponseWriter, r *http.Request, id identity) {
	_, _ = a.DB.Exec(`UPDATE devices SET last_active_at=?,is_online=1,updated_at=? WHERE user_id=?`, time.Now().UTC().Format(time.RFC3339Nano), time.Now().UTC().Format(time.RFC3339Nano), id.ID)
	writeJSON(w, 200, map[string]any{"ok": true})
}

func (a *App) todos(w http.ResponseWriter, r *http.Request, id identity) {
	rows, err := a.DB.Query(`SELECT id,title,COALESCE(description,''),status,priority,COALESCE(due_at,''),is_all_day,version,created_at,updated_at,COALESCE(deleted_at,'') FROM todos WHERE user_id=? ORDER BY updated_at DESC LIMIT 100`, id.ID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not list todos", nil)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var tid, title, desc, status, priority, due, created, updated, deleted string
		var all bool
		var version int
		_ = rows.Scan(&tid, &title, &desc, &status, &priority, &due, &all, &version, &created, &updated, &deleted)
		items = append(items, map[string]any{"id": tid, "title": title, "description": desc, "status": status, "priority": priority, "due_at": nullIfEmpty(due), "is_all_day": all, "version": version, "created_at": created, "updated_at": updated, "deleted_at": nullIfEmpty(deleted)})
	}
	writeJSON(w, 200, map[string]any{"items": items, "next_cursor": nil, "has_more": false})
}
func (a *App) createTodo(w http.ResponseWriter, r *http.Request, id identity) {
	var in struct {
		Title, Description, ListID, Priority, DueAt string
		IsAllDay                                    bool
	}
	if !decode(r, &in) || strings.TrimSpace(in.Title) == "" {
		errorJSON(w, 400, "VALIDATION_ERROR", "title is required", nil)
		return
	}
	if in.Priority == "" {
		in.Priority = "medium"
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	tid := newID()
	_, err := a.DB.Exec(`INSERT INTO todos(id,user_id,list_id,title,description,status,priority,due_at,is_all_day,version,created_at,updated_at) VALUES(?,?,?,?,?,'pending',?,?,?,1,?,?)`, tid, id.ID, nullable(in.ListID), strings.TrimSpace(in.Title), nullable(in.Description), in.Priority, nullable(in.DueAt), in.IsAllDay, now, now)
	if err != nil {
		errorJSON(w, 400, "VALIDATION_ERROR", "could not create todo", nil)
		return
	}
	writeJSON(w, 201, map[string]any{"id": tid, "title": strings.TrimSpace(in.Title), "status": "pending", "priority": in.Priority, "version": 1, "created_at": now, "updated_at": now})
}
func (a *App) todo(w http.ResponseWriter, r *http.Request, id identity) {
	tid := r.PathValue("id")
	var title, desc, status, priority, due, created, updated, deleted string
	var all bool
	var version int
	err := a.DB.QueryRow(`SELECT title,COALESCE(description,''),status,priority,COALESCE(due_at,''),is_all_day,version,created_at,updated_at,COALESCE(deleted_at,'') FROM todos WHERE id=? AND user_id=?`, tid, id.ID).Scan(&title, &desc, &status, &priority, &due, &all, &version, &created, &updated, &deleted)
	if err != nil {
		errorJSON(w, 404, "RESOURCE_NOT_FOUND", "todo not found", nil)
		return
	}
	writeJSON(w, 200, map[string]any{"id": tid, "title": title, "description": desc, "status": status, "priority": priority, "due_at": nullIfEmpty(due), "is_all_day": all, "version": version, "created_at": created, "updated_at": updated, "deleted_at": nullIfEmpty(deleted)})
}
func (a *App) updateTodo(w http.ResponseWriter, r *http.Request, id identity) {
	tid := r.PathValue("id")
	var in struct {
		Title, Description, Status, Priority string
		Version                              int
	}
	if !decode(r, &in) || in.Version < 1 {
		errorJSON(w, 400, "VALIDATION_ERROR", "version is required", nil)
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	res, err := a.DB.Exec(`UPDATE todos SET title=COALESCE(NULLIF(?,''),title),description=COALESCE(?,description),status=COALESCE(NULLIF(?,''),status),priority=COALESCE(NULLIF(?,''),priority),version=version+1,updated_at=? WHERE id=? AND user_id=? AND version=?`, in.Title, in.Description, in.Status, in.Priority, now, tid, id.ID, in.Version)
	if err != nil {
		errorJSON(w, 400, "VALIDATION_ERROR", "could not update todo", nil)
		return
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		errorJSON(w, 409, "RESOURCE_VERSION_CONFLICT", "resource version conflict", nil)
		return
	}
	a.todo(w, r, id)
}
func (a *App) deleteTodo(w http.ResponseWriter, r *http.Request, id identity) {
	tid := r.PathValue("id")
	now := time.Now().UTC().Format(time.RFC3339Nano)
	res, err := a.DB.Exec(`UPDATE todos SET status='deleted',deleted_at=?,version=version+1,updated_at=? WHERE id=? AND user_id=? AND status!='deleted'`, now, now, tid, id.ID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not delete todo", nil)
		return
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		errorJSON(w, 404, "RESOURCE_NOT_FOUND", "todo not found", nil)
		return
	}
	writeJSON(w, 200, map[string]any{"deleted": true})
}

func (a *App) subscriptions(w http.ResponseWriter, r *http.Request, id identity) {
	rows, err := a.DB.Query(`SELECT id,channel,enabled,COALESCE(email,''),COALESCE(target_url,''),COALESCE(chat_id,''),version,created_at,updated_at FROM notification_subscriptions WHERE user_id=? ORDER BY channel`, id.ID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not list subscriptions", nil)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var sid, channel, email, url, chat, created, updated string
		var enabled bool
		var version int
		_ = rows.Scan(&sid, &channel, &enabled, &email, &url, &chat, &version, &created, &updated)
		items = append(items, map[string]any{"id": sid, "channel": channel, "enabled": enabled, "email": nullIfEmpty(email), "target_url": nullIfEmpty(url), "chat_id": nullIfEmpty(chat), "version": version, "created_at": created, "updated_at": updated})
	}
	writeJSON(w, 200, map[string]any{"items": items, "next_cursor": nil, "has_more": false})
}
func (a *App) putSubscription(w http.ResponseWriter, r *http.Request, id identity) {
	channel := r.PathValue("channel")
	var in struct {
		Enabled                          bool
		Email, TargetURL, Secret, ChatID string
	}
	if !decode(r, &in) {
		errorJSON(w, 400, "VALIDATION_ERROR", "invalid subscription request", nil)
		return
	}
	if channel != "webhook" && channel != "email" && channel != "telegram" {
		errorJSON(w, 400, "VALIDATION_ERROR", "unsupported notification channel", nil)
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	var sid string
	err := a.DB.QueryRow(`SELECT id FROM notification_subscriptions WHERE user_id=? AND channel=?`, id.ID, channel).Scan(&sid)
	if err == sql.ErrNoRows {
		sid = newID()
		_, err = a.DB.Exec(`INSERT INTO notification_subscriptions(id,user_id,channel,enabled,email,target_url,secret,chat_id,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?,?)`, sid, id.ID, channel, in.Enabled, nullable(in.Email), nullable(in.TargetURL), nullable(in.Secret), nullable(in.ChatID), now, now)
	} else if err == nil {
		_, err = a.DB.Exec(`UPDATE notification_subscriptions SET enabled=?,email=COALESCE(NULLIF(?,''),email),target_url=COALESCE(NULLIF(?,''),target_url),secret=COALESCE(NULLIF(?,''),secret),chat_id=COALESCE(NULLIF(?,''),chat_id),version=version+1,updated_at=? WHERE id=? AND user_id=?`, in.Enabled, in.Email, in.TargetURL, in.Secret, in.ChatID, now, sid, id.ID)
	}
	if err != nil {
		errorJSON(w, 400, "VALIDATION_ERROR", "could not save subscription", nil)
		return
	}
	writeJSON(w, 200, map[string]any{"id": sid, "channel": channel, "enabled": in.Enabled})
}

func (a *App) syncBootstrapLegacy(w http.ResponseWriter, r *http.Request, id identity) {
	writeJSON(w, 200, map[string]any{"snapshot_at": time.Now().UTC(), "cursor": time.Now().UTC().Format(time.RFC3339Nano), "lists": []any{}, "tags": []any{}, "todos": []any{}, "reminders": []any{}, "notification_subscriptions": []any{}})
}
func (a *App) syncChangesLegacy(w http.ResponseWriter, r *http.Request, id identity) {
	writeJSON(w, 200, map[string]any{"items": []any{}, "next_cursor": r.URL.Query().Get("cursor"), "has_more": false})
}

func (a *App) adminLogin(w http.ResponseWriter, r *http.Request) {
	var in struct{ Account, Password string }
	if !decode(r, &in) {
		errorJSON(w, 400, "VALIDATION_ERROR", "invalid login request", nil)
		return
	}
	var id, email, username, passwordHash, status, role string
	err := a.DB.QueryRow(`SELECT id,email,username,password_hash,status,role FROM users WHERE email=? OR username=?`, strings.ToLower(strings.TrimSpace(in.Account)), strings.TrimSpace(in.Account)).Scan(&id, &email, &username, &passwordHash, &status, &role)
	if err != nil || role != "admin" || status != "active" || !verifyPassword(in.Password, passwordHash) {
		errorJSON(w, 401, "AUTH_INVALID_CREDENTIALS", "invalid administrator credentials", nil)
		return
	}
	access, refresh, err := a.issueSession(r, id, sql.NullString{}, "admin")
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not create admin session", nil)
		return
	}
	writeJSON(w, 200, map[string]any{"admin": map[string]any{"id": id, "email": email, "username": username, "role": role, "status": status}, "session": map[string]any{"access_token": access, "refresh_token": refresh}})
}
func (a *App) adminRefresh(w http.ResponseWriter, r *http.Request) { a.refresh(w, r) }
func (a *App) adminMe(w http.ResponseWriter, r *http.Request, id identity) {
	var email, username, status string
	err := a.DB.QueryRow(`SELECT email,username,status FROM users WHERE id=?`, id.ID).Scan(&email, &username, &status)
	if err != nil {
		errorJSON(w, 404, "RESOURCE_NOT_FOUND", "administrator not found", nil)
		return
	}
	writeJSON(w, 200, map[string]any{"admin": map[string]any{"id": id.ID, "email": email, "username": username, "role": "admin", "status": status}})
}
func (a *App) adminLogout(w http.ResponseWriter, r *http.Request, id identity) {
	a.revokeFromRequest(r)
	writeJSON(w, 200, map[string]any{"logged_out": true})
}
func (a *App) adminUsers(w http.ResponseWriter, r *http.Request, id identity) {
	rows, err := a.DB.Query(`SELECT id,email,username,nickname,timezone,role,status,created_at,updated_at,last_login_at FROM users ORDER BY created_at DESC LIMIT 100`)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not list users", nil)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var uid, email, username, nickname, timezone, role, status, created, updated string
		var last sql.NullString
		_ = rows.Scan(&uid, &email, &username, &nickname, &timezone, &role, &status, &created, &updated, &last)
		items = append(items, map[string]any{"id": uid, "email": email, "username": username, "nickname": nickname, "timezone": timezone, "role": role, "status": status, "created_at": created, "updated_at": updated, "last_login_at": nullString(last)})
	}
	writeJSON(w, 200, map[string]any{"items": items, "next_cursor": nil, "has_more": false})
}
func (a *App) adminStatus(w http.ResponseWriter, r *http.Request, id identity) {
	var size int64
	_ = a.DB.QueryRow(`SELECT COALESCE(SUM(pgsize),0) FROM dbstat`).Scan(&size)
	writeJSON(w, 200, map[string]any{"server_version": "0.1.0", "database": map[string]any{"engine": "sqlite", "status": "ok", "size_bytes": size}, "providers": map[string]any{"email": map[string]any{"enabled": false, "configured": false}, "telegram": map[string]any{"enabled": false, "configured": false}}, "scheduler": map[string]any{"enabled": false}})
}

func (a *App) requireUser(next func(http.ResponseWriter, *http.Request, identity)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := a.identity(r)
		if !ok || id.Role != "user" {
			errorJSON(w, 401, "AUTH_REQUIRED", "authentication required", nil)
			return
		}
		next(w, r, id)
	}
}
func (a *App) requireAdmin(next func(http.ResponseWriter, *http.Request, identity)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, ok := a.identity(r)
		if !ok || id.Role != "admin" {
			errorJSON(w, 401, "ADMIN_AUTH_REQUIRED", "administrator authentication required", nil)
			return
		}
		next(w, r, id)
	}
}
func (a *App) identity(r *http.Request) (identity, bool) {
	token := ""
	auth := r.Header.Get("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		token = strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
	}
	if token == "" {
		if c, err := r.Cookie("cloudtodo_access"); err == nil {
			token = c.Value
		}
	}
	if token == "" {
		return identity{}, false
	}
	var id, role, kind string
	var device sql.NullString
	var expires string
	err := a.DB.QueryRow(`SELECT s.user_id,u.role,s.kind,s.device_id,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL`, tokenHash(token)).Scan(&id, &role, &kind, &device, &expires)
	if err != nil || kind != "access" {
		return identity{}, false
	}
	t, err := time.Parse(time.RFC3339Nano, expires)
	if err != nil || time.Now().After(t) {
		return identity{}, false
	}
	return identity{ID: id, Role: role, DeviceID: device}, true
}
func (a *App) issueSession(r *http.Request, userID string, device sql.NullString, role string) (string, string, error) {
	access := newToken()
	refresh := newToken()
	now := time.Now().UTC()
	_, err := a.DB.Exec(`INSERT INTO sessions(id,user_id,device_id,kind,token_hash,expires_at,created_at) VALUES(?,?,?,?,?,?,?)`, newID(), userID, device, `access`, tokenHash(access), now.Add(a.AccessTTL).Format(time.RFC3339Nano), now.Format(time.RFC3339Nano))
	if err != nil {
		return "", "", err
	}
	_, err = a.DB.Exec(`INSERT INTO sessions(id,user_id,device_id,kind,token_hash,expires_at,created_at) VALUES(?,?,?,?,?,?,?)`, newID(), userID, device, `refresh`, tokenHash(refresh), now.Add(a.RefreshTTL).Format(time.RFC3339Nano), now.Format(time.RFC3339Nano))
	return access, refresh, err
}
func (a *App) revokeFromRequest(r *http.Request) {
	token := ""
	if c, err := r.Cookie("cloudtodo_access"); err == nil {
		token = c.Value
	}
	if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
		token = strings.TrimPrefix(auth, "Bearer ")
	}
	if token != "" {
		_, _ = a.DB.Exec(`UPDATE sessions SET revoked_at=? WHERE token_hash=?`, time.Now().UTC().Format(time.RFC3339Nano), tokenHash(token))
	}
}

func decode(r *http.Request, v any) bool {
	return json.NewDecoder(io.LimitReader(r.Body, 2<<20)).Decode(v) == nil
}
func writeJSON(w http.ResponseWriter, status int, data any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"code": map[int]string{200: "OK", 201: "OK"}[status], "message": "success", "data": data})
}
func errorJSON(w http.ResponseWriter, status int, code, message string, details any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"code": code, "message": message, "details": details})
}
func newID() string             { b := make([]byte, 16); _, _ = rand.Read(b); return hex.EncodeToString(b) }
func newToken() string          { b := make([]byte, 32); _, _ = rand.Read(b); return hex.EncodeToString(b) }
func tokenHash(v string) string { h := sha256.Sum256([]byte(v)); return hex.EncodeToString(h[:]) }
func hashPassword(password string) string {
	salt := make([]byte, 16)
	_, _ = rand.Read(salt)
	key := argon2.IDKey([]byte(password), salt, 1, 64*1024, 4, 32)
	return "argon2id$" + hex.EncodeToString(salt) + "$" + hex.EncodeToString(key)
}
func verifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 3 || parts[0] != "argon2id" {
		return false
	}
	salt, err1 := hex.DecodeString(parts[1])
	expected, err2 := hex.DecodeString(parts[2])
	if err1 != nil || err2 != nil {
		return false
	}
	actual := argon2.IDKey([]byte(password), salt, 1, 64*1024, 4, 32)
	return subtle.ConstantTimeCompare(actual, expected) == 1
}
func nullable(v string) any {
	if v == "" {
		return nil
	}
	return v
}
func nullIfEmpty(v string) any {
	if v == "" {
		return nil
	}
	return v
}
func nullString(v sql.NullString) any {
	if !v.Valid {
		return nil
	}
	return v.String
}
