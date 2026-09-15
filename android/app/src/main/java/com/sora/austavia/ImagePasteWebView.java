package com.sora.austavia;

import android.content.ClipData;
import android.content.Context;
import android.net.Uri;
import android.util.AttributeSet;
import android.util.Base64;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;

import androidx.core.view.ContentInfoCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.inputmethod.EditorInfoCompat;
import androidx.core.view.inputmethod.InputConnectionCompat;

import com.getcapacitor.CapacitorWebView;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * A WebView that lets the keyboard hand it a picture.
 *
 * Reported from a phone: the keyboard says the app does not allow pasting an
 * image. That message is the keyboard's, and it was accurate — a keyboard does
 * not insert a picture through the clipboard. It calls
 * {@link InputConnection#commitContent}, and an app has to say up front which
 * kinds of content it accepts by putting them on the {@link EditorInfo}.
 * Capacitor's own WebView sets none, so there was nothing to accept with, and
 * the keyboard reported exactly that.
 *
 * <p>Two halves are needed and neither works alone: the types have to be
 * declared on the EditorInfo so the keyboard offers the picture at all, and a
 * receiver has to be registered so there is somewhere for it to go.
 *
 * <p>The bytes are read here and handed to the page as a data URL, because the
 * page is where notes are. The URI a keyboard provides is temporary and
 * readable only through the grant that comes with it, so it cannot simply be
 * pointed at from HTML.
 *
 * <p>Capacitor inflates {@code bridge_layout_main.xml} to create its WebView.
 * The copy in this app's own {@code res/layout} overrides the library's and
 * names this class, which is the only reason any of this runs.
 */
public class ImagePasteWebView extends CapacitorWebView {

    /** Anything that is a picture. The page decides what it can actually draw. */
    private static final String[] ACCEPTED = new String[] { "image/*" };

    /** A guard against a keyboard offering something enormous. */
    private static final int MAX_BYTES = 12 * 1024 * 1024;

    public ImagePasteWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
        ViewCompat.setOnReceiveContentListener(this, ACCEPTED, this::onReceiveContent);
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
        InputConnection connection = super.onCreateInputConnection(outAttrs);
        if (connection == null) return null;

        EditorInfoCompat.setContentMimeTypes(outAttrs, ACCEPTED);
        return InputConnectionCompat.createWrapper(this, connection, outAttrs);
    }

    /**
     * Everything arriving that was not typed: a keyboard's picture, and a paste
     * carrying one.
     *
     * The contract is to return whatever was *not* handled, so the WebView goes
     * on dealing with it as it always did. Returning null for everything would
     * break pasting text.
     *
     * Deliberately all-or-nothing: this only steps in when every item is a
     * picture, which is what a keyboard commit and an image paste both are.
     * A mixed payload is passed through untouched rather than half-taken,
     * because the alternative is quietly dropping the writing that came with it
     * — and splitting a ClipData to hand back the remainder is more machinery
     * than the case is worth.
     */
    private ContentInfoCompat onReceiveContent(View view, ContentInfoCompat payload) {
        ClipData clip = payload.getClip();
        if (clip == null || clip.getItemCount() == 0) return payload;

        for (int i = 0; i < clip.getItemCount(); i += 1) {
            if (clip.getItemAt(i).getUri() == null) return payload;
        }

        boolean tookSomething = false;
        for (int i = 0; i < clip.getItemCount(); i += 1) {
            if (sendToPage(clip.getItemAt(i).getUri())) tookSomething = true;
        }

        // Anything it could not read — not a picture, too big, unreadable — is
        // handed back rather than swallowed.
        return tookSomething ? null : payload;
    }

    /**
     * Read now, deliver after.
     *
     * The read is synchronous on purpose: the permission to look at the URI
     * lasts for this call, and going away to another thread to be tidy is how
     * it would come back to find the grant gone. The delivery is posted,
     * because a WebView will only take JavaScript from its own thread.
     */
    private boolean sendToPage(Uri uri) {
        String type = getContext().getContentResolver().getType(uri);
        if (type == null || !type.startsWith("image/")) return false;

        byte[] bytes = readAll(uri);
        if (bytes == null) return false;

        final String dataUrl = "data:" + type + ";base64," + Base64.encodeToString(bytes, Base64.NO_WRAP);
        post(() -> evaluateJavascript(
            "window.__austaviaPasteImage && window.__austaviaPasteImage('" + dataUrl + "')",
            null
        ));
        return true;
    }

    private byte[] readAll(Uri uri) {
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            if (in == null) return null;

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[16 * 1024];
            int read;
            int total = 0;
            while ((read = in.read(buffer)) != -1) {
                total += read;
                // Stopped rather than truncated: half a picture is not a
                // picture, and pretending otherwise puts a broken one in a note.
                if (total > MAX_BYTES) return null;
                out.write(buffer, 0, read);
            }
            return out.toByteArray();
        } catch (Exception error) {
            return null;
        }
    }
}
