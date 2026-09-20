package app

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type providerConfig struct {
	Enabled   bool   `json:"enabled"`
	SMTPHost  string `json:"smtp_host,omitempty"`
	SMTPPort  string `json:"smtp_port,omitempty"`
	SMTPUser  string `json:"smtp_username,omitempty"`
	SMTPPass  string `json:"smtp_password,omitempty"`
	SMTPFrom  string `json:"smtp_from,omitempty"`
	BotToken  string `json:"bot_token,omitempty"`
	BotName   string `json:"bot_name,omitempty"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

func (a *App) provider(w http.ResponseWriter, r *http.Request, id identity) {
	channel := r.PathValue("channel")
	if channel != "email" && channel != "telegram" {
		errorJSON(w, 400, "VALIDATION_ERROR", "unsupported provider", nil)
		return
	}
	if r.Method == http.MethodGet {
		cfg, _ := a.loadProvider(channel)
		writeJSON(w, 200, providerPublic(channel, cfg))
		return
	}
	if r.Method == http.MethodPatch {
		var cfg providerConfig
		if !decode(r, &cfg) {
			errorJSON(w, 400, "VALIDATION_ERROR", "invalid provider configuration", nil)
			return
		}
		cfg.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
		if err := a.saveProvider(channel, cfg); err != nil {
			errorJSON(w, 400, "PROVIDER_CONFIG_NOT_SAVED", err.Error(), nil)
			return
		}
		writeJSON(w, 200, providerPublic(channel, cfg))
		return
	}
	errorJSON(w, 405, "METHOD_NOT_ALLOWED", "method not allowed", nil)
}

func (a *App) providerTest(w http.ResponseWriter, r *http.Request, id identity) {
	channel := r.PathValue("channel")
	cfg, err := a.loadProvider(channel)
	if err != nil || !cfg.Enabled {
		errorJSON(w, 400, "PROVIDER_NOT_CONFIGURED", "provider is not configured", nil)
		return
	}
	if channel == "email" {
		if a.deliverEmailWithConfig(cfg, "test@example.invalid", reminderPayload{EventID: newID(), EventType: "notification.test", TriggeredAt: time.Now().UTC().Format(time.RFC3339Nano), UserID: id.ID, TodoTitle: "CloudTodo provider test"}) != "" {
			errorJSON(w, 502, "EMAIL_DELIVERY_FAILED", "email provider test failed", nil)
			return
		}
	}
	if channel == "telegram" {
		if a.deliverTelegramWithConfig(cfg, "", reminderPayload{EventID: newID(), EventType: "notification.test", TriggeredAt: time.Now().UTC().Format(time.RFC3339Nano), UserID: id.ID, TodoTitle: "CloudTodo provider test"}) != "" {
			errorJSON(w, 502, "TELEGRAM_DELIVERY_FAILED", "telegram provider test failed", nil)
			return
		}
	}
	writeJSON(w, 200, map[string]any{"tested": true, "channel": channel})
}

func (a *App) loadProvider(channel string) (providerConfig, error) {
	var encrypted string
	err := a.DB.QueryRow(`SELECT value FROM app_settings WHERE key=?`, "provider:"+channel).Scan(&encrypted)
	if err == nil {
		plain, err := decryptSetting(encrypted)
		if err != nil {
			return providerConfig{}, err
		}
		var cfg providerConfig
		err = json.Unmarshal([]byte(plain), &cfg)
		return cfg, err
	}
	if err != sql.ErrNoRows {
		return providerConfig{}, err
	}
	return providerFromEnv(channel), nil
}

func (a *App) saveProvider(channel string, cfg providerConfig) error {
	key := os.Getenv("CLOUDTODO_SETTINGS_KEY")
	if len(key) < 16 {
		return fmt.Errorf("CLOUDTODO_SETTINGS_KEY must be configured")
	}
	plain, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	value, err := encryptSetting(string(plain))
	if err != nil {
		return err
	}
	_, err = a.DB.Exec(`INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`, "provider:"+channel, value, cfg.UpdatedAt)
	return err
}

func providerFromEnv(channel string) providerConfig {
	if channel == "email" {
		return providerConfig{Enabled: os.Getenv("CLOUDTODO_SMTP_HOST") != "" && os.Getenv("CLOUDTODO_SMTP_FROM") != "", SMTPHost: os.Getenv("CLOUDTODO_SMTP_HOST"), SMTPPort: os.Getenv("CLOUDTODO_SMTP_PORT"), SMTPUser: os.Getenv("CLOUDTODO_SMTP_USERNAME"), SMTPPass: os.Getenv("CLOUDTODO_SMTP_PASSWORD"), SMTPFrom: os.Getenv("CLOUDTODO_SMTP_FROM")}
	}
	return providerConfig{Enabled: os.Getenv("CLOUDTODO_TELEGRAM_BOT_TOKEN") != "", BotToken: os.Getenv("CLOUDTODO_TELEGRAM_BOT_TOKEN"), BotName: os.Getenv("CLOUDTODO_TELEGRAM_BOT_NAME")}
}

func providerPublic(channel string, cfg providerConfig) map[string]any {
	result := map[string]any{"channel": channel, "enabled": cfg.Enabled, "configured": cfg.Enabled, "updated_at": cfg.UpdatedAt}
	if channel == "email" {
		result["smtp_host"] = cfg.SMTPHost
		result["smtp_port"] = cfg.SMTPPort
		result["from_address"] = cfg.SMTPFrom
		result["password_configured"] = cfg.SMTPPass != ""
	} else {
		result["bot_name"] = cfg.BotName
		result["bot_token_configured"] = cfg.BotToken != ""
	}
	return result
}

func settingKey() ([]byte, error) {
	value := os.Getenv("CLOUDTODO_SETTINGS_KEY")
	if len(value) < 16 {
		return nil, fmt.Errorf("CLOUDTODO_SETTINGS_KEY must be configured")
	}
	sum := sha256.Sum256([]byte(value))
	return sum[:], nil
}
func encryptSetting(value string) (string, error) {
	key, err := settingKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(gcm.Seal(nonce, nonce, []byte(value), nil)), nil
}
func decryptSetting(value string) (string, error) {
	key, err := settingKey()
	if err != nil {
		return "", err
	}
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	n := gcm.NonceSize()
	if len(raw) < n {
		return "", fmt.Errorf("invalid encrypted setting")
	}
	plain, err := gcm.Open(nil, raw[:n], raw[n:], nil)
	return string(plain), err
}

var _ = strings.TrimSpace
