package app

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

type pageCursor struct {
	Time string
	ID   string
}

func parseLimit(r *http.Request) (int, error) {
	value := r.URL.Query().Get("limit")
	if value == "" {
		return 50, nil
	}
	limit, err := strconv.Atoi(value)
	if err != nil || limit < 1 || limit > 100 {
		return 0, fmt.Errorf("limit must be between 1 and 100")
	}
	return limit, nil
}

func encodePageCursor(timeValue, id string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(timeValue + "\x00" + id))
}

func decodePageCursor(value string) (pageCursor, error) {
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return pageCursor{}, fmt.Errorf("invalid cursor")
	}
	parts := strings.SplitN(string(raw), "\x00", 2)
	if len(parts) != 2 || parts[0] == "" {
		return pageCursor{}, fmt.Errorf("invalid cursor")
	}
	return pageCursor{Time: parts[0], ID: parts[1]}, nil
}

func finishPage(items []map[string]any, limit int, timeField string) ([]map[string]any, any, bool) {
	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}
	var next any
	if hasMore && len(items) > 0 {
		last := items[len(items)-1]
		if timeValue, ok := last[timeField].(string); ok {
			if idValue, ok := last["id"].(string); ok {
				next = encodePageCursor(timeValue, idValue)
			}
		}
	}
	return items, next, hasMore
}
