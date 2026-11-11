//! Where a timer pop-up takes the pointer, on Linux.
//!
//! The Linux app makes no window smaller than 200 by 200, so the pop-up's
//! window is that size and see-through, with its one-row card in the bottom
//! right (`src/utils/clockPopups.js`, `LINUX_POPUP_WINDOW`). The see-through
//! part must let clicks through to whatever is behind it. Telling the whole
//! window to ignore the pointer, and taking that back whenever the pointer
//! was over the card, left the pop-up deaf to every click on the card
//! (2026-11-10). So the window is given an input shape instead: only the
//! card's rectangle takes the pointer, which the window system does by
//! itself -- the same call the window library makes to ignore the pointer,
//! with the card's rectangle rather than nothing.

#[tauri::command]
pub fn set_popup_input_area(window: tauri::WebviewWindow, x: i32, y: i32, width: i32, height: i32) -> Result<(), String> {
  #[cfg(target_os = "linux")]
  {
    let target = window.clone();
    window
      .run_on_main_thread(move || {
        use gtk::prelude::*;
        if let Ok(gtk_window) = target.gtk_window() {
          let area = gtk::cairo::RectangleInt::new(x, y, width.max(1), height.max(1));
          let region = gtk::cairo::Region::create_rectangle(&area);
          gtk_window.input_shape_combine_region(Some(&region));
        }
      })
      .map_err(|e| e.to_string())?;
  }
  #[cfg(not(target_os = "linux"))]
  let _ = (window, x, y, width, height);
  Ok(())
}
