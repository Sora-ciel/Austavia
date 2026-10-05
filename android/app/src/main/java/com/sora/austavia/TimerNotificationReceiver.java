package com.sora.austavia;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * The timer notification's buttons, and the alarm for its end.
 *
 * A button is handed to the web layer, which owns the timer and redraws the
 * notification from it. When the app's process is gone there is nobody to
 * hand it to: Stop then at least takes the notification away, and the others
 * do nothing until the app is opened again -- see PENDING.md.
 */
public class TimerNotificationReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        String blockId = intent.getStringExtra(TimerNotifications.EXTRA_BLOCK);
        if (action == null) return;

        if (TimerNotifications.ACTION_DONE.equals(action)) {
            // In front, the app rings for itself and redraws this on its own.
            if (!TimerNotificationPlugin.appInFront) {
                TimerNotifications.show(context, blockId, "ringing", 0,
                    intent.getStringExtra(TimerNotifications.EXTRA_TITLE), "Time's up", "Time's up",
                    TimerNotificationPlugin.lastColors);
            }
            return;
        }

        String name = TimerNotifications.ACTION_TOGGLE.equals(action) ? "toggle"
            : TimerNotifications.ACTION_PLUS.equals(action) ? "plus"
            : TimerNotifications.ACTION_STOP.equals(action) ? "stop"
            : null;
        if (name == null) return;

        boolean handed = TimerNotificationPlugin.forward(name, blockId);
        if (!handed && "stop".equals(name)) TimerNotifications.clear(context);
    }
}
