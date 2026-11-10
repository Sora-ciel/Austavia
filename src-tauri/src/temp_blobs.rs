//! Copies of music left in /tmp by the Linux web engine, cleared away.
//!
//! ## What was found
//!
//! 2026-11-10: /tmp held 3005 files `Blob-XXXXXX`, 6.2 GB, MP3s, made in one
//! day and open in no process. /tmp is a memory-backed filesystem with a
//! quota; once full, nothing could write -- the dev server failed with "no
//! space left on device". WebKitGTK copies a Blob to a temporary file when
//! it hands it on (into the browser's storage, which is where the music
//! library keeps every track, so tagging a library writes one per track),
//! and does not always remove the copy afterwards. That is inside the web
//! engine; nothing the page does decides it.
//!
//! Asked the same day: "if there's a way to not have it stay on the tmp after
//! the tagging of the music and all. It would be useful."
//!
//! ## What this does
//!
//! The recomputing pass of CLAUDE.md, applied to a leak: rather than track
//! which copies the engine made, it looks at what is in /tmp. A file is
//! removed only when all of these hold:
//!
//! - its name is exactly `Blob-` and six letters or digits, as WebKit names them;
//! - it is a plain file owned by this user;
//! - no process has it open (every /proc/<pid>/fd this user can read);
//! - it was last written before this app started (the sweep at start), or
//!   more than half an hour ago (the sweeps while it runs) -- a copy still
//!   being used is being read or was just written.
//!
//! Linux only: the other builds use other engines and other temp folders.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

/// How long a copy must have been left alone before a sweep while the app runs takes it.
pub const IDLE_FOR: Duration = Duration::from_secs(30 * 60);
/// How often the sweep runs while the app is open.
pub const EVERY: Duration = Duration::from_secs(30 * 60);

/// Whether a name is one WebKit gives its Blob copies: `Blob-` and six letters or digits.
pub fn is_blob_copy_name(name: &str) -> bool {
  match name.strip_prefix("Blob-") {
    Some(rest) => rest.len() == 6 && rest.chars().all(|c| c.is_ascii_alphanumeric()),
    None => false,
  }
}

/// Whether a file found in /tmp may be removed -- the deciding part, kept
/// apart from the looking so it can be tested.
pub fn may_remove(name: &str, is_file: bool, owned_by_me: bool, open: bool, modified: SystemTime, before: SystemTime) -> bool {
  is_blob_copy_name(name) && is_file && owned_by_me && !open && modified < before
}

/// Every path some process this user can see has open.
#[cfg(target_os = "linux")]
fn open_paths() -> HashSet<PathBuf> {
  let mut open = HashSet::new();
  let Ok(procs) = fs::read_dir("/proc") else { return open };
  for proc_entry in procs.flatten() {
    let Ok(fds) = fs::read_dir(proc_entry.path().join("fd")) else { continue };
    for fd in fds.flatten() {
      if let Ok(target) = fs::read_link(fd.path()) {
        open.insert(target);
      }
    }
  }
  open
}

/// Removes the copies left before `before`; how many went and how many bytes.
#[cfg(target_os = "linux")]
pub fn sweep(dir: &Path, before: SystemTime) -> (usize, u64) {
  use std::os::unix::fs::MetadataExt;
  let me = unsafe { libc_getuid() };
  let Ok(entries) = fs::read_dir(dir) else { return (0, 0) };
  let candidates: Vec<_> = entries
    .flatten()
    .filter(|entry| entry.file_name().to_str().map(is_blob_copy_name).unwrap_or(false))
    .collect();
  if candidates.is_empty() {
    return (0, 0);
  }
  // Only worked out when there is something to look at: it reads every
  // process's open files.
  let open = open_paths();
  let mut removed = (0, 0);
  for entry in candidates {
    let path = entry.path();
    let Ok(meta) = fs::symlink_metadata(&path) else { continue };
    let name = entry.file_name();
    let modified = meta.modified().unwrap_or_else(|_| SystemTime::now());
    if may_remove(
      name.to_str().unwrap_or(""),
      meta.file_type().is_file(),
      meta.uid() == me,
      open.contains(&path),
      modified,
      before,
    ) && fs::remove_file(&path).is_ok()
    {
      removed.0 += 1;
      removed.1 += meta.len();
    }
  }
  removed
}

#[cfg(target_os = "linux")]
extern "C" {
  #[link_name = "getuid"]
  fn libc_getuid() -> u32;
}

/// Sweeps once for what earlier runs left, then every half hour for what this
/// one leaves, on a thread of its own.
#[cfg(target_os = "linux")]
pub fn start() {
  let started = SystemTime::now();
  std::thread::spawn(move || {
    let dir = std::env::temp_dir();
    let (count, bytes) = sweep(&dir, started);
    if count > 0 {
      log::info!("Removed {count} copies of music left in {} ({} MB)", dir.display(), bytes / 1_000_000);
    }
    loop {
      std::thread::sleep(EVERY);
      let before = SystemTime::now().checked_sub(IDLE_FOR).unwrap_or(started);
      let (count, bytes) = sweep(&dir, before);
      if count > 0 {
        log::info!("Removed {count} copies of music left in {} ({} MB)", dir.display(), bytes / 1_000_000);
      }
    }
  });
}

#[cfg(not(target_os = "linux"))]
pub fn start() {}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn only_webkits_blob_copies_are_ever_taken() {
    assert!(is_blob_copy_name("Blob-Qm4dW8"));
    assert!(!is_blob_copy_name("Blob-Qm4dW"));
    assert!(!is_blob_copy_name("Blob-Qm4dW8.mp3"));
    assert!(!is_blob_copy_name("blob-Qm4dW8"));
    assert!(!is_blob_copy_name("notes.txt"));
  }

  #[test]
  fn a_copy_in_use_or_written_since_is_left_alone() {
    let start = SystemTime::now();
    let earlier = start - Duration::from_secs(60);
    let later = start + Duration::from_secs(60);
    assert!(may_remove("Blob-abc123", true, true, false, earlier, start));
    assert!(!may_remove("Blob-abc123", true, true, true, earlier, start), "open in a process");
    assert!(!may_remove("Blob-abc123", true, true, false, later, start), "written since");
    assert!(!may_remove("Blob-abc123", true, false, false, earlier, start), "someone else's");
    assert!(!may_remove("Blob-abc123", false, true, false, earlier, start), "not a plain file");
  }
}
