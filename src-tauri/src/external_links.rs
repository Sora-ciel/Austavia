//! Opens Polar's checkout and customer portal in the system browser.
//!
//! The page's `<a target="_blank">` does nothing on Linux (WebKitGTK opens no
//! window for it) and opens a bare popup with no address bar on Windows, which
//! is no place to type a card number. Why, and the page's half, is in
//! `src/utils/externalLinks.js`.
//!
//! The address is checked again here rather than trusted from the page: this
//! command starts a program, and it exists for payment pages only.

use tauri::Url;

/// Polar's own https pages, and nothing else.
fn is_allowed(url: &Url) -> bool {
  if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
    return false;
  }
  match url.host_str() {
    Some(host) => {
      let host = host.to_ascii_lowercase();
      host == "polar.sh" || host.ends_with(".polar.sh")
    }
    None => false,
  }
}

#[tauri::command]
pub fn open_in_browser(url: String) -> Result<(), String> {
  let parsed: Url = url.parse().map_err(|e| format!("not an address: {e}"))?;
  if !is_allowed(&parsed) {
    return Err("only Polar's checkout and portal can be opened".into());
  }
  let url = parsed.as_str();

  #[cfg(target_os = "linux")]
  let result = std::process::Command::new("xdg-open").arg(url).spawn();
  #[cfg(target_os = "macos")]
  let result = std::process::Command::new("open").arg(url).spawn();
  // Not `cmd /C start`: cmd reads `&` in an address as the start of another
  // command. The URL protocol handler takes the address as it is.
  #[cfg(target_os = "windows")]
  let result = std::process::Command::new("rundll32")
    .args(["url.dll,FileProtocolHandler", url])
    .spawn();

  result
    .map(|_| ())
    .map_err(|e| format!("could not open the browser: {e}"))
}

#[cfg(test)]
mod tests {
  use super::*;

  fn allowed(address: &str) -> bool {
    address.parse::<Url>().map(|u| is_allowed(&u)).unwrap_or(false)
  }

  #[test]
  fn polar_checkout_and_portal_are_allowed() {
    assert!(allowed("https://buy.polar.sh/polar_cl_abc?reference_id=uid"));
    assert!(allowed("https://polar.sh/austavia/portal"));
    assert!(allowed("https://sandbox.polar.sh/austavia/portal"));
  }

  #[test]
  fn nothing_else_is() {
    assert!(!allowed("http://polar.sh/austavia/portal"));
    assert!(!allowed("https://polar.sh.evil.example/"));
    assert!(!allowed("https://evilpolar.sh/"));
    assert!(!allowed("https://user:pass@polar.sh/"));
    assert!(!allowed("file:///etc/passwd"));
  }
}
