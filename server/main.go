package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/yzfh-ty/CloudTodo/server/internal/app"
	"github.com/yzfh-ty/CloudTodo/server/internal/db"
)

func main() {
	path := os.Getenv("CLOUDTODO_DB_PATH")
	database, err := db.Open(path)
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()
	if err := app.EnsureAdmin(database); err != nil {
		log.Fatal(err)
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}
	server := app.New(database)
	log.Printf("CloudTodo server listening on :%s", port)
	go server.RunScheduler(context.Background())
	root := http.NewServeMux()
	root.Handle("/api/", server.Handler())
	root.Handle("/health", server.Handler())
	root.Handle("/", adminHandler())
	log.Fatal(http.ListenAndServe(":"+port, root))
}
