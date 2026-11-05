use crate::commands::{with_db, with_db_handle};
use crate::database::{
    delete_clipboard_item, get_clipboard_history, insert_clipboard_item, toggle_pin_item,
    ClipboardItem, DbState,
};
use crate::fragments::{Fragment, FragmentPayload, FRAGMENT_FORMAT_VERSION};
use arboard::Clipboard;
use serde::Serialize;
use std::sync::{Arc, Condvar, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub struct ClipboardMonitor {
    pub is_running: Arc<Mutex<bool>>,
    /// Wakes the worker immediately on stop instead of letting it finish a
    /// 500 ms sleep first.
    stop_signal: Arc<Condvar>,
    pub last_content: Arc<Mutex<String>>,
    /// Why the worker last stopped unexpectedly, if it did. Surfaced by the
    /// status query so the UI can explain a monitor that looks "off" after
    /// the user just started it.
    pub last_error: Arc<Mutex<Option<String>>>,
    pub last_sample_at: Arc<Mutex<Option<i64>>>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

impl ClipboardMonitor {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(Mutex::new(false)),
            stop_signal: Arc::new(Condvar::new()),
            last_content: Arc::new(Mutex::new(String::new())),
            last_error: Arc::new(Mutex::new(None)),
            last_sample_at: Arc::new(Mutex::new(None)),
            worker: Mutex::new(None),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ClipboardMonitorStatus {
    pub running: bool,
    pub last_error: Option<String>,
    pub last_sample_at: Option<i64>,
}

#[tauri::command]
pub fn start_clipboard_monitor(
    app_handle: AppHandle,
    state: tauri::State<'_, ClipboardMonitor>,
) -> Result<String, String> {
    let mut worker = state.worker.lock().unwrap();

    if *state.is_running.lock().unwrap() {
        return Ok("Already running".to_string());
    }

    // A previous worker should already be joined by `stop`, but if one is
    // still winding down, wait for it before spawning a replacement so two
    // workers can never poll (and insert) simultaneously.
    if let Some(handle) = worker.take() {
        let _ = handle.join();
    }

    *state.is_running.lock().unwrap() = true;
    *state.last_error.lock().unwrap() = None;
    *state.last_sample_at.lock().unwrap() = None;

    let is_running_clone = state.is_running.clone();
    let stop_signal = state.stop_signal.clone();
    let last_content_clone = state.last_content.clone();
    let last_error_clone = state.last_error.clone();
    let last_sample_at_clone = state.last_sample_at.clone();

    let handle = thread::spawn(move || {
        let mut clipboard = match Clipboard::new() {
            Ok(clipboard) => clipboard,
            Err(err) => {
                *last_error_clone.lock().unwrap() =
                    Some(format!("Failed to access the system clipboard: {err}"));
                *is_running_clone.lock().unwrap() = false;
                return;
            }
        };

        loop {
            // Wait for the poll interval, but wake immediately if stop is
            // requested instead of sleeping through the whole 500 ms.
            {
                let running = is_running_clone.lock().unwrap();
                if !*running {
                    break;
                }
                let (running, _) = stop_signal
                    .wait_timeout(running, Duration::from_millis(500))
                    .unwrap();
                if !*running {
                    break;
                }
            }

            // Check clipboard
            if let Ok(content) = clipboard.get_text() {
                *last_sample_at_clone.lock().unwrap() = Some(chrono::Utc::now().timestamp());

                let mut last = last_content_clone.lock().unwrap();

                if content != *last && !content.trim().is_empty() {
                    *last = content.clone();

                    // Save through the shared connection rather than
                    // opening a new one on every poll tick.
                    match with_db_handle(&app_handle, |conn| insert_clipboard_item(conn, &content))
                    {
                        Ok(()) => {
                            let _ = app_handle.emit("clipboard-updated", ());
                        }
                        Err(err) => {
                            eprintln!("[clipboard] failed to save captured item: {err}");
                        }
                    }
                }
            }
        }

        // The worker is the authority on whether monitoring is actually
        // running -- never leave a stale `true` behind if it exits.
        *is_running_clone.lock().unwrap() = false;
    });

    *worker = Some(handle);

    Ok("Monitoring started".to_string())
}

#[tauri::command]
pub fn stop_clipboard_monitor(state: tauri::State<'_, ClipboardMonitor>) -> Result<String, String> {
    *state.is_running.lock().unwrap() = false;
    state.stop_signal.notify_all();

    // Join so a subsequent start cannot race with this worker. The condvar
    // makes this near-immediate rather than up to 500 ms.
    if let Some(handle) = state.worker.lock().unwrap().take() {
        let _ = handle.join();
    }

    Ok("Monitoring stopped".to_string())
}

#[tauri::command]
pub fn get_clipboard_monitor_status(
    state: tauri::State<'_, ClipboardMonitor>,
) -> Result<ClipboardMonitorStatus, String> {
    Ok(ClipboardMonitorStatus {
        running: *state.is_running.lock().unwrap(),
        last_error: state.last_error.lock().unwrap().clone(),
        last_sample_at: *state.last_sample_at.lock().unwrap(),
    })
}

#[tauri::command]
pub fn get_clipboard_items(
    state: tauri::State<'_, DbState>,
    limit: i32,
) -> Result<Vec<ClipboardItem>, String> {
    with_db(&state, |conn| get_clipboard_history(conn, limit))
}

#[tauri::command]
pub fn save_clipboard_text(state: tauri::State<'_, DbState>, text: String) -> Result<(), String> {
    with_db(&state, |conn| insert_clipboard_item(conn, &text))
}

#[tauri::command]
pub fn get_current_clipboard() -> Result<String, String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    let content = clipboard.get_text().map_err(|e| e.to_string())?;
    Ok(content)
}

#[tauri::command]
pub fn delete_clipboard(state: tauri::State<'_, DbState>, id: i32) -> Result<(), String> {
    with_db(&state, |conn| delete_clipboard_item(conn, id))
}

#[tauri::command]
pub fn toggle_pin(state: tauri::State<'_, DbState>, id: i32) -> Result<(), String> {
    with_db(&state, |conn| toggle_pin_item(conn, id))
}

#[tauri::command]
pub fn copy_to_clipboard(text: String) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())?;
    Ok(())
}

/// Wraps a clipboard item's content in the shared Fragment envelope for
/// sharing/export. Takes the content directly from the frontend (which
/// already has it in memory from the rendered list) rather than
/// re-fetching by id from the DB -- no new database query needed for
/// this. `name`/`tags` come from the frontend too, since clipboard_history
/// has no name column of its own (a snippet's title only exists at the
/// fragment level, not locally).
#[tauri::command]
pub fn export_clipboard_snippet_json(
    content: String,
    name: String,
    tags: Vec<String>,
) -> Result<String, String> {
    let fragment = Fragment {
        format_version: FRAGMENT_FORMAT_VERSION,
        name,
        tags,
        exported_at: chrono::Utc::now().timestamp(),
        payload: FragmentPayload::ClipboardSnippet { content },
    };

    serde_json::to_string_pretty(&fragment).map_err(|e| e.to_string())
}

/// Imports a clipboard snippet fragment, inserting it as a new clipboard
/// history entry. Reuses `insert_clipboard_item` directly (the same
/// function `save_clipboard_text` calls) rather than going through
/// another command.
#[tauri::command]
pub fn import_clipboard_snippet_json(
    state: tauri::State<'_, DbState>,
    json: String,
) -> Result<(), String> {
    let fragment: Fragment =
        serde_json::from_str(&json).map_err(|e| format!("Couldn't parse fragment file: {e}"))?;

    if fragment.format_version > FRAGMENT_FORMAT_VERSION {
        return Err(
            "This fragment was exported by a newer version of FragDesk and can't be read yet"
                .to_string(),
        );
    }

    let FragmentPayload::ClipboardSnippet { content } = fragment.payload else {
        return Err("This fragment isn't a clipboard snippet".to_string());
    };

    with_db(&state, |conn| insert_clipboard_item(conn, &content))
}
