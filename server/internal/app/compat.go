package app

import (
	"net/http"
	"time"
)

func (a *App) deleteDevice(w http.ResponseWriter, r *http.Request, id identity) {
	deviceID := r.PathValue("id")
	res, err := a.DB.Exec(`UPDATE devices SET deleted_at=?,is_online=0,updated_at=? WHERE id=? AND user_id=? AND deleted_at IS NULL`, time.Now().UTC().Format(time.RFC3339Nano), time.Now().UTC().Format(time.RFC3339Nano), deviceID, id.ID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not delete device", nil)
		return
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		errorJSON(w, 404, "RESOURCE_NOT_FOUND", "device not found", nil)
		return
	}
	_, _ = a.DB.Exec(`UPDATE sessions SET revoked_at=? WHERE user_id=? AND device_id=? AND revoked_at IS NULL`, time.Now().UTC().Format(time.RFC3339Nano), id.ID, deviceID)
	writeJSON(w, 200, map[string]any{"deleted": true, "device_id": deviceID})
}

func (a *App) deleteSubscription(w http.ResponseWriter, r *http.Request, id identity) {
	subscriptionID := r.PathValue("id")
	now := time.Now().UTC().Format(time.RFC3339Nano)
	res, err := a.DB.Exec(`UPDATE notification_subscriptions SET deleted_at=?,version=version+1,updated_at=? WHERE id=? AND user_id=? AND deleted_at IS NULL`, now, now, subscriptionID, id.ID)
	if err != nil {
		errorJSON(w, 500, "INTERNAL_ERROR", "could not delete subscription", nil)
		return
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		errorJSON(w, 404, "RESOURCE_NOT_FOUND", "subscription not found", nil)
		return
	}
	writeJSON(w, 200, map[string]any{"deleted": true, "subscription_id": subscriptionID})
}
