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

    // ── What actually happened, link by link ────────────────────────
    // Reported through DiagnosticsPlugin and printed in the app's diagnostics.
    // The picture crosses four boundaries between the keyboard and the note --
    // the keyboard asking us what we accept, the keyboard handing one over,
    // reading it out of a temporary URI, and getting it into the page -- and
    // from outside all four failures look like "nothing happened". These say
    // which one it was.

    /** The constructor ran, so the layout override really is in effect. */
    public static volatile boolean installed = false;
    /** How many times the keyboard has asked us to set up input. Zero is a finding. */
    public static volatile int inputConnectionsCreated = 0;
    /** Whether we got as far as declaring what we accept. */
    public static volatile boolean mimeTypesDeclared = false;
    /** How many times the keyboard has actually offered us content. */
    public static volatile int contentOffers = 0;
    public static volatile String lastOffer = "nothing offered yet";
    public static volatile int lastPictureBytes = -1;
    public static volatile int lastDataUrlChars = -1;
    public static volatile int deliveriesToPage = 0;
    public static volatile String lastError = null;

    /** Anything that is a picture. The page decides what it can actually draw. */
    private static final String[] ACCEPTED = new String[] { "image/*" };

    /** A guard against a keyboard offering something enormous. */
    private static final int MAX_BYTES = 12 * 1024 * 1024;

    public ImagePasteWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
        installed = true;
        ViewCompat.setOnReceiveContentListener(this, ACCEPTED, this::onReceiveContent);
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
        inputConnectionsCreated += 1;
        InputConnection connection = super.onCreateInputConnection(outAttrs);
        if (connection == null) {
            // Worth recording rather than returning quietly: with no connection
            // there is nothing to declare anything on, and the keyboard is
            // never told we take pictures.
            lastError = "super.onCreateInputConnection returned null";
            return null;
        }

        EditorInfoCompat.setContentMimeTypes(outAttrs, ACCEPTED);
        mimeTypesDeclared = true;
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
        contentOffers += 1;

        ClipData clip = payload.getClip();
        if (clip == null || clip.getItemCount() == 0) {
            lastOffer = "an offer with nothing in it";
            return payload;
        }

        for (int i = 0; i < clip.getItemCount(); i += 1) {
            if (clip.getItemAt(i).getUri() == null) {
                lastOffer = "offered " + clip.getItemCount() + " item(s), not all of them files";
                return payload;
            }
        }

        boolean tookSomething = false;
        for (int i = 0; i < clip.getItemCount(); i += 1) {
            if (sendToPage(clip.getItemAt(i).getUri())) tookSomething = true;
        }
        lastOffer = tookSomething
            ? "took " + clip.getItemCount() + " item(s)"
            : "offered " + clip.getItemCount() + " item(s) but could read none";

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
        if (type == null || !type.startsWith("image/")) {
            lastError = "offered something that is not a picture: " + type;
            return false;
        }

        byte[] bytes = readAll(uri);
        if (bytes == null) {
            // readAll already said why.
            lastPictureBytes = -1;
            return false;
        }
        lastPictureBytes = bytes.length;

        final String dataUrl = "data:" + type + ";base64," + Base64.encodeToString(bytes, Base64.NO_WRAP);
        lastDataUrlChars = dataUrl.length();
        deliveriesToPage += 1;
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
                if (total > MAX_BYTES) {
                    lastError = "picture larger than the " + (MAX_BYTES / (1024 * 1024)) + "MB limit";
                    return null;
                }
                out.write(buffer, 0, read);
            }
            return out.toByteArray();
        } catch (Exception error) {
            lastError = "could not read the picture: " + error.getClass().getSimpleName();
            return null;
        }
    }
}
