package com.sora.austavia;

import android.Manifest;
import android.content.Intent;
import android.graphics.Bitmap;
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

    // The bridge's half of the story, for status(). What the service reports is
    // the other half, and the interesting answers are always in the comparison.
    private static volatile int lastArtworkChars = -1;
    private static volatile boolean lastArtworkDecoded = false;
    private static volatile String lastStartError = null;

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
        if (MediaNotificationService.ACTION_DISMISS.equals(action)) return "dismiss";
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

        // Decoded here and handed over in memory, not written onto the intent.
        // See EXTRA_ARTWORK_ID: an intent is parcelled through the system
        // server, and a 197KB PNG cover became half a megabyte of UTF-16 on one
        // -- which took the title, the play state and the position down with it
        // when it failed, because all of them were riding on the same intent.
        String artwork = call.getString("artwork");
        lastArtworkChars = artwork == null ? -1 : artwork.length();
        lastArtworkDecoded = false;

        if (artwork != null && !artwork.isEmpty()) {
            Bitmap bitmap = MediaNotificationService.decodeArtwork(artwork);
            if (bitmap != null) {
                lastArtworkDecoded = true;
                intent.putExtra(
                    MediaNotificationService.EXTRA_ARTWORK_ID,
                    MediaNotificationService.stashArtwork(bitmap)
                );
            }
            // A cover that will not decode is simply not sent. The rest of the
            // update still goes, because a broken picture must never cost
            // somebody their play button.
        }

        // Where the track is up to, so the system player can draw its progress
        // bar. Left out rather than sent as zero when the web side does not know
        // yet -- a track's duration is unreadable until its metadata has loaded,
        // and sending nothing leaves the last good value in place instead of
        // blanking the bar. See src/utils/playbackPosition.js.
        putIfPresent(call, intent, "position", MediaNotificationService.EXTRA_POSITION);
        putIfPresent(call, intent, "duration", MediaNotificationService.EXTRA_DURATION);

        // The artwork no longer travels on the intent, so this should not be
        // able to fail on size any more. It is guarded anyway, and guarded in
        // the order that matters: a second attempt without the cover, so the
        // worst case is a stale picture over a working progress bar rather than
        // a notification frozen on the previous track.
        try {
            fire(intent);
            lastStartError = null;
        } catch (Throwable error) {
            lastStartError = error.getClass().getSimpleName() + ": " + error.getMessage();
            intent.removeExtra(MediaNotificationService.EXTRA_ARTWORK_ID);
            intent.removeExtra(MediaNotificationService.EXTRA_ARTWORK);
            try {
                fire(intent);
            } catch (Throwable second) {
                lastStartError += " | without artwork: "
                    + second.getClass().getSimpleName() + ": " + second.getMessage();
                call.reject("Could not start the media notification: " + lastStartError);
                return;
            }
        }

        call.resolve();
    }

    private void fire(Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
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

    /**
     * What the notification service actually received and made of it.
     *
     * The cover crosses from the web layer into a service nobody can watch, and
     * when it does not appear there is no way from the outside to tell the three
     * cases apart: it was never sent, it arrived and would not decode, or it
     * decoded and the system ignored it. Each wants a different fix, so this
     * says which — and it reports rather than guesses, because every previous
     * guess about this has been wrong.
     */
    @PluginMethod
    public void status(PluginCall call) {
        JSObject out = new JSObject();
        out.put("sdk", Build.VERSION.SDK_INT);
        out.put("serviceRunning", MediaNotificationService.serviceRunning);
        out.put("updatesReceived", MediaNotificationService.updatesReceived);
        // -1 means the last update carried no artwork extra at all, which is a
        // different fault from one that arrived and failed.
        out.put("artworkChars", MediaNotificationService.lastArtworkChars);
        out.put("artworkWidth", MediaNotificationService.lastArtworkWidth);
        out.put("artworkHeight", MediaNotificationService.lastArtworkHeight);
        out.put("artworkError", MediaNotificationService.lastArtworkError);
        out.put("artworkVia", MediaNotificationService.lastArtworkVia);
        // The bridge's own side of the handover, so a cover that never left the
        // plugin is distinguishable from one the service never picked up.
        out.put("sentArtworkChars", lastArtworkChars);
        out.put("sentArtworkDecoded", lastArtworkDecoded);
        out.put("startError", lastStartError);
        out.put(
            "notificationsAllowed",
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || getPermissionState("notifications") == com.getcapacitor.PermissionState.GRANTED
        );
        call.resolve(out);
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
