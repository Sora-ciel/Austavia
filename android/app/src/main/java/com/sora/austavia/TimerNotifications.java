package com.sora.austavia;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.text.format.DateFormat;

import androidx.core.app.NotificationCompat;

import java.util.Date;

/**
 * The timer in the notification shade, on a phone.
 *
 * Asked for on 2026-09-29: "on phone I believe the timer should be a
 * notification instead, but not show on controls, cause that would take too
 * much space". The web layer decides what to show (utils/timerChip.js) and
 * hands it here; this only draws it.
 *
 * While a timer runs, the countdown is Android's own chronometer counting to
 * the moment it ends, so it stays right with the app asleep or gone. The end
 * is also handed to the alarm manager, so "Time's up" arrives with sound when
 * the app is not in front -- inexact, because an exact alarm needs a
 * permission a notes app has no business asking for, so on a phone that has
 * been idle for a while it can come a little late.
 */
final class TimerNotifications {
    static final String CHANNEL_RUNNING = "timer";
    static final String CHANNEL_DONE = "timer-done";
    static final int NOTIFICATION_ID = 7301;

    static final String ACTION_TOGGLE = "com.sora.austavia.timer.TOGGLE";
    static final String ACTION_PLUS = "com.sora.austavia.timer.PLUS";
    static final String ACTION_STOP = "com.sora.austavia.timer.STOP";
    static final String ACTION_DONE = "com.sora.austavia.timer.DONE";
    static final String EXTRA_BLOCK = "blockId";
    static final String EXTRA_TITLE = "title";

    private TimerNotifications() {}

    /**
     * Shows or replaces the notification. `phase` is running, paused or
     * ringing; `endsAt` is the moment a running timer ends, 0 otherwise.
     */
    static void show(Context context, String blockId, String phase, long endsAt, String title, String text) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        ensureChannels(manager);

        boolean ringing = "ringing".equals(phase);
        boolean running = "running".equals(phase) && endsAt > 0;
        // Heard only when there is nobody in the app to hear it ring there.
        boolean loud = ringing && !TimerNotificationPlugin.appInFront;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, loud ? CHANNEL_DONE : CHANNEL_RUNNING)
            .setSmallIcon(R.drawable.ic_stat_timer)
            .setContentTitle(title == null || title.isEmpty() ? "Timer" : title)
            .setContentText(running
                ? "Ends at " + DateFormat.getTimeFormat(context).format(new Date(endsAt))
                : text)
            .setContentIntent(openApp(context))
            // Not swiped away by accident while it counts; once it has rung
            // it can go.
            .setOngoing(!ringing)
            .setOnlyAlertOnce(true)
            .setSilent(!loud)
            .setPriority(loud ? NotificationCompat.PRIORITY_HIGH : NotificationCompat.PRIORITY_LOW)
            .setCategory(ringing ? NotificationCompat.CATEGORY_ALARM : NotificationCompat.CATEGORY_STATUS)
            .setShowWhen(running);

        if (running) {
            builder.setWhen(endsAt).setUsesChronometer(true).setChronometerCountDown(true);
        }

        if (!ringing) {
            builder.addAction(0, "running".equals(phase) ? "Pause" : "Resume", action(context, ACTION_TOGGLE, blockId, 1));
        }
        builder.addAction(0, "+1 min", action(context, ACTION_PLUS, blockId, 2));
        builder.addAction(0, "Stop", action(context, ACTION_STOP, blockId, 3));

        manager.notify(NOTIFICATION_ID, builder.build());

        if (running) scheduleDone(context, endsAt, blockId, title);
        else cancelDone(context);
    }

    static void clear(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(NOTIFICATION_ID);
        cancelDone(context);
    }

    private static void scheduleDone(Context context, long endsAt, String blockId, String title) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms == null) return;
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, done(context, blockId, title));
    }

    private static void cancelDone(Context context) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms != null) alarms.cancel(done(context, "", ""));
    }

    private static PendingIntent done(Context context, String blockId, String title) {
        Intent intent = new Intent(context, TimerNotificationReceiver.class)
            .setAction(ACTION_DONE)
            .putExtra(EXTRA_BLOCK, blockId)
            .putExtra(EXTRA_TITLE, title);
        return PendingIntent.getBroadcast(context, 4, intent, flags());
    }

    private static PendingIntent action(Context context, String action, String blockId, int requestCode) {
        Intent intent = new Intent(context, TimerNotificationReceiver.class)
            .setAction(action)
            .putExtra(EXTRA_BLOCK, blockId);
        return PendingIntent.getBroadcast(context, requestCode, intent, flags());
    }

    private static PendingIntent openApp(Context context) {
        return PendingIntent.getActivity(context, 0, new Intent(context, MainActivity.class), flags());
    }

    private static int flags() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            : PendingIntent.FLAG_UPDATE_CURRENT;
    }

    private static void ensureChannels(NotificationManager manager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (manager.getNotificationChannel(CHANNEL_RUNNING) == null) {
            NotificationChannel running = new NotificationChannel(CHANNEL_RUNNING, "Timer", NotificationManager.IMPORTANCE_LOW);
            running.setDescription("A timer counting down");
            running.setShowBadge(false);
            manager.createNotificationChannel(running);
        }
        if (manager.getNotificationChannel(CHANNEL_DONE) == null) {
            NotificationChannel done = new NotificationChannel(CHANNEL_DONE, "Timer done", NotificationManager.IMPORTANCE_HIGH);
            done.setDescription("When a timer runs out and the app is not open");
            done.enableVibration(true);
            manager.createNotificationChannel(done);
        }
    }
}
