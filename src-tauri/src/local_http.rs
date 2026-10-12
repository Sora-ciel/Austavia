//! The little HTTP and randomness the app's local servers share. The music
//! server (`audio_server.rs`) is the one that uses it now; it began as part of
//! the browser sign-in hand-off, which was replaced by the sign-in window.

use std::io::Read;
use std::net::TcpStream;
use std::time::Instant;

const MAX_REQUEST: usize = 64 * 1024;

/// Method, target, body, and the header block as text.
pub(crate) fn read_request(stream: &mut TcpStream) -> Option<(String, String, Vec<u8>, String)> {
  let mut buffer = Vec::new();
  let mut chunk = [0u8; 4096];
  let header_end = loop {
    let read = stream.read(&mut chunk).ok()?;
    if read == 0 {
      return None;
    }
    buffer.extend_from_slice(&chunk[..read]);
    if let Some(at) = buffer.windows(4).position(|w| w == b"\r\n\r\n") {
      break at + 4;
    }
    if buffer.len() > MAX_REQUEST {
      return None;
    }
  };

  let head = String::from_utf8_lossy(&buffer[..header_end]).to_string();
  let mut lines = head.split("\r\n");
  let mut request_line = lines.next()?.split(' ');
  let method = request_line.next()?.to_string();
  let target = request_line.next()?.to_string();
  let length = lines
    .filter_map(|line| line.split_once(':'))
    .find(|(name, _)| name.trim().eq_ignore_ascii_case("content-length"))
    .and_then(|(_, value)| value.trim().parse::<usize>().ok())
    .unwrap_or(0);
  if length > MAX_REQUEST {
    return None;
  }

  let mut body = buffer[header_end..].to_vec();
  while body.len() < length {
    let read = stream.read(&mut chunk).ok()?;
    if read == 0 {
      break;
    }
    body.extend_from_slice(&chunk[..read]);
  }
  body.truncate(length);
  Some((method, target, body, head))
}

/// 32 url-safe characters from the operating system's random source.
pub(crate) fn new_state() -> String {
  const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let mut bytes = [0u8; 32];
  if !read_os_random(&mut bytes) {
    // Not expected anywhere this runs; still better than a fixed value.
    use std::hash::{BuildHasher, Hasher};
    for (i, byte) in bytes.iter_mut().enumerate() {
      let mut hasher = std::collections::hash_map::RandomState::new().build_hasher();
      hasher.write_usize(i);
      hasher.write_u128(Instant::now().elapsed().as_nanos());
      *byte = hasher.finish() as u8;
    }
  }
  bytes.iter().map(|b| ALPHABET[(*b as usize) % 64] as char).collect()
}

#[cfg(unix)]
fn read_os_random(bytes: &mut [u8]) -> bool {
  std::fs::File::open("/dev/urandom")
    .and_then(|mut file| file.read_exact(bytes))
    .is_ok()
}

#[cfg(not(unix))]
fn read_os_random(_bytes: &mut [u8]) -> bool {
  false
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn each_state_is_long_url_safe_and_different() {
    let a = new_state();
    let b = new_state();
    assert_eq!(a.len(), 32);
    assert!(a.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    assert_ne!(a, b);
  }
}
