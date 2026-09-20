package app

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/yzfh-ty/CloudTodo/server/internal/db"
)

func TestCoreUserAndAdminFlow(t *testing.T) {
	database, err := db.Open(t.TempDir() + "/cloudtodo.db")
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	t.Setenv("CLOUDTODO_ADMIN_EMAIL", "admin@example.com")
	t.Setenv("CLOUDTODO_ADMIN_USERNAME", "admin")
	t.Setenv("CLOUDTODO_ADMIN_PASSWORD", "admin-password-123")
	if err := EnsureAdmin(database); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(New(database).Handler())
	defer server.Close()

	register := requestJSON(t, server.Client(), http.MethodPost, server.URL+"/api/auth/register", map[string]any{
		"email": "test@example.com", "username": "test-user", "password": "password-123",
		"device": map[string]any{"identifier": "test-install", "platform": "test", "name": "Test"},
	})
	access := register["data"].(map[string]any)["session"].(map[string]any)["access_token"].(string)
	headers := map[string]string{"Authorization": "Bearer " + access}
	todo := requestJSONWithHeaders(t, server.Client(), http.MethodPost, server.URL+"/api/todos", map[string]any{"title": "integration todo"}, headers)
	if todo["code"] != "OK" {
		t.Fatalf("todo create failed: %#v", todo)
	}
	list := requestJSONWithHeaders(t, server.Client(), http.MethodGet, server.URL+"/api/todos", nil, headers)
	if len(list["data"].(map[string]any)["items"].([]any)) != 1 {
		t.Fatalf("unexpected todo list: %#v", list)
	}
	snapshot := requestJSONWithHeaders(t, server.Client(), http.MethodGet, server.URL+"/api/sync/bootstrap", nil, headers)
	if snapshot["code"] != "OK" {
		t.Fatalf("sync bootstrap failed: %#v", snapshot)
	}
	admin := requestJSON(t, server.Client(), http.MethodPost, server.URL+"/api/admin/auth/login", map[string]any{"account": "admin", "password": "admin-password-123"})
	if admin["code"] != "OK" {
		t.Fatalf("admin login failed: %#v", admin)
	}
}

func TestDocumentedResourceFlows(t *testing.T) {
	database, err := db.Open(t.TempDir() + "/cloudtodo.db")
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	t.Setenv("CLOUDTODO_ADMIN_EMAIL", "admin@example.com")
	t.Setenv("CLOUDTODO_ADMIN_USERNAME", "admin")
	t.Setenv("CLOUDTODO_ADMIN_PASSWORD", "admin-password-123")
	if err := EnsureAdmin(database); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(New(database).Handler())
	defer server.Close()

	register := requestJSON(t, server.Client(), http.MethodPost, server.URL+"/api/auth/register", map[string]any{"email": "flow@example.com", "username": "flow-user", "password": "password-123", "device": map[string]any{"identifier": "flow-install", "platform": "test"}})
	data := register["data"].(map[string]any)
	access := data["session"].(map[string]any)["access_token"].(string)
	headers := map[string]string{"Authorization": "Bearer " + access}

	list := requestJSONWithHeaders(t, server.Client(), http.MethodPost, server.URL+"/api/lists", map[string]any{"name": "Work"}, headers)
	listID := list["data"].(map[string]any)["id"].(string)
	idempotentHeaders := map[string]string{"Authorization": "Bearer " + access, "Idempotency-Key": "list-create-1"}
	firstList := requestJSONWithHeaders(t, server.Client(), http.MethodPost, server.URL+"/api/lists", map[string]any{"name": "Idempotent"}, idempotentHeaders)
	secondList := requestJSONWithHeaders(t, server.Client(), http.MethodPost, server.URL+"/api/lists", map[string]any{"name": "Different"}, idempotentHeaders)
	if firstList["data"].(map[string]any)["id"] != secondList["data"].(map[string]any)["id"] {
		t.Fatalf("idempotency key created two resources: %#v %#v", firstList, secondList)
	}
	tag := requestJSONWithHeaders(t, server.Client(), http.MethodPost, server.URL+"/api/tags", map[string]any{"name": "Urgent"}, headers)
	tagID := tag["data"].(map[string]any)["id"].(string)
	todo := requestJSONWithHeaders(t, server.Client(), http.MethodPost, server.URL+"/api/todos", map[string]any{"title": "Buy milk", "list_id": listID, "tag_ids": []string{tagID}, "due_at": "2026-09-21T08:00:00Z"}, headers)
	todoData := todo["data"].(map[string]any)
	if todoData["list_id"] != listID || len(todoData["tag_ids"].([]any)) != 1 {
		t.Fatalf("todo relations missing: %#v", todoData)
	}

	filtered := requestJSONWithHeaders(t, server.Client(), http.MethodGet, server.URL+"/api/todos?tag_id="+tagID, nil, headers)
	if len(filtered["data"].(map[string]any)["items"].([]any)) != 1 {
		t.Fatalf("tag filter failed: %#v", filtered)
	}
	reminder := requestJSONWithHeaders(t, server.Client(), http.MethodPost, server.URL+"/api/todos/"+todoData["id"].(string)+"/reminders", map[string]any{"channels": []string{"local"}, "remind_at": "2026-09-21T07:00:00Z", "repeat": map[string]any{"type": "daily", "rule": nil}}, headers)
	reminderData := reminder["data"].(map[string]any)
	if reminderData["repeat"].(map[string]any)["type"] != "daily" {
		t.Fatalf("repeat was not stored: %#v", reminderData)
	}
	patched := requestJSONWithHeaders(t, server.Client(), http.MethodPatch, server.URL+"/api/reminders/"+reminderData["id"].(string), map[string]any{"version": 1, "status": "cancelled"}, headers)
	if patched["code"] != "OK" {
		t.Fatalf("reminder patch failed: %#v", patched)
	}
	snapshot := requestJSONWithHeaders(t, server.Client(), http.MethodGet, server.URL+"/api/sync/bootstrap", nil, headers)
	snapshotData := snapshot["data"].(map[string]any)
	if len(snapshotData["todos"].([]any)) != 1 || len(snapshotData["reminders"].([]any)) != 1 {
		t.Fatalf("sync snapshot incomplete: %#v", snapshotData)
	}
	syncedTodo := snapshotData["todos"].([]any)[0].(map[string]any)
	if len(syncedTodo["tag_ids"].([]any)) != 1 {
		t.Fatalf("sync todo tag_ids missing: %#v", syncedTodo)
	}
	syncedReminder := snapshotData["reminders"].([]any)[0].(map[string]any)
	if syncedReminder["channels_json"] != nil || syncedReminder["repeat"] == nil {
		t.Fatalf("sync reminder still exposes storage fields: %#v", syncedReminder)
	}
	export := requestJSONWithHeaders(t, server.Client(), http.MethodGet, server.URL+"/api/me/export", nil, headers)
	exportData := export["data"].(map[string]any)
	if len(exportData["lists"].([]any)) < 1 || len(exportData["tags"].([]any)) != 1 || len(exportData["todos"].([]any)) != 1 || len(exportData["reminders"].([]any)) != 1 {
		t.Fatalf("export incomplete: %#v", exportData)
	}
	capabilities := requestJSONWithHeaders(t, server.Client(), http.MethodGet, server.URL+"/api/capabilities", nil, headers)
	if capabilities["request_id"] == "" {
		t.Fatalf("request_id missing: %#v", capabilities)
	}

	admin := requestJSON(t, server.Client(), http.MethodPost, server.URL+"/api/admin/auth/login", map[string]any{"account": "admin", "password": "admin-password-123"})
	adminAccess := admin["data"].(map[string]any)["session"].(map[string]any)["access_token"].(string)
	adminRefresh := admin["data"].(map[string]any)["session"].(map[string]any)["refresh_token"].(string)
	userRefresh := data["session"].(map[string]any)["refresh_token"].(string)
	if result := requestJSON(t, server.Client(), http.MethodPost, server.URL+"/api/admin/auth/refresh", map[string]any{"refresh_token": userRefresh}); result["code"] != "SESSION_EXPIRED" {
		t.Fatalf("user refresh token accepted by admin endpoint: %#v", result)
	}
	if result := requestJSON(t, server.Client(), http.MethodPost, server.URL+"/api/auth/refresh", map[string]any{"refresh_token": adminRefresh}); result["code"] != "SESSION_EXPIRED" {
		t.Fatalf("admin refresh token accepted by user endpoint: %#v", result)
	}
	adminHeaders := map[string]string{"Authorization": "Bearer " + adminAccess}
	_ = requestJSONWithHeaders(t, server.Client(), http.MethodPost, server.URL+"/api/admin/users", map[string]any{"email": "audit@example.com", "username": "audit-user", "password": "password-123"}, adminHeaders)
	audit := requestJSONWithHeaders(t, server.Client(), http.MethodGet, server.URL+"/api/admin/audit-logs", nil, adminHeaders)
	if len(audit["data"].(map[string]any)["items"].([]any)) == 0 {
		t.Fatalf("audit log was not recorded: %#v", audit)
	}
}
func requestJSON(t *testing.T, client *http.Client, method, url string, body map[string]any) map[string]any {
	return requestJSONWithHeaders(t, client, method, url, body, nil)
}

func requestJSONWithHeaders(t *testing.T, client *http.Client, method, url string, body map[string]any, headers map[string]string) map[string]any {
	var reader *bytes.Reader
	if body == nil {
		reader = bytes.NewReader(nil)
	} else {
		encoded, _ := json.Marshal(body)
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequest(method, url, reader)
	if err != nil {
		t.Fatal(err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	return result
}
