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
