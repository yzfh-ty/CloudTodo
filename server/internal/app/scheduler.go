package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// RunScheduler is intentionally single-process for the SQLite deployment model.
func (a *App) RunScheduler(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.scanDueReminders()
		}
	}
}

func (a *App) scanDueReminders() {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	_, _ = a.DB.Exec(`INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`, "scheduler_last_run_at", now, now)
	rows, err := a.DB.Query(`SELECT id,user_id,todo_id,channels_json,remind_at,repeat_type,COALESCE(repeat_rule,'') FROM reminders WHERE status='pending' AND deleted_at IS NULL AND remind_at<=? ORDER BY remind_at LIMIT 100`, now)
	if err != nil {
		_, _ = a.DB.Exec(`INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`, "scheduler_last_error", err.Error(), now)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var reminderID, userID, todoID, channelsJSON, scheduledFor, repeatType, repeatRule string
		if rows.Scan(&reminderID, &userID, &todoID, &channelsJSON, &scheduledFor, &repeatType, &repeatRule) == nil {
			a.claimReminder(reminderID, userID, todoID, channelsJSON, scheduledFor, repeatType, repeatRule)
		}
	}
	_, _ = a.DB.Exec(`DELETE FROM app_settings WHERE key='scheduler_last_error'`)
}

func (a *App) schedulerStatus() map[string]any {
	var lastRun, lastError string
	_ = a.DB.QueryRow(`SELECT value FROM app_settings WHERE key='scheduler_last_run_at'`).Scan(&lastRun)
	_ = a.DB.QueryRow(`SELECT value FROM app_settings WHERE key='scheduler_last_error'`).Scan(&lastError)
	return map[string]any{"enabled": true, "last_run_at": nullIfEmpty(lastRun), "last_error": nullIfEmpty(lastError)}
}
func (a *App) claimReminder(reminderID, userID, todoID, channelsJSON, scheduledFor, repeatType, repeatRule string) {
	tx, err := a.DB.Begin()
	if err != nil {
		return
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	nextAt := nextReminderTime(scheduledFor, repeatType)
	status := "triggered"
	if nextAt != "" {
		status = "pending"
	}
	result, err := tx.Exec(`UPDATE reminders SET status=?,remind_at=COALESCE(NULLIF(?,''),remind_at),version=version+1,updated_at=? WHERE id=? AND status='pending' AND deleted_at IS NULL`, status, nextAt, now, reminderID)
	if err != nil {
		_ = tx.Rollback()
		return
	}
	count, _ := result.RowsAffected()
	if count != 1 {
		_ = tx.Rollback()
		return
	}
	var channels []string
	if json.Unmarshal([]byte(channelsJSON), &channels) != nil || len(channels) == 0 {
		channels = []string{"local"}
	}
	eventIDs := []string{}
	for _, channel := range channels {
		eventID := newID()
		_, err := tx.Exec(`INSERT INTO reminder_events(id,user_id,reminder_id,todo_id,channel,scheduled_for,status,created_at) VALUES(?,?,?,?,?,?,'pending',?)`, eventID, userID, reminderID, todoID, channel, scheduledFor, now)
		if err != nil {
			_ = tx.Rollback()
			return
		}
		eventIDs = append(eventIDs, eventID)
	}
	if err := tx.Commit(); err != nil && err != sql.ErrTxDone {
		return
	}
	for _, eventID := range eventIDs {
		go a.dispatchEvent(eventID)
	}
}

func nextReminderTime(scheduledFor, repeatType string) string {
	if repeatType == "none" || repeatType == "" {
		return ""
	}
	t, err := time.Parse(time.RFC3339Nano, scheduledFor)
	if err != nil {
		return ""
	}
	switch repeatType {
	case "daily":
		return t.Add(24 * time.Hour).UTC().Format(time.RFC3339Nano)
	case "weekly":
		return t.Add(7 * 24 * time.Hour).UTC().Format(time.RFC3339Nano)
	case "workday":
		for i := 1; i <= 7; i++ {
			next := t.Add(time.Duration(i) * 24 * time.Hour)
			if next.Weekday() != time.Saturday && next.Weekday() != time.Sunday {
				return next.UTC().Format(time.RFC3339Nano)
			}
		}
	}
	return ""
}
