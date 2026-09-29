package com.sora.austavia;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Bridge between the web layer's timers and the timer notification -- see
 * TimerNotifications for what it shows and why.
 */
@CapacitorPlugin(
    name = "TimerNotification",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class TimerNotificationPlugin extends Plugin {

    private static volatile TimerNotificationPlugin instance;
    /** Whether the app is on screen, so "Time's up" is only sounded when it is not. */
    static volatile boolean appInFront = false;

    @Override
    public void load() {
        instance = this;
        appInFront = true;
    }

    @Override
    protected void handleOnResume() {
        appInFront = true;
    }

    @Override
    protected void handleOnPause() {
        appInFront = false;
    }

    @Override
    protected void handleOnDestroy() {
        appInFront = false;
        if (instance == this) instance = null;
    }

    /** Hands a button press to the web layer; false when there is none to take it. */
    static boolean forward(String action, String blockId) {
        TimerNotificationPlugin plugin = instance;
        if (plugin == null) return false;
        JSObject payload = new JSObject();
        payload.put("action", action);
        payload.put("blockId", blockId);
        plugin.notifyListeners("action", payload);
        return true;
    }

    @PluginMethod
    public void show(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterPermission");
            return;
        }
        post(call);
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        // Posted either way; refused, Android simply does not show it.
        post(call);
    }

    private void post(PluginCall call) {
        // The end arrives as a string: a millisecond time is past what a JSON
        // number reliably crosses the bridge as.
        long endsAt = 0;
        try {
            endsAt = Long.parseLong(call.getString("endsAt", "0"));
        } catch (NumberFormatException ignored) { }
        TimerNotifications.show(
            getContext(),
            call.getString("blockId", ""),
            call.getString("phase", "running"),
            endsAt,
            call.getString("title", "Timer"),
            call.getString("text", "")
        );
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        TimerNotifications.clear(getContext());
        call.resolve();
    }
}
