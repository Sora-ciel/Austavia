package com.sora.austavia;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * A calendar reminder's alarm going off -- see CalendarReminders. Not
 * exported: only our own alarms reach it, so no other app can post a
 * "reminder" through it.
 */
public class CalendarReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!CalendarReminders.ACTION_REMIND.equals(intent.getAction())) return;
        CalendarReminders.show(context,
            intent.getStringExtra(CalendarReminders.EXTRA_ID),
            intent.getStringExtra(CalendarReminders.EXTRA_TITLE),
            intent.getStringExtra(CalendarReminders.EXTRA_BODY));
    }
}
