package main

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"
)

//go:embed admin/*
var adminAssets embed.FS

func adminHandler() http.Handler {
	root, _ := fs.Sub(adminAssets, "admin")
	files := http.FileServer(http.FS(root))
	mux := http.NewServeMux()
	mux.HandleFunc("GET /admin", func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, "/admin/", http.StatusFound) })
	mux.HandleFunc("GET /admin/login", func(w http.ResponseWriter, r *http.Request) { serveAdminFile(w, r, root, "login.html") })
	mux.HandleFunc("GET /admin/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/admin/" {
			serveAdminFile(w, r, root, "index.html")
			return
		}
		r.URL.Path = strings.TrimPrefix(r.URL.Path, "/admin")
		files.ServeHTTP(w, r)
	})
	return mux
}

func serveAdminFile(w http.ResponseWriter, r *http.Request, root fs.FS, name string) {
	data, err := fs.ReadFile(root, name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	if strings.HasSuffix(name, ".html") {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
