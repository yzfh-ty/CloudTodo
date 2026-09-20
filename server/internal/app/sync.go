package app

import (
	"database/sql"
	"net/http"
	"time"
)

func (a *App) syncBootstrap(w http.ResponseWriter, r *http.Request, id identity) {
	snapshot := time.Now().UTC().Format(time.RFC3339Nano)
	data := map[string]any{"snapshot_at": snapshot, "cursor": snapshot}
	collections := []struct{ name, query string }{
		{"lists", `SELECT id,name,color,sort_order,version,created_at,updated_at,deleted_at FROM lists WHERE user_id=? AND updated_at<=? ORDER BY updated_at,id`},
		{"tags", `SELECT id,name,color,version,created_at,updated_at,deleted_at FROM tags WHERE user_id=? AND updated_at<=? ORDER BY updated_at,id`},
		{"todos", `SELECT id,list_id,title,description,status,priority,due_at,is_all_day,version,created_at,updated_at,deleted_at FROM todos WHERE user_id=? AND updated_at<=? ORDER BY updated_at,id`},
		{"reminders", `SELECT id,todo_id,channels_json,remind_at,repeat_type,repeat_rule,status,version,created_at,updated_at,deleted_at FROM reminders WHERE user_id=? AND updated_at<=? ORDER BY updated_at,id`},
		{"notification_subscriptions", `SELECT id,channel,enabled,email,target_url,chat_id,version,created_at,updated_at FROM notification_subscriptions WHERE user_id=? AND updated_at<=? ORDER BY updated_at,id`},
	}
	for _, collection := range collections {
		items, err := queryObjects(a.DB, collection.query, id.ID, snapshot)
		if err != nil {
			errorJSON(w, 500, "INTERNAL_ERROR", "could not build sync snapshot", nil)
			return
		}
		data[collection.name] = items
	}
	writeJSON(w, 200, data)
}

func (a *App) syncChanges(w http.ResponseWriter, r *http.Request, id identity) {
	cursor := r.URL.Query().Get("cursor")
	if cursor == "" {
		cursor = "0001-01-01T00:00:00Z"
	}
	upper := time.Now().UTC().Format(time.RFC3339Nano)
	items := []map[string]any{}
	collections := []struct{ name, query string }{
		{"lists", `SELECT id,name,color,sort_order,version,created_at,updated_at,deleted_at FROM lists WHERE user_id=? AND updated_at>? AND updated_at<=? ORDER BY updated_at,id`},
		{"tags", `SELECT id,name,color,version,created_at,updated_at,deleted_at FROM tags WHERE user_id=? AND updated_at>? AND updated_at<=? ORDER BY updated_at,id`},
		{"todos", `SELECT id,list_id,title,description,status,priority,due_at,is_all_day,version,created_at,updated_at,deleted_at FROM todos WHERE user_id=? AND updated_at>? AND updated_at<=? ORDER BY updated_at,id`},
		{"reminders", `SELECT id,todo_id,channels_json,remind_at,repeat_type,repeat_rule,status,version,created_at,updated_at,deleted_at FROM reminders WHERE user_id=? AND updated_at>? AND updated_at<=? ORDER BY updated_at,id`},
		{"notification_subscriptions", `SELECT id,channel,enabled,email,target_url,chat_id,version,created_at,updated_at FROM notification_subscriptions WHERE user_id=? AND updated_at>? AND updated_at<=? ORDER BY updated_at,id`},
	}
	for _, collection := range collections {
		rows, err := a.DB.Query(collection.query, id.ID, cursor, upper)
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
	writeJSON(w, 200, map[string]any{"items": items, "next_cursor": upper, "has_more": false})
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
			default:
				item[column] = value
			}
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
