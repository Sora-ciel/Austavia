/// Keep the page running when the window is not on screen.
///
/// Music stopped whenever the desktop window was minimised. Nothing in the app
/// pauses it — Chromium does. A window that is minimised counts as occluded, an
/// occluded window's renderer is backgrounded, and a backgrounded renderer has
/// its timers throttled and its media suspended. The page is simply told to
/// stop doing things nobody is looking at, which is the right default for a tab
/// and the wrong one for a music player.
///
/// These are read by WebView2 when it starts, so they have to be set before the
/// builder runs. Windows only, which is where WebView2 is; the call is harmless
/// elsewhere but there is nothing there to read it.
#[cfg(target_os = "windows")]
fn keep_playing_while_minimised() {
  const ARGS: &str = concat!(
    "--disable-background-timer-throttling ",
    "--disable-renderer-backgrounding ",
    "--disable-backgrounding-occluded-windows"
  );

  // Appended rather than assigned: anything already in the environment was put
  // there deliberately, and overwriting it would be a surprise.
  let existing = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
  let merged = if existing.trim().is_empty() {
    ARGS.to_string()
  } else {
    format!("{existing} {ARGS}")
  };
  std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", merged);
}

#[cfg(not(target_os = "windows"))]
fn keep_playing_while_minimised() {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  keep_playing_while_minimised();

  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
