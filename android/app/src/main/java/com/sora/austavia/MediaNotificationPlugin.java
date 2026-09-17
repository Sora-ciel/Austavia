package com.sora.austavia;

import android.Manifest;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Bridge between the web player and the media notification.
 *
 * Kept deliberately small: the service owns the session and the notification,
 * and this only passes the current track across and hands button presses back.
 */
@CapacitorPlugin(
    name = "MediaNotification",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class MediaNotificationPlugin extends Plugin {

    @Override
    public void load() {
        // Button presses arrive on the service and are forwarded to the web
        // layer, which is what actually controls playback.
        MediaNotificationService.actionListener = (action, value) -> {
            JSObject payload = new JSObject();
            payload.put("action", shortName(action));
            // Only a seek carries one; everything else sends 0 and the web side
            // ignores it.
            payload.put("position", value);
            notifyListeners("action", payload);
        };
    }

    private static String shortName(String action) {
        if (MediaNotificationService.ACTION_PREVIOUS.equals(action)) return "previous";
        if (MediaNotificationService.ACTION_TOGGLE.equals(action)) return "toggle";
        if (MediaNotificationService.ACTION_NEXT.equals(action)) return "next";
        if (MediaNotificationService.ACTION_STOP.equals(action)) return "stop";
        if (MediaNotificationService.ACTION_SEEK.equals(action)) return "seek";
        return action;
    }

    /**
     * Shows or refreshes the notification. Called whenever the track or the
     * play state changes.
     */
    @PluginMethod
    public void show(PluginCall call) {
        // Android 13 hides the notification without this. Playback would still
        // work, which is exactly the confusing case: audio in the background
        // and nothing in the shade to control it.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && getPermissionState("notifications") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterPermission");
            return;
        }
        start(call);
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        // Started either way: the service keeps playback alive even when the
        // notification itself has been refused.
        start(call);
    }

    private void start(PluginCall call) {
        Intent intent = new Intent(getContext(), MediaNotificationService.class)
            .setAction(MediaNotificationService.ACTION_UPDATE)
            .putExtra(MediaNotificationService.EXTRA_TITLE, call.getString("title", ""))
            .putExtra(MediaNotificationService.EXTRA_ARTIST, call.getString("artist", ""))
            .putExtra(MediaNotificationService.EXTRA_PLAYING, call.getBoolean("playing", false));

        String artwork = call.getString("artwork");
        if (artwork != null && !artwork.isEmpty()) {
            intent.putExtra(MediaNotificationService.EXTRA_ARTWORK, artwork);
        }

        // Where the track is up to, so the system player can draw its progress
        // bar. Left out rather than sent as zero when the web side does not know
        // yet -- a track's duration is unreadable until its metadata has loaded,
        // and sending nothing leaves the last good value in place instead of
        // blanking the bar. See src/utils/playbackPosition.js.
        putIfPresent(call, intent, "position", MediaNotificationService.EXTRA_POSITION);
        putIfPresent(call, intent, "duration", MediaNotificationService.EXTRA_DURATION);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    /**
     * Copies a millisecond value across only when the call actually carried
     * one, so "not known yet" stays distinguishable from "the start of the
     * track". The service treats a missing value as leave-it-alone.
     */
    private static void putIfPresent(PluginCall call, Intent intent, String key, String extra) {
        Double value = call.getDouble(key);
        if (value == null || value.isNaN() || value < 0) return;
        intent.putExtra(extra, value.longValue());
    }

    /** Takes the notification down and lets the service stop. */
    @PluginMethod
    public void hide(PluginCall call) {
        getContext().startService(
            new Intent(getContext(), MediaNotificationService.class)
                .setAction(MediaNotificationService.ACTION_STOP)
        );
        call.resolve();
    }
}
