package com.sora.austavia;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * The phone started, or Austavia was updated: every alarm is gone, so the
 * calendar reminders are set again from the kept list (CalendarReminders).
 * Exported because the system's broadcasts need it to be; it does nothing
 * else, whatever it is sent.
 */
public class CalendarBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            CalendarReminders.restore(context);
        }
    }
}
