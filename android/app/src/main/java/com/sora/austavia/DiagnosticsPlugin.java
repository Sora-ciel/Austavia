package com.sora.austavia;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * What the native side has actually seen, for the app's diagnostics report.
 *
 * Exists because a fault on this side of the bridge is invisible from the page,
 * and guessing at one from the outside has now cost several builds. The cover
 * that would not appear was three wrong guesses before a report of this shape
 * found it in one go; this is the same idea pointed at the keyboard's pictures.
 *
 * It reads static counters rather than holding anything of its own, so asking
 * cannot change what is being measured.
 */
@CapacitorPlugin(name = "Diagnostics")
public class DiagnosticsPlugin extends Plugin {

    @PluginMethod
    public void picturePaste(PluginCall call) {
        JSObject out = new JSObject();
        // The layout override really took effect and this class is the WebView.
        out.put("installed", ImagePasteWebView.installed);
        // Zero here means the keyboard never asked us to set up input, so it was
        // never told we accept pictures -- which is the message it shows.
        out.put("inputConnectionsCreated", ImagePasteWebView.inputConnectionsCreated);
        out.put("mimeTypesDeclared", ImagePasteWebView.mimeTypesDeclared);
        // Zero here, with the types declared, means the keyboard was told and
        // still did not offer -- a different fault entirely.
        out.put("contentOffers", ImagePasteWebView.contentOffers);
        out.put("lastOffer", ImagePasteWebView.lastOffer);
        out.put("lastPictureBytes", ImagePasteWebView.lastPictureBytes);
        out.put("lastDataUrlChars", ImagePasteWebView.lastDataUrlChars);
        out.put("deliveriesToPage", ImagePasteWebView.deliveriesToPage);
        out.put("lastError", ImagePasteWebView.lastError);
        call.resolve(out);
    }
}
