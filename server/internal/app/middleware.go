package app

import (
	"database/sql"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

type rateWindow struct {
	started time.Time
	count   int
}
type requestRateLimiter struct {
	mu      sync.Mutex
	windows map[string]rateWindow
}

func newRequestRateLimiter() *requestRateLimiter {
	return &requestRateLimiter{windows: map[string]rateWindow{}}
}
func (l *requestRateLimiter) allow(key string, max int) bool {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	window := l.windows[key]
	if window.started.IsZero() || now.Sub(window.started) >= time.Minute {
		window = rateWindow{started: now}
	}
	window.count++
	l.windows[key] = window
	return window.count <= max
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && corsOriginAllowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key, X-CSRF-Token, X-Request-ID")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
			w.Header().Add("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func corsOriginAllowed(origin string) bool {
	for _, configured := range strings.Split(os.Getenv("CLOUDTODO_CORS_ORIGINS"), ",") {
		if strings.TrimSpace(configured) == origin {
			return true
		}
	}
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Hostname() == "" {
		return false
	}
	return parsed.Scheme == "http" && (parsed.Hostname() == "localhost" || parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "::1")
}
func idempotencyMiddleware(database *sql.DB, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
		if r.Method != http.MethodPost || key == "" || !isIdempotentPath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		scope := requestScope(r)
		var status int
		var body, expires string
		if err := database.QueryRow(`SELECT response_status,response_body,expires_at FROM idempotency_keys WHERE scope=? AND idempotency_key=? AND path=?`, scope, key, r.URL.Path).Scan(&status, &body, &expires); err == nil {
			if expiry, parseErr := time.Parse(time.RFC3339Nano, expires); parseErr == nil && time.Now().Before(expiry) {
				w.Header().Set("Content-Type", "application/json; charset=utf-8")
				w.WriteHeader(status)
				_, _ = w.Write([]byte(body))
				return
			}
		}
		recorder := httptest.NewRecorder()
		next.ServeHTTP(recorder, r)
		for name, values := range recorder.Header() {
			for _, value := range values {
				w.Header().Add(name, value)
			}
		}
		result := recorder.Result()
		data, _ := io.ReadAll(result.Body)
		result.Body.Close()
		w.WriteHeader(recorder.Code)
		_, _ = w.Write(data)
		if recorder.Code < 500 {
			_, _ = database.Exec(`INSERT OR REPLACE INTO idempotency_keys(scope,idempotency_key,path,response_status,response_body,created_at,expires_at) VALUES(?,?,?,?,?,?,?)`, scope, key, r.URL.Path, recorder.Code, string(data), time.Now().UTC().Format(time.RFC3339Nano), time.Now().UTC().Add(24*time.Hour).Format(time.RFC3339Nano))
		}
	})
}

func isIdempotentPath(path string) bool {
	return path == "/api/todos" || path == "/api/lists" || path == "/api/tags" || strings.Contains(path, "/reminders") || strings.HasSuffix(path, "/test") || strings.HasSuffix(path, "/reset-password") || path == "/api/admin/users"
}
func requestScope(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return tokenHash(strings.TrimSpace(strings.TrimPrefix(auth, "Bearer ")))
	}
	for _, name := range []string{"cloudtodo_access", "cloudtodo_admin_access"} {
		if c, err := r.Cookie(name); err == nil && c.Value != "" {
			return tokenHash(c.Value)
		}
	}
	return "anonymous"
}

func rateLimitMiddleware(next http.Handler) http.Handler {
	limiter := newRequestRateLimiter()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isRateLimitedPath(r.URL.Path) {
			key := clientAddress(r) + "|" + r.Method + "|" + r.URL.Path
			if !limiter.allow(key, 30) {
				errorJSON(w, http.StatusTooManyRequests, "RATE_LIMITED", "too many requests", nil)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
func isRateLimitedPath(path string) bool {
	return strings.HasPrefix(path, "/api/auth/") || strings.HasPrefix(path, "/api/admin/auth/") || strings.HasSuffix(path, "/reset-password") || strings.HasSuffix(path, "/notification-providers/email/test") || strings.HasSuffix(path, "/notification-providers/telegram/test") || path == "/api/me/export"
}
func clientAddress(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

func csrfMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions && r.Header.Get("Authorization") == "" && !csrfExemptPath(r.URL.Path) && (hasCookie(r, "cloudtodo_access") || hasCookie(r, "cloudtodo_admin_access")) {
			csrf, _ := r.Cookie("cloudtodo_csrf")
			if csrf == nil || csrf.Value == "" || csrf.Value != r.Header.Get("X-CSRF-Token") {
				errorJSON(w, http.StatusForbidden, "CSRF_REQUIRED", "csrf token is required", nil)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}
func csrfExemptPath(path string) bool {
	return path == "/api/auth/login" || path == "/api/admin/auth/login"
}
func hasCookie(r *http.Request, name string) bool {
	cookie, err := r.Cookie(name)
	return err == nil && cookie.Value != ""
}

func setSessionCookies(w http.ResponseWriter, r *http.Request, role, access, refresh string) {
	accessName, refreshName := "cloudtodo_access", "cloudtodo_refresh"
	if role == "admin" {
		accessName, refreshName = "cloudtodo_admin_access", "cloudtodo_admin_refresh"
	}
	secure := r.TLS != nil
	cookie := func(name, value string, maxAge int, httpOnly bool) {
		http.SetCookie(w, &http.Cookie{Name: name, Value: value, Path: "/", MaxAge: maxAge, HttpOnly: httpOnly, Secure: secure, SameSite: http.SameSiteLaxMode})
	}
	csrfToken := newToken()
	cookie(accessName, access, 30*60, true)
	cookie(refreshName, refresh, 30*24*60*60, true)
	cookie("cloudtodo_csrf", csrfToken, 30*24*60*60, false)
	hintName := "cloudtodo_user_csrf_token"
	if role == "admin" {
		hintName = "cloudtodo_admin_csrf_token"
	}
	cookie(hintName, csrfToken, 30*24*60*60, false)
}

func clearSessionCookies(w http.ResponseWriter) {
	for _, name := range []string{"cloudtodo_access", "cloudtodo_refresh", "cloudtodo_admin_access", "cloudtodo_admin_refresh", "cloudtodo_csrf", "cloudtodo_user_csrf_token", "cloudtodo_admin_csrf_token"} {
		http.SetCookie(w, &http.Cookie{Name: name, Value: "", Path: "/", MaxAge: -1, HttpOnly: name != "cloudtodo_csrf" && name != "cloudtodo_user_csrf_token" && name != "cloudtodo_admin_csrf_token", SameSite: http.SameSiteLaxMode})
	}
}
