package com.sora.austavia;

import android.app.Activity;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The phone's own status bar (the time, the battery), shown or hidden.
 *
 * Asked 2026-11-10, once the app's bar moved to the bottom of a phone: the
 * mode's content started under the phone's status bar -- "we need some space
 * on the height above before the mode actually starts ... OR maybe make the
 * phone's info disappear? and being able to disable it in layout". The space
 * is the page's to keep (env(safe-area-inset-top)); hiding the status bar is
 * this. Hidden, a swipe down from the top edge still shows it for a moment,
 * as in any app that hides it.
 */
@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {

    @PluginMethod
    public void setStatusBarHidden(PluginCall call) {
        boolean hidden = Boolean.TRUE.equals(call.getBoolean("hidden", false));
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }
        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
            if (hidden) {
                controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsetsCompat.Type.statusBars());
            } else {
                controller.show(WindowInsetsCompat.Type.statusBars());
            }
            call.resolve();
        });
    }
}
