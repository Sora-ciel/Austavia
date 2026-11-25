package com.sora.austavia;

import android.content.Context;
import android.graphics.Color;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;
import android.widget.EditText;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * A native text field laid over the paragraph being written, so the letters
 * take Android's own road to the screen instead of the web view's.
 *
 * Measured 2026-11-25 on the Samsung A15 (PENDING, "The gap to native"):
 * finger lifted to letter on screen, a native field 40ms and steady, any
 * text box in the web view 62ms. Sora's line is the native field's. Stage 1
 * (PENDING, "Native writing layer"): plain paragraphs in Single Note.
 *
 * The page decides when and where (utils/nativeWriting.js) and puts the text
 * back into the note; this only draws the field and says what happened in
 * it: a pause, Enter, Backspace at its start, a new height, the keyboard
 * gone.
 *
 * Backspace at the start: keyboards send nothing when there is nothing left
 * to delete, so the field keeps one invisible character before the text;
 * when it goes, Backspace was pressed there.
 */
@CapacitorPlugin(name = "NativeWriting")
public class NativeWritingPlugin extends Plugin {
    private static final String GUARD = "​";
    private static final long PAUSE_MS = 400;

    private GuardedField field;
    // The note's visible area: the field is drawn inside it and clipped to
    // it, never over the app's controls (seen 2026-11-25: "it wrote over the
    // controls").
    private android.widget.FrameLayout frame;
    private float density = 1f;
    private boolean quiet = false; // our own changes to the text are not news
    private int lastHeight = 0;
    private boolean sawKeyboard = false; // "gone" only counts after it was up
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable pause = () -> notifyText("pause");

    /** An EditText whose caret never goes before the guard. */
    private static class GuardedField extends EditText {
        GuardedField(Context context) { super(context); }
        @Override
        protected void onSelectionChanged(int start, int end) {
            if (getText() != null && getText().toString().startsWith(GUARD) && (start < 1 || end < 1)) {
                setSelection(Math.max(1, start), Math.max(1, end));
                return;
            }
            super.onSelectionChanged(start, end);
        }
    }

    private String plainText() {
        String text = field == null || field.getText() == null ? "" : field.getText().toString();
        return text.startsWith(GUARD) ? text.substring(GUARD.length()) : text;
    }

    private int plainCaret() {
        return field == null ? 0 : Math.max(0, field.getSelectionStart() - GUARD.length());
    }

    private void notifyText(String event) {
        if (field == null) return;
        JSObject data = new JSObject();
        data.put("text", plainText());
        data.put("caret", plainCaret());
        notifyListeners(event, data);
    }

    private void setTextQuietly(String text, int caret) {
        quiet = true;
        field.setText(GUARD + text);
        int at = Math.max(1, Math.min(field.getText().length(), caret + GUARD.length()));
        field.setSelection(at);
        quiet = false;
    }

    private void build(WebView web) {
        Context context = getContext();
        field = new GuardedField(context);
        field.setBackground(null);
        field.setPadding(0, 0, 0, 0);
        field.setIncludeFontPadding(false);
        field.setGravity(Gravity.TOP | Gravity.START);
        field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        field.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {}
            @Override public void afterTextChanged(Editable s) {
                if (quiet) return;
                String all = s.toString();
                // Backspace before the first letter: the guard is gone.
                if (!all.startsWith(GUARD)) {
                    handler.removeCallbacks(pause);
                    JSObject data = new JSObject();
                    data.put("text", all);
                    notifyListeners("joinBackward", data);
                    return;
                }
                String text = all.substring(GUARD.length());
                int newline = text.indexOf('\n');
                if (newline >= 0) {
                    handler.removeCallbacks(pause);
                    JSObject data = new JSObject();
                    data.put("before", text.substring(0, newline));
                    data.put("after", text.substring(newline + 1));
                    notifyListeners("enter", data);
                    return;
                }
                handler.removeCallbacks(pause);
                handler.postDelayed(pause, PAUSE_MS);
            }
        });
        // A new line in the field: the page makes room for it under the paragraph.
        field.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> {
            int height = b - t;
            if (height != lastHeight && height > 0) {
                lastHeight = height;
                JSObject data = new JSObject();
                data.put("height", height / density);
                notifyListeners("height", data);
            }
        });
        // The keyboard put away: the field's text goes back and the field goes.
        View root = getActivity().findViewById(android.R.id.content);
        if (root != null) {
            root.getViewTreeObserver().addOnGlobalLayoutListener(() -> {
                if (field == null || field.getVisibility() != View.VISIBLE) return;
                WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(root);
                if (insets == null) return;
                if (insets.isVisible(WindowInsetsCompat.Type.ime())) { sawKeyboard = true; return; }
                if (sawKeyboard) {
                    handler.removeCallbacks(pause);
                    notifyText("closed");
                    hide(web, false);
                }
            });
        }
        frame = new android.widget.FrameLayout(context);
        frame.setClipChildren(true);
        frame.setClipToPadding(true);
        frame.addView(field, new android.widget.FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        ((ViewGroup) web.getParent()).addView(frame, new ViewGroup.MarginLayoutParams(0, 0));
    }

    /** Where the frame (the note's visible area) and the field (the paragraph) are, in CSS pixels of the page. */
    private void placeAt(WebView web, PluginCall call) {
        double left = call.getDouble("left", 0.0), top = call.getDouble("top", 0.0), width = call.getDouble("width", 100.0);
        double clipLeft = call.getDouble("clipLeft", 0.0), clipTop = call.getDouble("clipTop", 0.0);
        double clipWidth = call.getDouble("clipWidth", 10000.0), clipHeight = call.getDouble("clipHeight", 10000.0);
        ViewGroup.LayoutParams fl = frame.getLayoutParams();
        fl.width = (int) Math.round(clipWidth * density);
        fl.height = (int) Math.round(clipHeight * density);
        frame.setLayoutParams(fl);
        frame.setX((float) (web.getX() + clipLeft * density));
        frame.setY((float) (web.getY() + clipTop * density));
        ViewGroup.LayoutParams lp = field.getLayoutParams();
        lp.width = (int) Math.round(width * density);
        field.setLayoutParams(lp);
        field.setX((float) ((left - clipLeft) * density));
        field.setY((float) ((top - clipTop) * density));
    }

    private void hide(WebView web, boolean giveFocusBack) {
        if (field == null) return;
        field.setVisibility(View.GONE);
        if (frame != null) frame.setVisibility(View.GONE);
        lastHeight = 0;
        sawKeyboard = false;
        if (giveFocusBack && web != null) web.requestFocus();
    }

    private static int parseColor(String css, int fallback) {
        if (css == null) return fallback;
        try {
            String s = css.trim();
            if (s.startsWith("#")) return Color.parseColor(s);
            if (s.startsWith("rgb")) {
                String[] p = s.substring(s.indexOf('(') + 1, s.indexOf(')')).split("[,\\s/]+");
                int r = Math.round(Float.parseFloat(p[0]));
                int g = Math.round(Float.parseFloat(p[1]));
                int b = Math.round(Float.parseFloat(p[2]));
                int a = p.length > 3 ? Math.round(Float.parseFloat(p[3]) * 255) : 255;
                return Color.argb(a, r, g, b);
            }
        } catch (Exception ignored) { }
        return fallback;
    }

    /** Lay the field over a paragraph: where, how it looks, its text and caret. */
    @PluginMethod
    public void open(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            WebView web = getBridge().getWebView();
            if (web == null) { call.reject("no web view"); return; }
            density = web.getResources().getDisplayMetrics().density;
            if (field == null) build(web);
            double fontSize = call.getDouble("fontSize", 16.0), lineHeight = call.getDouble("lineHeight", 0.0);
            placeAt(web, call);
            field.setTextSize(TypedValue.COMPLEX_UNIT_PX, (float) (fontSize * density));
            if (lineHeight > 0 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) field.setLineHeight((int) Math.round(lineHeight * density));
            field.setTextColor(parseColor(call.getString("color"), Color.WHITE));
            double letterSpacing = call.getDouble("letterSpacingEm", 0.0);
            field.setLetterSpacing((float) letterSpacing);
            setTextQuietly(call.getString("text", ""), call.getInt("caret", 0));
            frame.setVisibility(View.VISIBLE);
            field.setVisibility(View.VISIBLE);
            frame.bringToFront();
            field.requestFocus();
            InputMethodManager imm = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) imm.showSoftInput(field, InputMethodManager.SHOW_IMPLICIT);
            call.resolve();
        });
    }

    /** The field moved with its paragraph (the keyboard opening, the page re-laid out), its text untouched. */
    @PluginMethod
    public void place(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            WebView web = getBridge().getWebView();
            if (web != null && field != null && frame != null) placeAt(web, call);
            call.resolve();
        });
    }

    /** Take the field away; its text and caret are answered. */
    @PluginMethod
    public void close(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            handler.removeCallbacks(pause);
            JSObject data = new JSObject();
            data.put("text", plainText());
            data.put("caret", plainCaret());
            hide(getBridge().getWebView(), call.getBoolean("focusPage", true));
            call.resolve(data);
        });
    }

    /** Replace the field's text (after the page split or joined a paragraph). */
    @PluginMethod
    public void setText(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (field != null) setTextQuietly(call.getString("text", ""), call.getInt("caret", 0));
            call.resolve();
        });
    }
}
