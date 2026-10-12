//! Google sign-in for the Linux desktop app, in a window of the app's own.
//!
//! The main webview cannot run Firebase's popup (WebKitGTK opens no popup, and
//! Firebase will not run one from a `tauri://` page). The first fix sent the
//! sign-in to the system browser and back over localhost; it was asked to be
//! in the app instead, because "it doesn't do the link between the two well".
//!
//! So this opens Google's own sign-in page in a small window, and watches where
//! that window is sent at the end. Google finishes by sending it to the
//! project's auth handler with the ID token in the address; that address is
//! caught before it loads, handed to the page as an event, and the window
//! closes. Everything about the address — what it asks Google for, checking
//! the answer belongs to this sign-in — is decided in the page, in
//! `src/utils/desktopSignIn.js`. This file only opens, watches and reports.
//!
//! The window loads Google, not the app, and is not in any capability, so the
//! page in it has no access to the app at all.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};

/// Must match SIGN_IN_EVENT in src/utils/desktopSignIn.js.
const SIGN_IN_EVENT: &str = "sign-in-window";
/// Each window gets its own label, so a replacement never collides with the
/// one it replaces while that is still closing.
static NEXT: AtomicU64 = AtomicU64::new(0);

/// The open window, and whether it has already said how it ended. Kept so a
/// window being replaced can be marked as settled first: otherwise closing it
/// would report "closed" to the sign-in that replaced it.
static OPEN: Mutex<Option<(String, Arc<AtomicBool>)>> = Mutex::new(None);

/// Whether `address` is the end of the sign-in: the handler Google was asked
/// to send the answer to.
fn is_the_answer(address: &str, redirect: &str) -> bool {
  !redirect.is_empty()
    && address.starts_with(redirect)
    && matches!(address.as_bytes().get(redirect.len()), None | Some(b'#') | Some(b'?'))
}

/// Opens Google's sign-in at `url`, and reports the address it ends on once it
/// reaches `redirect`, or that the window was closed first.
#[tauri::command]
pub async fn open_sign_in_window(app: AppHandle, url: String, redirect: String) -> Result<(), String> {
  let url: Url = url.parse().map_err(|e| format!("bad sign-in address: {e}"))?;
  if url.scheme() != "https" {
    return Err("the sign-in address must be https".into());
  }

  // A second press replaces a sign-in window left open, rather than stacking.
  let answered = Arc::new(AtomicBool::new(false));
  let label = format!("google-sign-in-{}", NEXT.fetch_add(1, Ordering::SeqCst));
  let previous = OPEN.lock().ok().and_then(|mut open| open.replace((label.clone(), answered.clone())));
  if let Some((old_label, old_answered)) = previous {
    old_answered.store(true, Ordering::SeqCst);
    if let Some(old) = app.get_webview_window(&old_label) {
      let _ = old.destroy();
    }
  }

  let report = {
    let app = app.clone();
    let answered = answered.clone();
    let redirect = redirect.clone();
    let label = label.clone();
    move |address: &str| -> bool {
      if !is_the_answer(address, &redirect) {
        return false;
      }
      if !answered.swap(true, Ordering::SeqCst) {
        let _ = app.emit(SIGN_IN_EVENT, serde_json::json!({ "url": address }));
        let app = app.clone();
        let label = label.clone();
        // Not from inside the navigation callback itself.
        tauri::async_runtime::spawn(async move {
          if let Some(window) = app.get_webview_window(&label) {
            let _ = window.close();
          }
          if let Some(main) = app.get_webview_window("main") {
            let _ = main.set_focus();
          }
        });
      }
      true
    }
  };
  let on_navigation = report.clone();
  let on_load = report;

  let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url))
    .title("Sign in with Google")
    .inner_size(480.0, 640.0)
    .center()
    // Refuse to load the handler page: everything needed is in its address,
    // and the page itself is not wanted in this window.
    .on_navigation(move |address| !on_navigation(address.as_str()))
    // In case a redirect slipped past the navigation check, catch it as it
    // starts to load instead.
    .on_page_load(move |_, payload| {
      on_load(payload.url().as_str());
    })
    .build()
    .map_err(|e| e.to_string())?;

  let app_for_close = app.clone();
  window.on_window_event(move |event| {
    if matches!(event, WindowEvent::Destroyed) && !answered.swap(true, Ordering::SeqCst) {
      let _ = app_for_close.emit(SIGN_IN_EVENT, serde_json::json!({ "cancelled": true }));
    }
  });
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  const HANDLER: &str = "https://arial-473c1.firebaseapp.com/__/auth/handler";

  #[test]
  fn the_handler_with_the_token_is_the_answer() {
    assert!(is_the_answer(&format!("{HANDLER}#id_token=abc&state=s"), HANDLER));
    assert!(is_the_answer(&format!("{HANDLER}?error=access_denied"), HANDLER));
  }

  #[test]
  fn googles_own_pages_are_not() {
    assert!(!is_the_answer("https://accounts.google.com/v3/signin/identifier", HANDLER));
  }

  #[test]
  fn a_look_alike_address_is_not() {
    assert!(!is_the_answer(&format!("{HANDLER}-not#id_token=abc"), HANDLER));
    assert!(!is_the_answer("https://arial-473c1.firebaseapp.com.evil.example/__/auth/handler", HANDLER));
    assert!(!is_the_answer("anything", ""));
  }
}
