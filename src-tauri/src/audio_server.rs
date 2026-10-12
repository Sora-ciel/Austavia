//! Music for the Linux player, from a real address instead of a blob.
//!
//! WebKitGTK reads a blob: address as a one-way stream, and an MP4 played
//! from one cannot be rewound: the first jump backwards on the timeline fails
//! with "Internal data stream error" and from then on the clock moves with no
//! sound. Measured on 2026-10-09 in a WebKitGTK webview against the user's own
//! library — every m4a failed that way, every mp3 survived — after it was
//! reported as "a music that worked well stops working at all, the timeline
//! moves again but no sound".
//!
//! The same file from an http address, which GStreamer can ask for any part of,
//! survived every jump. So the page hands the track's bytes here and plays it
//! from `http://127.0.0.1:<port>/<code>`. The why for the page's half is in
//! `src/utils/audioAddress.js`.
//!
//! Only this computer can connect, and only to an address it was given: each
//! track is under a random code. The last few tracks are kept so a skip does
//! not pull the floor from under one that is still finishing; older ones go.

use std::collections::VecDeque;
use std::io::Write;
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use crate::local_http::{new_state, read_request};

const KEEP: usize = 3;

struct Track {
  code: String,
  mime: String,
  bytes: Arc<Vec<u8>>,
}

struct Server {
  port: u16,
  tracks: Arc<Mutex<VecDeque<Track>>>,
}

static SERVER: OnceLock<Server> = OnceLock::new();

fn server() -> Result<&'static Server, String> {
  if let Some(server) = SERVER.get() {
    return Ok(server);
  }
  let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
  let port = listener.local_addr().map_err(|e| e.to_string())?.port();
  let tracks: Arc<Mutex<VecDeque<Track>>> = Arc::new(Mutex::new(VecDeque::new()));
  let shared = tracks.clone();
  std::thread::spawn(move || {
    for stream in listener.incoming().flatten() {
      let tracks = shared.clone();
      std::thread::spawn(move || answer(stream, &tracks));
    }
  });
  // Two first calls racing would each start a server; the loser's simply
  // goes unused, which costs one idle thread.
  let _ = SERVER.set(Server { port, tracks });
  Ok(SERVER.get().expect("set just above"))
}

/// Takes the track's bytes as the raw body of the call, its type in the
/// `x-audio-type` header, and returns the address to play it from.
#[tauri::command]
pub fn serve_audio(request: tauri::ipc::Request<'_>) -> Result<String, String> {
  let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
    return Err("serve_audio expects the track as raw bytes".into());
  };
  let mime = request
    .headers()
    .get("x-audio-type")
    .and_then(|value| value.to_str().ok())
    .filter(|value| !value.is_empty())
    .unwrap_or("application/octet-stream")
    .to_string();

  register(bytes.clone(), mime)
}

/// Keeps a track and returns the address it can be played from.
fn register(bytes: Vec<u8>, mime: String) -> Result<String, String> {
  let server = server()?;
  let code = new_state();
  let mut tracks = server.tracks.lock().map_err(|_| "audio server poisoned".to_string())?;
  tracks.push_back(Track { code: code.clone(), mime, bytes: Arc::new(bytes) });
  while tracks.len() > KEEP {
    tracks.pop_front();
  }
  Ok(format!("http://127.0.0.1:{}/{}", server.port, code))
}

/// Which bytes a `Range` header asks for: (first, last, partial). None when it
/// asks for something the file does not have.
fn plan_range(range: Option<&str>, len: usize) -> Option<(usize, usize, bool)> {
  if len == 0 {
    return Some((0, 0, false));
  }
  let Some(range) = range else {
    return Some((0, len - 1, false));
  };
  let spec = range.trim().strip_prefix("bytes=")?;
  // Several ranges at once are legal and never asked for by a player; the
  // first is answered.
  let spec = spec.split(',').next()?.trim();
  let (start, end) = spec.split_once('-')?;
  let (first, last) = if start.is_empty() {
    // "-500": the last 500 bytes.
    let suffix: usize = end.parse().ok()?;
    if suffix == 0 {
      return None;
    }
    (len.saturating_sub(suffix), len - 1)
  } else {
    let first: usize = start.parse().ok()?;
    let last = if end.is_empty() { len - 1 } else { end.parse::<usize>().ok()?.min(len - 1) };
    (first, last)
  };
  if first > last || first >= len {
    return None;
  }
  Some((first, last, true))
}

fn header<'a>(head: &'a str, name: &str) -> Option<&'a str> {
  head
    .split("\r\n")
    .filter_map(|line| line.split_once(':'))
    .find(|(key, _)| key.trim().eq_ignore_ascii_case(name))
    .map(|(_, value)| value.trim())
}

fn answer(mut stream: TcpStream, tracks: &Mutex<VecDeque<Track>>) {
  let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
  let Some((method, target, _, head)) = read_request(&mut stream) else {
    return;
  };
  let code = target.trim_start_matches('/').split('?').next().unwrap_or("").to_string();
  let found = tracks
    .lock()
    .ok()
    .and_then(|tracks| tracks.iter().find(|t| t.code == code).map(|t| (t.mime.clone(), t.bytes.clone())));

  let Some((mime, bytes)) = found else {
    let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    return;
  };
  if method != "GET" && method != "HEAD" {
    let _ = stream.write_all(b"HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    return;
  }

  let Some((first, last, partial)) = plan_range(header(&head, "range"), bytes.len()) else {
    let reply = format!(
      "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */{}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
      bytes.len()
    );
    let _ = stream.write_all(reply.as_bytes());
    return;
  };
  let body = if bytes.is_empty() { &bytes[0..0] } else { &bytes[first..=last] };
  let mut reply = format!(
    "HTTP/1.1 {}\r\nContent-Type: {mime}\r\nContent-Length: {}\r\nAccept-Ranges: bytes\r\n\
     Cache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n",
    if partial { "206 Partial Content" } else { "200 OK" },
    body.len()
  );
  if partial {
    reply.push_str(&format!("Content-Range: bytes {first}-{last}/{}\r\n", bytes.len()));
  }
  reply.push_str("\r\n");
  if stream.write_all(reply.as_bytes()).is_err() || method == "HEAD" {
    return;
  }
  // The player hangs up mid-file whenever it seeks; that is not an error.
  let _ = stream.write_all(body);
  let _ = stream.flush();
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn no_range_is_the_whole_file() {
    assert_eq!(plan_range(None, 100), Some((0, 99, false)));
  }

  #[test]
  fn a_jump_back_asks_from_a_point_to_the_end() {
    // What the player sends when the timeline is moved: the rewind that a
    // blob could not do.
    assert_eq!(plan_range(Some("bytes=40-"), 100), Some((40, 99, true)));
  }

  #[test]
  fn a_closed_range_is_answered_exactly() {
    assert_eq!(plan_range(Some("bytes=10-19"), 100), Some((10, 19, true)));
  }

  #[test]
  fn a_range_past_the_end_is_cut_to_the_file() {
    assert_eq!(plan_range(Some("bytes=90-500"), 100), Some((90, 99, true)));
  }

  #[test]
  fn the_last_bytes_can_be_asked_for() {
    // How an MP4 with its index at the end gets found.
    assert_eq!(plan_range(Some("bytes=-8"), 100), Some((92, 99, true)));
  }

  /// Not a unit test: serves a real file for a minute so a webview can be
  /// pointed at it. `AUDIO_FILE=… cargo test serve_a_file_for_a_minute -- --ignored --nocapture`
  #[test]
  #[ignore]
  fn serve_a_file_for_a_minute() {
    let path = std::env::var("AUDIO_FILE").expect("AUDIO_FILE");
    let url = register(std::fs::read(path).unwrap(), "audio/mp4".into()).unwrap();
    println!("SERVING {url}");
    std::thread::sleep(Duration::from_secs(60));
  }

  #[test]
  fn a_range_the_file_does_not_have_is_refused() {
    assert_eq!(plan_range(Some("bytes=100-"), 100), None);
    assert_eq!(plan_range(Some("bytes=50-40"), 100), None);
    assert_eq!(plan_range(Some("lines=1-2"), 100), None);
  }
}
