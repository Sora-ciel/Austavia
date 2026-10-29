package com.sora.austavia;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;

/**
 * Saves a file into the phone's Downloads folder, and can put it on the
 * clipboard as well.
 *
 * Asked 2026-10-29: "for the best quality we'll have the app download the
 * image in the download folder of Android and also copy it, because our
 * sharing doesn't make it easy to actually export at our actual resolution."
 * The share sheet hands the picture to whatever is picked, and most of those
 * re-compress it; a file written to Downloads is the picture as drawn.
 *
 * Written through MediaStore, which needs no storage permission from Android
 * 10 on -- the reason the web layer could not do this itself. On older phones
 * this refuses, and the web layer falls back to the share sheet
 * (utils/fileDelivery.js).
 *
 * The clipboard gets the saved file's own address (a content:// link), which
 * is how Android passes a picture to whatever it is pasted into.
 */
@CapacitorPlugin(name = "SaveToDevice")
public class SaveToDevicePlugin extends Plugin {

    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Saving to Downloads needs Android 10 or later");
            return;
        }
        String name = call.getString("name", "austavia");
        String mime = call.getString("mime", "application/octet-stream");
        String data = call.getString("data");
        boolean copy = Boolean.TRUE.equals(call.getBoolean("copy", false));
        if (data == null || data.isEmpty()) {
            call.reject("Nothing to save");
            return;
        }

        Context context = getContext();
        ContentResolver resolver = context.getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri uri = null;
        try {
            uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("Downloads would not take the file");
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new IllegalStateException("Could not write the file");
                out.write(bytes);
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, done, null, null);
        } catch (Exception error) {
            // Leave nothing half-written behind.
            if (uri != null) {
                try { resolver.delete(uri, null, null); } catch (Exception ignored) { }
            }
            call.reject("Could not save to Downloads: " + error.getMessage(), error);
            return;
        }

        boolean copied = false;
        if (copy) {
            try {
                ClipboardManager clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
                clipboard.setPrimaryClip(ClipData.newUri(resolver, name, uri));
                copied = true;
            } catch (Exception ignored) {
                // Saved all the same; the message says it was not copied.
            }
        }

        JSObject out = new JSObject();
        out.put("uri", uri.toString());
        out.put("copied", copied);
        call.resolve(out);
    }
}
