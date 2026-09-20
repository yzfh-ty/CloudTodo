package app

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"time"
)

func (a *App) syncBootstrap(w http.ResponseWriter, r *http.Request, id identity) {
	snapshot := time.Now().UTC().Format(time.RFC3339Nano)
	data := map[string]any{"snapshot_at": snapshot, "cursor": encodePageCursor(snapshot, "")}
	collections := []struct{ name, query string }{
		{"lists", `SELECT id,name,color,sort_order,version,created_at,updated_at,COALESCE(deleted_at,'') AS deleted_at FROM lists WHERE user_id=? AND updated_at<=? ORDER BY updated_at,id`},
		{"tags", `SELECT id,name,color,version,created_at,updated_at,COALESCE(deleted_at,'') AS deleted_at FROM tags WHERE user_id=? AND updated_at<=? ORDER BY updated_at,id`},
		{"todos", `SELECT id,list_id,title,description,status,priority,due_at,is_all_day,version,created_at,updated_at,COALESCE(deleted_at,'') AS deleted_at FROM todos WHERE user_id=? AND updated_at<=? ORDER BY updated_at,id`},
		{"reminders", `SELECT id,todo_id,channels_json,remind_at,repeat_type,repeat_rule,status,version,created_at,updated_at,COALESCE(deleted_at,'') AS deleted_at FROM reminders WHERE user_id=? AND updated_at<=? ORDER BY updated_at,id`},
		{"notification_subscriptions", `SELECT id,channel,enabled,email,target_url,secret,chat_id,version,created_at,updated_at,COALESCE(deleted_at,'') AS deleted_at FROM notification_subscriptions WHERE user_id=? AND updated_at<=? ORDER BY updated_at,id`},
	}
	for _, collection := range collections {
		items, err := queryObjects(a.DB, collection.query, id.ID, snapshot)
		if err != nil {
			errorJSON(w, 500, "INTERNAL_ERROR", "could not build sync snapshot", nil)
			return
		}
		for _, item := range items {
			a.normalizeSyncObject(collection.name, item, id.ID)
		}
		data[collection.name] = items
	}
	writeJSON(w, 200, data)
}

func (a *App) syncChanges(w http.ResponseWriter, r *http.Request, id identity) {
	limit, err := parseLimit(r)
	if err != nil {
		errorJSON(w, 400, "VALIDATION_ERROR", err.Error(), nil)
		return
	}
	cursorValue := r.URL.Query().Get("cursor")
	cursor := pageCursor{Time: "0001-01-01T00:00:00Z"}
	if cursorValue != "" {
		cursor, err = decodePageCursor(cursorValue)
		if err != nil {
			if parsed, parseErr := time.Parse(time.RFC3339Nano, cursorValue); parseErr == nil {
				cursor = pageCursor{Time: parsed.Format(time.RFC3339Nano)}
			} else {
				errorJSON(w, 400, "INVALID_CURSOR", "cursor is invalid", nil)
				return
			}
		}
	}
	upper := time.Now().UTC().Format(time.RFC3339Nano)
	items := []map[string]any{}
	collections := []struct{ name, query string }{
		{"lists", `SELECT id,name,color,sort_order,version,created_at,updated_at,COALESCE(deleted_at,'') AS deleted_at FROM lists WHERE user_id=? AND (updated_at>? OR (updated_at=? AND id>?)) AND updated_at<=? ORDER BY updated_at,id`},
		{"tags", `SELECT id,name,color,version,created_at,updated_at,COALESCE(deleted_at,'') AS deleted_at FROM tags WHERE user_id=? AND (updated_at>? OR (updated_at=? AND id>?)) AND updated_at<=? ORDER BY updated_at,id`},
		{"todos", `SELECT id,list_id,title,description,status,priority,due_at,is_all_day,version,created_at,updated_at,COALESCE(deleted_at,'') AS deleted_at FROM todos WHERE user_id=? AND (updated_at>? OR (updated_at=? AND id>?)) AND updated_at<=? ORDER BY updated_at,id`},
		{"reminders", `SELECT id,todo_id,channels_json,remind_at,repeat_type,repeat_rule,status,version,created_at,updated_at,COALESCE(deleted_at,'') AS deleted_at FROM reminders WHERE user_id=? AND (updated_at>? OR (updated_at=? AND id>?)) AND updated_at<=? ORDER BY updated_at,id`},
		{"notification_subscriptions", `SELECT id,channel,enabled,email,target_url,secret,chat_id,version,created_at,updated_at,COALESCE(deleted_at,'') AS deleted_at FROM notification_subscriptions WHERE user_id=? AND (updated_at>? OR (updated_at=? AND id>?)) AND updated_at<=? ORDER BY updated_at,id`},
	}
	for _, collection := range collections {
		rows, err := a.DB.Query(collection.query, id.ID, cursor.Time, cursor.Time, cursor.ID, upper)
		if err != nil {
			errorJSON(w, 500, "INTERNAL_ERROR", "could not read sync changes", nil)
			return
		}
		objects, err := rowsAsObjects(rows)
		rows.Close()
		if err != nil {
			errorJSON(w, 500, "INTERNAL_ERROR", "could not decode sync changes", nil)
			return
		}
		for _, object := range objects {
			a.normalizeSyncObject(collection.name, object, id.ID)
			operation := "upsert"
			if deleted, ok := object["deleted_at"].(string); ok && deleted != "" {
				operation = "delete"
			}
			item := map[string]any{"collection": collection.name, "operation": operation, "id": object["id"], "version": object["version"], "updated_at": object["updated_at"], "data": object}
			if operation == "delete" {
				item["data"] = nil
			}
			items = append(items, item)
		}
	}
	sort.SliceStable(items, func(i, j int) bool {
		left, right := items[i], items[j]
		lt, rt := left["updated_at"].(string), right["updated_at"].(string)
		if lt == rt {
			return left["id"].(string) < right["id"].(string)
		}
		return lt < rt
	})
	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}
	nextCursor := encodePageCursor(upper, "")
	if hasMore && len(items) > 0 {
		last := items[len(items)-1]
		nextCursor = encodePageCursor(last["updated_at"].(string), last["id"].(string))
	}
	writeJSON(w, 200, map[string]any{"items": items, "next_cursor": nextCursor, "has_more": hasMore})
}

func (a *App) normalizeSyncObject(collection string, object map[string]any, userID string) {
	switch collection {
	case "todos":
		if todoID, ok := object["id"].(string); ok {
			object["tag_ids"] = a.todoTagIDs(todoID, userID)
		}
	case "reminders":
		var channels []string
		if raw, ok := object["channels_json"].(string); ok {
			_ = json.Unmarshal([]byte(raw), &channels)
		}
		object["channels"] = channels
		repeatType, _ := object["repeat_type"].(string)
		var rule any
		if raw, ok := object["repeat_rule"].(string); ok && raw != "" {
			_ = json.Unmarshal([]byte(raw), &rule)
		}
		object["repeat"] = map[string]any{"type": repeatType, "rule": rule}
		delete(object, "channels_json")
		delete(object, "repeat_type")
		delete(object, "repeat_rule")
	case "notification_subscriptions":
		secret, _ := object["secret"].(string)
		object["secret_configured"] = secret != ""
		delete(object, "secret")
		if targetURL, ok := object["target_url"].(string); ok {
			object["target_url"] = nullIfEmpty(maskURL(targetURL))
		}
	}
}
func queryObjects(database *sql.DB, query string, args ...any) ([]map[string]any, error) {
	rows, err := database.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return rowsAsObjects(rows)
}

func rowsAsObjects(rows *sql.Rows) ([]map[string]any, error) {
	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	items := []map[string]any{}
	for rows.Next() {
		values := make([]any, len(columns))
		pointers := make([]any, len(columns))
		for i := range values {
			pointers[i] = &values[i]
		}
		if err := rows.Scan(pointers...); err != nil {
			return nil, err
		}
		item := map[string]any{}
		for i, column := range columns {
			switch value := values[i].(type) {
			case []byte:
				item[column] = string(value)
			case nil:
				item[column] = nil
			default:
				item[column] = value
			}
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

var _ = strings.TrimSpace
