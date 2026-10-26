mod audio_server;
mod external_links;
mod local_http;
mod sign_in_window;

// `dragDropEnabled: false` in tauri.conf.json, and why, since JSON cannot say
// so itself and the next person to read that file will find a bare `false`.
//
// Tauri turns drag-and-drop interception on by default: the native webview
// takes the gesture so that file drops can be delivered to Rust. On Windows
// that takes it away from the page entirely — starting a drag inside the app
// gives the no-drop cursor and nothing can be moved, because the page never
// sees a dragover it could accept.
//
// Nothing is lost by turning it off. The page already handles its own drops
// (`handleModeDrop` in App.svelte takes dropped pictures and videos), and
// nothing on this side listens for them.
//
// It only became visible once pictures could be pasted into a note. Blocks on
// the canvas are moved with pointer events and never used drag-and-drop, so
// until there were pictures inside writing there was nothing in the app that
// needed the gesture at all.

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

/// Let KDE draw the title bar, so the window looks like every other one.
///
/// On Wayland a GTK window draws its own title bar. Under KDE that came out as
/// a light imitation of Breeze with GNOME-style buttons, whatever the desktop's
/// colours, title bar theme or icons — changing the GTK theme in System
/// Settings did not touch it (seen 2026-10-09, asked for as "the window title
/// bar should follow how Linux works"). Through XWayland the window is
/// decorated by KWin itself, exactly as KDE's own windows are.
///
/// Only under KDE: GNOME draws no title bars for anybody, so there the GTK one
/// is the native one. `AUSTAVIA_WAYLAND=1` keeps native Wayland for anyone who
/// prefers it, and a GDK_BACKEND that is not plain `wayland` (the session
/// default) was set by hand and is left alone.
#[cfg(target_os = "linux")]
fn let_kde_draw_the_title_bar() {
  let on_kde = std::env::var("XDG_CURRENT_DESKTOP")
    .map(|desktop| desktop.split(':').any(|part| part.eq_ignore_ascii_case("KDE")))
    .unwrap_or(false);
  let opted_out = std::env::var_os("AUSTAVIA_WAYLAND").is_some();
  let backend_by_hand = std::env::var("GDK_BACKEND")
    .map(|backend| !backend.is_empty() && backend != "wayland")
    .unwrap_or(false);
  if on_kde && !opted_out && !backend_by_hand {
    std::env::set_var("GDK_BACKEND", "x11");
  }
}

#[cfg(not(target_os = "linux"))]
fn let_kde_draw_the_title_bar() {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  keep_playing_while_minimised();
  let_kde_draw_the_title_bar();

  let builder = tauri::Builder::default();

  // One Austavia at a time on a computer. Reported 2026-10-26: "every time I
  // come back from a restart, Austavia opens another window than the one
  // already opened, making it two or even more." Under KDE it runs through
  // XWayland, where each window records the command that started it; at login
  // KDE ran that command once per saved window and again from its own session
  // list, and every run was a whole new copy of the app -- so logging out with
  // two saved three, and so on. Clicking the launcher twice did the same.
  //
  // Now a second launch finds the first, hands it over and exits, and the
  // first brings its window forward. Registered before anything else, as the
  // plugin asks, so the second copy stops before it has built a window.
  #[cfg(desktop)]
  let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
      let _ = window.unminimize();
      let _ = window.show();
      let _ = window.set_focus();
    }
  }));

  builder
    .invoke_handler(tauri::generate_handler![
      sign_in_window::open_sign_in_window,
      audio_server::serve_audio,
      external_links::open_in_browser
    ])
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
