package com.sora.austavia;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** Bridge from the web layer's calendar reminders -- see CalendarReminders. */
@CapacitorPlugin(
    name = "CalendarReminders",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class CalendarRemindersPlugin extends Plugin {

    @PluginMethod
    public void set(PluginCall call) {
        JSArray items = call.getArray("items", new JSArray());
        CalendarReminders.set(getContext(), items);
        call.resolve();
    }

    /** Asks for notifications once, where Android needs asking (13 and later). */
    @PluginMethod
    public void ensurePermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
            || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve();
            return;
        }
        requestPermissionForAlias("notifications", call, "permissionAnswered");
    }

    @PermissionCallback
    private void permissionAnswered(PluginCall call) {
        call.resolve();
    }
}
