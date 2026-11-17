//! The benchmark the staging app can run on itself (src/utils/benchmark.js).
//!
//! Asked 2026-11-17: the Linux app lags more than the web version on heavy
//! folders, and its memory climbs between them -- "we'll have to do some
//! tests". Started with AUSTAVIA_BENCH_OUT=<file>, the app builds a heavy test
//! folder, times opening, scrolling and typing in it, measures its memory, and
//! writes the results to that file, then quits. Without the variable nothing
//! here does anything.

use std::fs;

/// Where to write the results, and the drawing settings it ran under; None
/// in normal use.
#[tauri::command]
pub fn bench_requested() -> Option<String> {
  let out = std::env::var("AUSTAVIA_BENCH_OUT").ok()?;
  let keys = [
    "WEBKIT_DISABLE_DMABUF_RENDERER",
    "WEBKIT_DISABLE_COMPOSITING_MODE",
    "GDK_BACKEND",
    "AUSTAVIA_WAYLAND",
    "__NV_PRIME_RENDER_OFFLOAD",
    "XDG_SESSION_TYPE",
  ];
  let env: Vec<String> = keys
    .iter()
    .map(|k| format!("{:?}:{:?}", k, std::env::var(k).unwrap_or_default()))
    .collect();
  Some(format!("{{\"out\":{:?},\"env\":{{{}}}}}", out, env.join(",")))
}

/// Memory of the app and the web engine's processes under it, in kB.
#[tauri::command]
pub fn bench_memory() -> u64 {
  let me = std::process::id();
  let mut total = rss(me);
  let mut parents = vec![me];
  // Children and grandchildren: the web process sits under a helper.
  for _ in 0..3 {
    let mut next = Vec::new();
    if let Ok(entries) = fs::read_dir("/proc") {
      for entry in entries.flatten() {
        let Ok(pid) = entry.file_name().to_string_lossy().parse::<u32>() else { continue };
        if parents.contains(&pid) { continue; }
        if let Some(ppid) = parent_of(pid) {
          if parents.contains(&ppid) && !next.contains(&pid) {
            total += rss(pid);
            next.push(pid);
          }
        }
      }
    }
    if next.is_empty() { break; }
    parents.extend(next);
  }
  total
}

fn parent_of(pid: u32) -> Option<u32> {
  let stat = fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
  let after = stat.rsplit_once(')')?.1;
  after.split_whitespace().nth(1)?.parse().ok()
}

fn rss(pid: u32) -> u64 {
  fs::read_to_string(format!("/proc/{pid}/status"))
    .ok()
    .and_then(|s| {
      s.lines()
        .find(|l| l.starts_with("VmRSS:"))
        .and_then(|l| l.split_whitespace().nth(1)?.parse().ok())
    })
    .unwrap_or(0)
}

/// The results, written to the file asked for; then the app quits.
#[tauri::command]
pub fn bench_report(app: tauri::AppHandle, json: String) -> Result<(), String> {
  let out = std::env::var("AUSTAVIA_BENCH_OUT").map_err(|_| "no AUSTAVIA_BENCH_OUT".to_string())?;
  fs::write(&out, json).map_err(|e| e.to_string())?;
  app.exit(0);
  Ok(())
}
