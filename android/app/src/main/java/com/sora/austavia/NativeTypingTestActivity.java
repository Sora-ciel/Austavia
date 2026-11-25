package com.sora.austavia;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * A plain native text field, for comparing typing by feel: the fastest this
 * phone can show a letter, without the web view the app is drawn in.
 *
 * Asked 2026-11-25: "you don't want to try out the fastest we could do
 * first? to see how fast we can actually go at best." Measured the same day:
 * typing in a note had come down to a bare web text box's speed, which still
 * felt clunky; this is the step below that. Staging only -- it closes at
 * once anywhere else -- and opened from a computer over USB:
 *   adb shell am start -n com.sora.austavia.staging/com.sora.austavia.NativeTypingTestActivity
 * Nothing typed here is kept.
 */
public class NativeTypingTestActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (!getPackageName().endsWith(".staging")) {
            finish();
            return;
        }
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setBackgroundColor(Color.BLACK);
        int pad = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 16, getResources().getDisplayMetrics());
        column.setPadding(pad, pad * 3, pad, pad);

        TextView title = new TextView(this);
        title.setText("Native text field (test) - write here");
        title.setTextColor(Color.argb(180, 255, 255, 255));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        column.addView(title);

        EditText field = new EditText(this);
        field.setTextColor(Color.WHITE);
        field.setBackgroundColor(Color.BLACK);
        field.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        field.setGravity(Gravity.TOP | Gravity.START);
        field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        column.addView(field, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        setContentView(column);
        field.requestFocus();
    }
}
