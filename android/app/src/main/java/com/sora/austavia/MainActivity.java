package com.sora.austavia;

import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // Registered before the bridge starts so the web layer can call it
        // as soon as it loads.
        registerPlugin(MediaNotificationPlugin.class);
        registerPlugin(DiagnosticsPlugin.class);
        super.onCreate(savedInstanceState);
        keepTheWebViewAboveTheKeyboard();
    }

    /**
     * Shrink the page to the room above the on-screen keyboard.
     *
     * Without this the controls leave the screen as soon as anybody starts
     * writing. The window has nothing in it but one full-screen WebView, so
     * when the keyboard opens Android slides the whole window up to keep the
     * caret visible — carrying the toolbar off the top, and nothing in the page
     * can scroll it back because from the page's point of view nothing moved.
     *
     * `android:windowSoftInputMode="adjustResize"` in the manifest says to
     * resize rather than slide, and it is set. It is not enough on its own:
     * this app targets SDK 35, where an app is edge-to-edge by default and the
     * system stops resizing the window for the keyboard at all. The keyboard
     * arrives as a window inset instead, and an app that does not read it
     * simply has its content sit underneath.
     *
     * So the inset is read and spent as padding. The page's own height follows
     * the WebView, so 100dvh shrinks with it, the app re-lays out to the room
     * it has, and the editor's scroller puts the caret on screen — which is the
     * browser's job and one it does well once it is given the true height.
     *
     * With the keyboard closed the inset is zero and this changes nothing.
     */
    private void keepTheWebViewAboveTheKeyboard() {
        final View content = findViewById(android.R.id.content);
        if (content == null) return;

        ViewCompat.setOnApplyWindowInsetsListener(content, (view, insets) -> {
            Insets keyboard = insets.getInsets(WindowInsetsCompat.Type.ime());
            view.setPadding(
                view.getPaddingLeft(),
                view.getPaddingTop(),
                view.getPaddingRight(),
                keyboard.bottom
            );
            // Passed on untouched: the page draws its own safe areas from
            // env(safe-area-inset-*), and swallowing the insets here would
            // leave it nothing to read them from.
            return insets;
        });
    }
}
