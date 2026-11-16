package com.sora.austavia;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * A notification when a calendar task starts, Austavia open or not.
 *
 * Asked 2026-11-16: "make it so that austavia can send notifications when a
 * task of the calendar starts even if the app is closed." The web layer works
 * out the next two weeks of starts (utils/calendarReminders.js) and hands them
 * here; each becomes an alarm with the system's alarm service, which wakes
 * CalendarReminderReceiver at the time to show it -- with the app gone.
 *
 * The list is also kept in preferences: alarms do not survive the phone
 * restarting, so the receiver sets them again from it at boot, and a new
 * list cancels every alarm of the old one first.
 *
 * Exact when Android allows it (the "Alarms & reminders" permission), which
 * is what a reminder at 9:00 needs. Without it the alarm is inexact and, on a
 * phone left idle, can arrive some minutes late.
 */
final class CalendarReminders {
    static final String CHANNEL = "calendar";
    static final String ACTION_REMIND = "com.sora.austavia.calendar.REMIND";
    static final String EXTRA_ID = "id";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_BODY = "body";
    private static final String PREFS = "calendar-reminders";
    private static final String KEY_ITEMS = "items";

    private CalendarReminders() {}

    /** Replace every reminder with these: a JSON array of { id, at, title, body }. */
    static void set(Context context, JSONArray items) {
        cancelAll(context);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_ITEMS, items.toString()).apply();
        schedule(context, items);
    }

    /** At boot: the kept list set again, the ones already past left out. */
    static void restore(Context context) {
        schedule(context, stored(context));
    }

    private static JSONArray stored(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            return new JSONArray(prefs.getString(KEY_ITEMS, "[]"));
        } catch (Exception error) {
            return new JSONArray();
        }
    }

    private static void schedule(Context context, JSONArray items) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms == null) return;
        long now = System.currentTimeMillis();
        boolean exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms();
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            long at = item.optLong("at", 0);
            if (at <= now) continue;
            PendingIntent intent = remind(context, item.optString("id"), item.optString("title"), item.optString("body"));
            if (exact) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent);
            else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent);
        }
    }

    private static void cancelAll(Context context) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms == null) return;
        JSONArray old = stored(context);
        for (int i = 0; i < old.length(); i++) {
            JSONObject item = old.optJSONObject(i);
            if (item == null) continue;
            alarms.cancel(remind(context, item.optString("id"), item.optString("title"), item.optString("body")));
        }
    }

    // One pending intent per reminder, told apart by its request code (the
    // id's hash); the extras do not count when Android matches them.
    private static PendingIntent remind(Context context, String id, String title, String body) {
        Intent intent = new Intent(context, CalendarReminderReceiver.class)
            .setAction(ACTION_REMIND)
            .putExtra(EXTRA_ID, id)
            .putExtra(EXTRA_TITLE, title)
            .putExtra(EXTRA_BODY, body);
        return PendingIntent.getBroadcast(context, id.hashCode(), intent, flags());
    }

    /** The notification itself, shown by the receiver at the start. */
    static void show(Context context, String id, String title, String body) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Calendar", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("When a task in your calendar starts");
            channel.enableVibration(true);
            manager.createNotificationChannel(channel);
        }
        PendingIntent open = PendingIntent.getActivity(context, 0, new Intent(context, MainActivity.class), flags());
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_timer)
            .setContentTitle(title == null || title.isEmpty() ? "Calendar" : title)
            .setContentText(body)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(open);
        try {
            manager.notify(id == null ? 0 : id.hashCode(), builder.build());
        } catch (SecurityException refused) {
            // Notifications turned off for Austavia: nothing to show it with.
        }
    }

    private static int flags() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            : PendingIntent.FLAG_UPDATE_CURRENT;
    }
}
