package com.sora.austavia;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.os.Build;
import android.os.SystemClock;
import android.text.format.DateFormat;
import android.view.View;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;

import java.util.Date;

/**
 * The timer in the notification shade, on a phone.
 *
 * Asked for on 2026-09-29: "on phone I believe the timer should be a
 * notification instead, but not show on controls, cause that would take too
 * much space". Then, once tried, on 2026-10-05: "it shows only when the timer
 * is up but it should also show the countdown like a normal timer app ...
 * hopefully it follows the colour of the themes and has the buttons like our
 * pop-up".
 *
 * The web layer decides what to show (utils/timerChip.js) and hands it here;
 * this only draws it.
 *
 * ## How it looks
 *
 * Our own layout (notification_timer.xml) inside the system's frame: the
 * countdown big on the left, the pop-up's three buttons on the right --
 * pause/resume, +1, and the loop arrow that sets it back. Painted in the
 * theme's dialog colours, which arrive with each update. A plain notification
 * cannot be recoloured -- Android only lets a foreground service's be -- but
 * the inside of a custom one can.
 *
 * The countdown is Android's own Chronometer counting to the moment the timer
 * ends, so it stays right with the app asleep or gone.
 *
 * ## Why it went unseen
 *
 * The first version posted the running timer on a low-importance channel,
 * which Android files under "Silent" at the bottom of the shade, collapsed --
 * so only the loud "Time's up" was ever noticed. The running timer now has a
 * channel of normal importance with no sound, which sits with the other
 * notifications, as a timer app's does.
 *
 * ## Time's up
 *
 * The end is also handed to the alarm manager, so "Time's up" arrives with
 * sound when the app is not in front -- inexact, because an exact alarm needs
 * a permission a notes app has no business asking for, so on a phone that has
 * been idle for a while it can come a little late.
 */
final class TimerNotifications {
    // Superseded: a low-importance channel, filed under "Silent". A channel's
    // importance cannot be changed once created, so the new one has a new id
    // and this one is deleted where it exists.
    private static final String CHANNEL_OLD = "timer";
    static final String CHANNEL_RUNNING = "timer-live";
    static final String CHANNEL_DONE = "timer-done";
    static final int NOTIFICATION_ID = 7301;

    static final String ACTION_TOGGLE = "com.sora.austavia.timer.TOGGLE";
    static final String ACTION_PLUS = "com.sora.austavia.timer.PLUS";
    static final String ACTION_STOP = "com.sora.austavia.timer.STOP";
    static final String ACTION_DONE = "com.sora.austavia.timer.DONE";
    static final String EXTRA_BLOCK = "blockId";
    static final String EXTRA_TITLE = "title";

    /** The theme's colours, as Android colour ints; null for "use the defaults". */
    static final class Colors {
        final Integer background;
        final Integer text;
        final Integer accent;

        Colors(Integer background, Integer text, Integer accent) {
            this.background = background;
            this.text = text;
            this.accent = accent;
        }

        static final Colors NONE = new Colors(null, null, null);
    }

    private TimerNotifications() {}

    /**
     * Shows or replaces the notification. `phase` is running, paused or
     * ringing; `endsAt` is the moment a running timer ends, 0 otherwise;
     * `remaining` is what a paused one has left, already written out.
     */
    static void show(Context context, String blockId, String phase, long endsAt, String title,
                     String text, String remaining, Colors colors) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        ensureChannels(manager);
        if (colors == null) colors = Colors.NONE;

        boolean ringing = "ringing".equals(phase);
        boolean running = "running".equals(phase) && endsAt > 0;
        boolean paused = "paused".equals(phase);
        // Heard only when there is nobody in the app to hear it ring there.
        boolean loud = ringing && !TimerNotificationPlugin.appInFront;

        RemoteViews view = timerView(context, blockId, running, paused, ringing, endsAt,
            ringing ? "Time's up" : remaining, colors);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, loud ? CHANNEL_DONE : CHANNEL_RUNNING)
            .setSmallIcon(R.drawable.ic_stat_timer)
            // Still set: they are what the lock screen and accessibility read,
            // and what shows where a custom view is not drawn.
            .setContentTitle(title == null || title.isEmpty() ? "Timer" : title)
            .setContentText(running
                ? "Ends at " + DateFormat.getTimeFormat(context).format(new Date(endsAt))
                : text)
            .setContentIntent(openApp(context))
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(view)
            .setCustomBigContentView(view)
            // Not swiped away by accident while it counts; once it has rung
            // it can go.
            .setOngoing(!ringing)
            .setOnlyAlertOnce(true)
            .setSilent(!loud)
            .setPriority(loud ? NotificationCompat.PRIORITY_HIGH : NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(ringing ? NotificationCompat.CATEGORY_ALARM : NotificationCompat.CATEGORY_STOPWATCH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setShowWhen(false);

        if (colors.accent != null) builder.setColor(colors.accent);

        manager.notify(NOTIFICATION_ID, builder.build());

        if (running) scheduleDone(context, endsAt, blockId, title);
        else cancelDone(context);
    }

    private static RemoteViews timerView(Context context, String blockId, boolean running, boolean paused,
                                         boolean ringing, long endsAt, String label, Colors colors) {
        RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.notification_timer);

        if (running) {
            // The Chronometer counts in the phone's uptime, not the clock: the
            // end is turned into the uptime at which it falls.
            long base = SystemClock.elapsedRealtime() + (endsAt - System.currentTimeMillis());
            view.setChronometer(R.id.timer_clock, base, null, true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                view.setChronometerCountDown(R.id.timer_clock, true);
            }
            view.setViewVisibility(R.id.timer_clock, View.VISIBLE);
            view.setViewVisibility(R.id.timer_label, View.GONE);
        } else {
            view.setChronometer(R.id.timer_clock, SystemClock.elapsedRealtime(), null, false);
            view.setViewVisibility(R.id.timer_clock, View.GONE);
            view.setViewVisibility(R.id.timer_label, View.VISIBLE);
            view.setTextViewText(R.id.timer_label, label == null ? "" : label);
        }

        view.setImageViewResource(R.id.timer_toggle, running ? R.drawable.ic_media_pause : R.drawable.ic_media_play);
        view.setViewVisibility(R.id.timer_toggle, ringing ? View.GONE : View.VISIBLE);

        view.setOnClickPendingIntent(R.id.timer_toggle, action(context, ACTION_TOGGLE, blockId, 1));
        view.setOnClickPendingIntent(R.id.timer_plus, action(context, ACTION_PLUS, blockId, 2));
        view.setOnClickPendingIntent(R.id.timer_stop, action(context, ACTION_STOP, blockId, 3));

        // The theme's colours: its dialog background for the panel, its writing
        // for the time and the buttons (on round faint backs of the same
        // writing, as the pop-up's), its accent for the one that stops. The
        // panel is rounded (notification_timer_bg) and tinted rather than
        // painted, so it keeps its corners; before Android 12 a view cannot
        // be tinted from here and it keeps its drawn colour.
        boolean canTint = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S;
        if (colors.background != null && canTint) {
            view.setColorStateList(R.id.timer_root, "setBackgroundTintList", ColorStateList.valueOf(colors.background));
        }
        if (colors.text != null && canTint) {
            ColorStateList faint = ColorStateList.valueOf((colors.text & 0x00FFFFFF) | 0x2E000000);
            view.setColorStateList(R.id.timer_toggle, "setBackgroundTintList", faint);
            view.setColorStateList(R.id.timer_plus, "setBackgroundTintList", faint);
            view.setColorStateList(R.id.timer_stop, "setBackgroundTintList", faint);
        }
        if (colors.text != null) {
            view.setTextColor(R.id.timer_clock, colors.text);
            view.setTextColor(R.id.timer_label, colors.text);
            view.setTextColor(R.id.timer_plus, colors.text);
            view.setInt(R.id.timer_toggle, "setColorFilter", colors.text);
        }
        Integer stopColor = colors.accent != null ? colors.accent : colors.text;
        if (stopColor != null) view.setInt(R.id.timer_stop, "setColorFilter", stopColor);

        return view;
    }

    static void clear(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(NOTIFICATION_ID);
        cancelDone(context);
    }

    /** An Android colour from "#AARRGGBB" or "#RRGGBB"; null when there is none. */
    static Integer parseColor(String value) {
        if (value == null || value.isEmpty()) return null;
        try {
            return Color.parseColor(value);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
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
        if (manager.getNotificationChannel(CHANNEL_OLD) != null) {
            manager.deleteNotificationChannel(CHANNEL_OLD);
        }
        if (manager.getNotificationChannel(CHANNEL_RUNNING) == null) {
            // Normal importance so it sits with the other notifications rather
            // than under "Silent" -- and no sound or buzz, because a timer
            // counting down is not news.
            NotificationChannel running = new NotificationChannel(CHANNEL_RUNNING, "Timer", NotificationManager.IMPORTANCE_DEFAULT);
            running.setDescription("A timer counting down");
            running.setSound(null, null);
            running.enableVibration(false);
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
