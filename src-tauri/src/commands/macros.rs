use crate::database::{
    delete_macro_item, get_macro_by_id, get_macro_id_by_hotkey, get_macros as db_get_macros,
    get_setting, init_database, insert_macro, rename_macro_item, set_macro_hotkey_item,
    set_macro_tags as db_set_macro_tags, set_setting, MacroEvent, MacroItem, MacroSummary,
};
use crate::fragments::{Fragment, FragmentPayload, FRAGMENT_FORMAT_VERSION};
use rdev::{listen, simulate, Button, EventType, Key};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
use uuid::Uuid;

/// Holds recording state. The global input listener (`rdev::listen`) blocks
/// forever once started, so rather than spinning a fresh OS hook on every
/// start/stop like the clipboard poll loop does, we spawn it once lazily on
/// the first `start_macro_recording` call and gate actual capture with
/// `is_recording`. Manage this with `.manage(MacroRecorder::new())`.
pub struct MacroRecorder {
    pub is_recording: Arc<AtomicBool>,
    pub buffer: Arc<Mutex<Vec<MacroEvent>>>,
    pub last_event_at: Arc<Mutex<Option<Instant>>>,
    listener_spawned: Arc<AtomicBool>,
}

impl MacroRecorder {
    pub fn new() -> Self {
        Self {
            is_recording: Arc::new(AtomicBool::new(false)),
            buffer: Arc::new(Mutex::new(Vec::new())),
            last_event_at: Arc::new(Mutex::new(None)),
            listener_spawned: Arc::new(AtomicBool::new(false)),
        }
    }
}

/// Holds playback state so `stop_macro_playback` can cancel a run in
/// progress from a separate command invocation. Manage with
/// `.manage(MacroPlayback::new())`.
pub struct MacroPlayback {
    pub is_playing: Arc<AtomicBool>,
    pub cancel: Arc<AtomicBool>,
}

impl MacroPlayback {
    pub fn new() -> Self {
        Self {
            is_playing: Arc::new(AtomicBool::new(false)),
            cancel: Arc::new(AtomicBool::new(false)),
        }
    }
}

/// Maps a registered hotkey string (as accepted by
/// `tauri_plugin_global_shortcut`) to the macro id it should trigger.
/// Kept in memory alongside the DB copy so the global shortcut handler
/// doesn't need to hit SQLite on every keypress. Manage with
/// `.manage(HotkeyRegistry::new())`.
pub struct HotkeyRegistry {
    pub map: Mutex<HashMap<String, String>>,
}

impl HotkeyRegistry {
    pub fn new() -> Self {
        Self {
            map: Mutex::new(HashMap::new()),
        }
    }
}

/// Returned by `stop_macro_recording` — a preview of what was captured,
/// *before* it's saved. Nothing is persisted or cleared at this point;
/// the frontend shows this, lets the user type a name, then calls
/// `save_macro_recording`. This gap matters: capture is OS-global, so if
/// naming happened while `is_recording` was still true, typing the name
/// would get recorded into the macro itself.
#[derive(Debug, Clone, Serialize)]
pub struct RecordingPreview {
    pub event_count: usize,
    pub duration_ms: u64,
}

/// The DB key under which the record-toggle hotkey is persisted (via the
/// generic `settings` table).
const RECORD_HOTKEY_SETTING_KEY: &str = "record_toggle_hotkey";

/// Fallback used the very first time the app runs, before any hotkey has
/// been saved.
pub const DEFAULT_RECORD_HOTKEY: &str = "F9";

/// Holds the *currently active* record-toggle hotkey in memory, so
/// `handle_global_shortcut` can check incoming shortcuts against it
/// without hitting SQLite on every keypress. Loaded from the `settings`
/// table (or defaulted to `DEFAULT_RECORD_HOTKEY`) once in `lib.rs`'s
/// `.setup()`, then kept in sync by `set_record_hotkey`. Manage with
/// `.manage(RecordHotkeyState::new(initial_value))`.
pub struct RecordHotkeyState {
    pub current: Mutex<String>,
}

impl RecordHotkeyState {
    pub fn new(initial: String) -> Self {
        Self {
            current: Mutex::new(initial),
        }
    }
}

#[tauri::command]
pub fn get_record_hotkey(state: tauri::State<'_, RecordHotkeyState>) -> String {
    state.current.lock().unwrap().clone()
}

/// Remaps the record-toggle hotkey. Rejects the change if the requested
/// combo is already assigned to a macro's playback hotkey, to avoid one
/// key press ambiguously meaning two different things.
#[tauri::command]
pub fn set_record_hotkey(
    app_handle: AppHandle,
    state: tauri::State<'_, RecordHotkeyState>,
    hotkey: String,
) -> Result<(), String> {
    let conn = init_database().map_err(|e| e.to_string())?;

    if get_macro_id_by_hotkey(&conn, &hotkey)
        .map_err(|e| e.to_string())?
        .is_some()
    {
        return Err("That combo is already assigned to a macro's playback hotkey".to_string());
    }

    let old = state.current.lock().unwrap().clone();

    app_handle
        .global_shortcut()
        .register(hotkey.as_str())
        .map_err(|e| format!("Failed to register hotkey '{hotkey}': {e}"))?;

    if old != hotkey {
        let _ = app_handle.global_shortcut().unregister(old.as_str());
    }

    *state.current.lock().unwrap() = hotkey.clone();
    set_setting(&conn, RECORD_HOTKEY_SETTING_KEY, &hotkey).map_err(|e| e.to_string())?;

    Ok(())
}

/// Reads the saved record-toggle hotkey from the `settings` table, falling
/// back to `DEFAULT_RECORD_HOTKEY` if none has been set yet. Called once
/// at startup, before any command/state machinery is available, so it
/// takes a `Connection` directly rather than going through a command.
pub fn load_record_hotkey(conn: &rusqlite::Connection) -> String {
    get_setting(conn, RECORD_HOTKEY_SETTING_KEY)
        .ok()
        .flatten()
        .unwrap_or_else(|| DEFAULT_RECORD_HOTKEY.to_string())
}

#[tauri::command]
pub fn start_macro_recording(
    app_handle: AppHandle,
    state: tauri::State<'_, MacroRecorder>,
) -> Result<String, String> {
    if state.is_recording.load(Ordering::SeqCst) {
        return Ok("Already recording".to_string());
    }

    // Spawn the global listener once, for the app's lifetime.
    if state
        .listener_spawned
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_ok()
    {
        spawn_input_listener(app_handle, &state);
    }

    state.buffer.lock().unwrap().clear();
    *state.last_event_at.lock().unwrap() = Some(Instant::now());
    state.is_recording.store(true, Ordering::SeqCst);

    Ok("Recording started".to_string())
}

/// Stops *capturing* only. Does NOT save or clear the buffer — call
/// `save_macro_recording(name)` to persist it, or `discard_macro_recording`
/// to throw it away.
#[tauri::command]
pub fn stop_macro_recording(
    state: tauri::State<'_, MacroRecorder>,
) -> Result<RecordingPreview, String> {
    state.is_recording.store(false, Ordering::SeqCst);

    let buffer = state.buffer.lock().unwrap();
    let event_count = buffer.len();
    let duration_ms: u64 = buffer.iter().map(event_delay_ms).sum();

    Ok(RecordingPreview {
        event_count,
        duration_ms,
    })
}

/// Persists whatever is currently sitting in the recorder's buffer under
/// `name`. Call this only after `stop_macro_recording`.
#[tauri::command]
pub fn save_macro_recording(
    state: tauri::State<'_, MacroRecorder>,
    name: String,
) -> Result<MacroSummary, String> {
    state.is_recording.store(false, Ordering::SeqCst); // safety net
    let events = std::mem::take(&mut *state.buffer.lock().unwrap());

    if events.is_empty() {
        return Err(
            "No input was captured — try again and press some keys or move the mouse".to_string(),
        );
    }

    let duration_ms: u64 = events.iter().map(event_delay_ms).sum();
    let id = Uuid::new_v4().to_string();

    let conn = init_database().map_err(|e| e.to_string())?;
    insert_macro(&conn, &id, &name, &events, duration_ms as i64).map_err(|e| e.to_string())?;

    Ok(MacroSummary {
        id,
        name,
        created_at: chrono::Utc::now().timestamp(),
        event_count: events.len() as i32,
        duration_ms: duration_ms as i64,
        hotkey: None,
        tags: Vec::new(),
    })
}

/// Cancels an in-progress or just-stopped recording without saving it.
#[tauri::command]
pub fn discard_macro_recording(state: tauri::State<'_, MacroRecorder>) -> Result<(), String> {
    state.is_recording.store(false, Ordering::SeqCst);
    state.buffer.lock().unwrap().clear();
    Ok(())
}

#[tauri::command]
pub fn get_macros() -> Result<Vec<MacroSummary>, String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    db_get_macros(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_macro(
    app_handle: AppHandle,
    registry: tauri::State<'_, HotkeyRegistry>,
    id: String,
) -> Result<(), String> {
    // Unregister any hotkey this macro owned so it doesn't linger as a
    // dangling global shortcut pointing at a deleted macro.
    let conn = init_database().map_err(|e| e.to_string())?;
    if let Some(existing) = get_macro_by_id(&conn, &id).map_err(|e| e.to_string())? {
        if let Some(hotkey) = existing.hotkey {
            let _ = app_handle.global_shortcut().unregister(hotkey.as_str());
            registry.map.lock().unwrap().remove(&hotkey);
        }
    }

    delete_macro_item(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_macro(id: String, name: String) -> Result<(), String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    rename_macro_item(&conn, &id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_macro_tags(id: String, tags: Vec<String>) -> Result<(), String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    db_set_macro_tags(&conn, &id, &tags).map_err(|e| e.to_string())
}

/// Returns a pretty-printed JSON string for the given macro, wrapped in
/// the shared `Fragment` envelope (see `crate::fragments`). The frontend
/// triggers the actual file save via a plain browser Blob download -- no
/// Tauri dialog/fs plugin needed for this.
#[tauri::command]
pub fn export_macro_json(id: String) -> Result<String, String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    let macro_item = get_macro_by_id(&conn, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Macro not found".to_string())?;

    let fragment = Fragment {
        format_version: FRAGMENT_FORMAT_VERSION,
        name: macro_item.name,
        tags: macro_item.tags,
        exported_at: chrono::Utc::now().timestamp(),
        payload: FragmentPayload::Macro {
            events: macro_item.events,
        },
    };

    serde_json::to_string_pretty(&fragment).map_err(|e| e.to_string())
}

/// Imports a macro fragment from JSON text (read on the frontend via a
/// plain `<input type="file">` + FileReader, no plugin needed). Always
/// assigns a fresh id, so importing never collides with an existing
/// macro -- even re-importing the same file twice just creates a second
/// copy. Tags carry over from the fragment; hotkey never does.
#[tauri::command]
pub fn import_macro_json(json: String) -> Result<MacroSummary, String> {
    let fragment: Fragment =
        serde_json::from_str(&json).map_err(|e| format!("Couldn't parse fragment file: {e}"))?;

    if fragment.format_version > FRAGMENT_FORMAT_VERSION {
        return Err(
            "This fragment was exported by a newer version of FragDesk and can't be read yet"
                .to_string(),
        );
    }

    let FragmentPayload::Macro { events } = fragment.payload;

    if events.is_empty() {
        return Err("This macro file has no recorded events".to_string());
    }

    let duration_ms: u64 = events.iter().map(event_delay_ms).sum();
    let id = Uuid::new_v4().to_string();

    let conn = init_database().map_err(|e| e.to_string())?;
    insert_macro(&conn, &id, &fragment.name, &events, duration_ms as i64)
        .map_err(|e| e.to_string())?;
    if !fragment.tags.is_empty() {
        db_set_macro_tags(&conn, &id, &fragment.tags).map_err(|e| e.to_string())?;
    }

    Ok(MacroSummary {
        id,
        name: fragment.name,
        created_at: chrono::Utc::now().timestamp(),
        event_count: events.len() as i32,
        duration_ms: duration_ms as i64,
        hotkey: None,
        tags: fragment.tags,
    })
}

/// Lightweight summary of a bundled fragment for the library browser --
/// parsed generically via `serde_json::Value` rather than the typed
/// `Fragment` struct, so listing doesn't break if a bundled file uses a
/// `fragment_type` this build doesn't have a variant for yet (a future
/// clipboard-snippet or tip fragment, say). Only the actual import step
/// needs the fully-typed shape.
#[derive(Debug, Clone, Serialize)]
pub struct BundledFragmentSummary {
    pub filename: String,
    pub fragment_type: String,
    pub name: String,
    pub tags: Vec<String>,
    pub format_version: u32,
}

/// Resolves the bundled `resources/fragments` directory, which works
/// identically whether running via `tauri dev` or a packaged build, as
/// long as it's declared under `bundle.resources` in `tauri.conf.json`.
fn fragments_resource_dir(app_handle: &AppHandle) -> Result<std::path::PathBuf, String> {
    app_handle
        .path()
        .resolve("resources/fragments", tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("Failed to locate bundled fragments directory: {e}"))
}

/// Lists every bundled fragment shipped with the app (the "starter pack"
/// -- curated content baked into the binary, no server involved). Skips
/// any file that fails to parse rather than failing the whole list, since
/// one malformed sample shouldn't hide the rest.
#[tauri::command]
pub fn list_bundled_fragments(
    app_handle: AppHandle,
) -> Result<Vec<BundledFragmentSummary>, String> {
    let dir = fragments_resource_dir(&app_handle)?;

    let entries = std::fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read bundled fragments directory: {e}"))?;

    let mut result = Vec::new();

    for entry in entries {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }

        let Ok(contents) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&contents) else {
            continue;
        };

        let filename = path
            .file_name()
            .and_then(|f| f.to_str())
            .unwrap_or_default()
            .to_string();

        let fragment_type = value
            .get("fragment_type")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string();
        let name = value
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Untitled")
            .to_string();
        let tags = value
            .get("tags")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|t| t.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();
        let format_version = value
            .get("format_version")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;

        result.push(BundledFragmentSummary {
            filename,
            fragment_type,
            name,
            tags,
            format_version,
        });
    }

    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}

/// Imports one bundled fragment by filename. Only macro fragments exist
/// today, so this just delegates to `import_macro_json` -- once a second
/// `FragmentPayload` variant exists, this needs to branch on
/// `fragment_type` and route to the right importer. (Rust will force that
/// change: `import_macro_json`'s `let FragmentPayload::Macro { events } =
/// ...` is only a valid irrefutable pattern *because* there's currently
/// just one variant -- adding a second won't compile until every such
/// match becomes exhaustive.)
#[tauri::command]
pub fn import_bundled_fragment(
    app_handle: AppHandle,
    filename: String,
) -> Result<MacroSummary, String> {
    // Reject anything that looks like a path traversal attempt -- this is
    // a filename picked from a list we generated, but defense in depth
    // costs nothing here.
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return Err("Invalid fragment filename".to_string());
    }

    let path = fragments_resource_dir(&app_handle)?.join(&filename);
    let contents = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read bundled fragment '{filename}': {e}"))?;

    import_macro_json(contents)
}

/// Assigns (or clears, if `hotkey` is `None`) a global hotkey for a macro.
/// Registers/unregisters with the OS via `tauri-plugin-global-shortcut`
/// and keeps the in-memory `HotkeyRegistry` + the DB column in sync.
#[tauri::command]
pub fn set_macro_hotkey(
    app_handle: AppHandle,
    registry: tauri::State<'_, HotkeyRegistry>,
    id: String,
    hotkey: Option<String>,
) -> Result<(), String> {
    let conn = init_database().map_err(|e| e.to_string())?;

    let existing_hotkey = get_macro_by_id(&conn, &id)
        .map_err(|e| e.to_string())?
        .and_then(|m| m.hotkey);

    if let Some(new_key) = &hotkey {
        if let Some(owner_id) = get_macro_id_by_hotkey(&conn, new_key).map_err(|e| e.to_string())? {
            if owner_id != id {
                return Err("That hotkey is already assigned to another macro".to_string());
            }
        }
    }

    // Unregister the old binding if it's being replaced or cleared.
    if let Some(old_key) = &existing_hotkey {
        if hotkey.as_deref() != Some(old_key.as_str()) {
            let _ = app_handle.global_shortcut().unregister(old_key.as_str());
            registry.map.lock().unwrap().remove(old_key);
        }
    }

    if let Some(new_key) = &hotkey {
        app_handle
            .global_shortcut()
            .register(new_key.as_str())
            .map_err(|e| format!("Failed to register hotkey '{new_key}': {e}"))?;
        registry.map.lock().unwrap().insert(new_key.clone(), id.clone());
    }

    set_macro_hotkey_item(&conn, &id, hotkey.as_deref()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn play_macro(
    app_handle: AppHandle,
    state: tauri::State<'_, MacroPlayback>,
    id: String,
    speed: Option<f64>,
    repeat: Option<i32>,
) -> Result<(), String> {
    if state.is_playing.load(Ordering::SeqCst) {
        return Err("A macro is already playing".to_string());
    }

    let conn = init_database().map_err(|e| e.to_string())?;
    let macro_item = get_macro_by_id(&conn, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Macro not found".to_string())?;

    start_playback(
        app_handle,
        state.is_playing.clone(),
        state.cancel.clone(),
        macro_item,
        speed.unwrap_or(1.0),
        repeat.unwrap_or(1),
    );

    Ok(())
}

#[tauri::command]
pub fn stop_macro_playback(state: tauri::State<'_, MacroPlayback>) -> Result<(), String> {
    state.cancel.store(true, Ordering::SeqCst);
    Ok(())
}

/// Called from `tauri_plugin_global_shortcut`'s handler when a registered
/// hotkey fires. First checks whether it's the fixed record-toggle hotkey;
/// otherwise looks up which macro (if any) owns that hotkey and plays it
/// at default speed/repeat (hotkeys don't carry per-play options — use the
/// UI's Play button for that).
pub fn handle_global_shortcut(app_handle: &AppHandle, shortcut_str: &str) {
    let is_record_toggle = {
        let record_hotkey = app_handle.state::<RecordHotkeyState>();
        let current = record_hotkey.current.lock().unwrap().clone();
        current == shortcut_str
    };

    if is_record_toggle {
        toggle_recording_via_hotkey(app_handle);
        return;
    }

    let macro_id = {
        let registry = app_handle.state::<HotkeyRegistry>();
        let result = registry.map.lock().unwrap().get(shortcut_str).cloned();
        result
    };

    let Some(id) = macro_id else { return };

    let playback = app_handle.state::<MacroPlayback>();
    if playback.is_playing.load(Ordering::SeqCst) {
        return;
    }

    let conn = match init_database() {
        Ok(c) => c,
        Err(err) => {
            eprintln!("[macros] hotkey trigger: failed to open db: {err}");
            return;
        }
    };

    let macro_item = match get_macro_by_id(&conn, &id) {
        Ok(Some(m)) => m,
        Ok(None) => return,
        Err(err) => {
            eprintln!("[macros] hotkey trigger: failed to load macro: {err}");
            return;
        }
    };

    start_playback(
        app_handle.clone(),
        playback.is_playing.clone(),
        playback.cancel.clone(),
        macro_item,
        1.0,
        1,
    );
}

// ---------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------

/// Toggles recording on/off from the global F9 hotkey. Mirrors the logic
/// in `start_macro_recording`/`stop_macro_recording`, but since a hotkey
/// trigger has no direct return channel to the frontend (unlike an
/// `invoke()` call), it notifies the UI via `macro-recording-hotkey-started`
/// / `macro-recording-hotkey-stopped` events instead.
fn toggle_recording_via_hotkey(app_handle: &AppHandle) {
    let recorder = app_handle.state::<MacroRecorder>();

    if recorder.is_recording.load(Ordering::SeqCst) {
        recorder.is_recording.store(false, Ordering::SeqCst);

        let buffer = recorder.buffer.lock().unwrap();
        let preview = RecordingPreview {
            event_count: buffer.len(),
            duration_ms: buffer.iter().map(event_delay_ms).sum(),
        };
        drop(buffer);

        let _ = app_handle.emit("macro-recording-hotkey-stopped", preview);
    } else {
        if recorder
            .listener_spawned
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            spawn_input_listener(app_handle.clone(), &recorder);
        }

        recorder.buffer.lock().unwrap().clear();
        *recorder.last_event_at.lock().unwrap() = Some(Instant::now());
        recorder.is_recording.store(true, Ordering::SeqCst);

        let _ = app_handle.emit("macro-recording-hotkey-started", ());
    }
}

/// Shared playback engine used by both the `play_macro` command and the
/// global hotkey handler, so there's exactly one place that implements
/// "replay this sequence of events."
fn start_playback(
    app_handle: AppHandle,
    is_playing: Arc<AtomicBool>,
    cancel: Arc<AtomicBool>,
    macro_item: MacroItem,
    speed: f64,
    repeat: i32,
) {
    cancel.store(false, Ordering::SeqCst);
    is_playing.store(true, Ordering::SeqCst);

    let speed = if speed <= 0.0 { 1.0 } else { speed };
    let repeat = repeat.max(1);

    thread::spawn(move || {
        let total = macro_item.events.len();
        let mut cancelled = false;

        'repeat_loop: for repeat_index in 0..repeat {
            for (i, event) in macro_item.events.iter().enumerate() {
                if cancel.load(Ordering::SeqCst) {
                    cancelled = true;
                    break 'repeat_loop;
                }

                let delay = event_delay_ms(event);
                if delay > 0 {
                    thread::sleep(Duration::from_millis((delay as f64 / speed) as u64));
                }

                if let Some(sim_event) = to_sim_event(event) {
                    if let Err(err) = simulate(&sim_event) {
                        eprintln!("[macros] simulate failed: {:?}", err);
                    }
                }

                let _ = app_handle.emit(
                    "macro-playback-progress",
                    serde_json::json!({
                        "macro_id": macro_item.id,
                        "current_index": i + 1,
                        "total": total,
                        "repeat_index": repeat_index,
                        "repeat_total": repeat,
                    }),
                );
            }
        }

        is_playing.store(false, Ordering::SeqCst);
        let _ = app_handle.emit(
            "macro-playback-finished",
            serde_json::json!({ "macro_id": macro_item.id, "cancelled": cancelled }),
        );
    });
}

fn event_delay_ms(event: &MacroEvent) -> u64 {
    match event {
        MacroEvent::KeyDown { delay_ms, .. }
        | MacroEvent::KeyUp { delay_ms, .. }
        | MacroEvent::MouseMove { delay_ms, .. }
        | MacroEvent::MouseDown { delay_ms, .. }
        | MacroEvent::MouseUp { delay_ms, .. }
        | MacroEvent::Wheel { delay_ms, .. } => *delay_ms,
    }
}

fn spawn_input_listener(app_handle: AppHandle, state: &tauri::State<'_, MacroRecorder>) {
    let is_recording = state.is_recording.clone();
    let buffer = state.buffer.clone();
    let last_event_at = state.last_event_at.clone();

    thread::spawn(move || {
        let callback = move |event: rdev::Event| {
            if !is_recording.load(Ordering::SeqCst) {
                return;
            }

            let mut last = last_event_at.lock().unwrap();
            let delay_ms = last.map(|t| t.elapsed().as_millis() as u64).unwrap_or(0);
            *last = Some(Instant::now());
            drop(last);

            let macro_event = match event.event_type {
                EventType::KeyPress(key) => Some(MacroEvent::KeyDown {
                    key: format!("{:?}", key),
                    delay_ms,
                }),
                EventType::KeyRelease(key) => Some(MacroEvent::KeyUp {
                    key: format!("{:?}", key),
                    delay_ms,
                }),
                EventType::MouseMove { x, y } => Some(MacroEvent::MouseMove { x, y, delay_ms }),
                EventType::ButtonPress(button) => Some(MacroEvent::MouseDown {
                    button: format!("{:?}", button),
                    delay_ms,
                }),
                EventType::ButtonRelease(button) => Some(MacroEvent::MouseUp {
                    button: format!("{:?}", button),
                    delay_ms,
                }),
                EventType::Wheel { delta_x, delta_y } => Some(MacroEvent::Wheel {
                    delta_x,
                    delta_y,
                    delay_ms,
                }),
            };

            if let Some(me) = macro_event {
                let mut buf = buffer.lock().unwrap();
                buf.push(me);
                let count = buf.len();
                drop(buf);

                let _ = app_handle.emit(
                    "macro-recording-progress",
                    serde_json::json!({ "event_count": count }),
                );
            }
        };

        // Blocks this thread forever — that's expected.
        if let Err(err) = listen(callback) {
            eprintln!("[macros] rdev listener failed to start: {:?}", err);
        }
    });
}

/// rdev's `Key` implements `Debug` but not `FromStr`, and events were
/// stored via `format!("{:?}", key)` when recording — so playback parses
/// that same textual form back. Covers common gaming/productivity keys;
/// extend this match if you see an `eprintln` warning for an unmapped key.
fn parse_key(s: &str) -> Option<Key> {
    use Key::*;
    Some(match s {
        "Alt" => Alt,
        "AltGr" => AltGr,
        "Backspace" => Backspace,
        "CapsLock" => CapsLock,
        "ControlLeft" => ControlLeft,
        "ControlRight" => ControlRight,
        "Delete" => Delete,
        "DownArrow" => DownArrow,
        "End" => End,
        "Escape" => Escape,
        "F1" => F1, "F2" => F2, "F3" => F3, "F4" => F4,
        "F5" => F5, "F6" => F6, "F7" => F7, "F8" => F8,
        "F9" => F9, "F10" => F10, "F11" => F11, "F12" => F12,
        "Home" => Home,
        "LeftArrow" => LeftArrow,
        "MetaLeft" => MetaLeft,
        "MetaRight" => MetaRight,
        "PageDown" => PageDown,
        "PageUp" => PageUp,
        "Return" => Return,
        "RightArrow" => RightArrow,
        "ShiftLeft" => ShiftLeft,
        "ShiftRight" => ShiftRight,
        "Space" => Space,
        "Tab" => Tab,
        "UpArrow" => UpArrow,
        "PrintScreen" => PrintScreen,
        "ScrollLock" => ScrollLock,
        "Pause" => Pause,
        "NumLock" => NumLock,
        "BackQuote" => BackQuote,
        "Num0" => Num0, "Num1" => Num1, "Num2" => Num2, "Num3" => Num3,
        "Num4" => Num4, "Num5" => Num5, "Num6" => Num6, "Num7" => Num7,
        "Num8" => Num8, "Num9" => Num9,
        "KeyA" => KeyA, "KeyB" => KeyB, "KeyC" => KeyC, "KeyD" => KeyD,
        "KeyE" => KeyE, "KeyF" => KeyF, "KeyG" => KeyG, "KeyH" => KeyH,
        "KeyI" => KeyI, "KeyJ" => KeyJ, "KeyK" => KeyK, "KeyL" => KeyL,
        "KeyM" => KeyM, "KeyN" => KeyN, "KeyO" => KeyO, "KeyP" => KeyP,
        "KeyQ" => KeyQ, "KeyR" => KeyR, "KeyS" => KeyS, "KeyT" => KeyT,
        "KeyU" => KeyU, "KeyV" => KeyV, "KeyW" => KeyW, "KeyX" => KeyX,
        "KeyY" => KeyY, "KeyZ" => KeyZ,
        "LeftBracket" => LeftBracket,
        "RightBracket" => RightBracket,
        "Minus" => Minus,
        "Equal" => Equal,
        "KpReturn" => KpReturn,
        "KpMinus" => KpMinus,
        "KpPlus" => KpPlus,
        "KpMultiply" => KpMultiply,
        "KpDivide" => KpDivide,
        "KpDelete" => KpDelete,
        "Kp0" => Kp0, "Kp1" => Kp1, "Kp2" => Kp2, "Kp3" => Kp3, "Kp4" => Kp4,
        "Kp5" => Kp5, "Kp6" => Kp6, "Kp7" => Kp7, "Kp8" => Kp8, "Kp9" => Kp9,
        other => {
            let code = other
                .strip_prefix("Unknown(")?
                .trim_end_matches(')')
                .parse::<u32>()
                .ok()?;
            Unknown(code)
        }
    })
}

fn parse_button(s: &str) -> Option<Button> {
    match s {
        "Left" => Some(Button::Left),
        "Right" => Some(Button::Right),
        "Middle" => Some(Button::Middle),
        other => other.strip_prefix("Unknown(").and_then(|rest| {
            rest.trim_end_matches(')')
                .parse::<u8>()
                .ok()
                .map(Button::Unknown)
        }),
    }
}

fn to_sim_event(event: &MacroEvent) -> Option<EventType> {
    match event {
        MacroEvent::KeyDown { key, .. } => parse_key(key).map(EventType::KeyPress),
        MacroEvent::KeyUp { key, .. } => parse_key(key).map(EventType::KeyRelease),
        MacroEvent::MouseMove { x, y, .. } => Some(EventType::MouseMove { x: *x, y: *y }),
        MacroEvent::MouseDown { button, .. } => parse_button(button).map(EventType::ButtonPress),
        MacroEvent::MouseUp { button, .. } => parse_button(button).map(EventType::ButtonRelease),
        MacroEvent::Wheel { delta_x, delta_y, .. } => Some(EventType::Wheel {
            delta_x: *delta_x,
            delta_y: *delta_y,
        }),
    }
}