use crate::database::{
    delete_macro_item, get_macro_by_id, get_macros as db_get_macros, init_database, insert_macro,
    rename_macro_item, MacroEvent, MacroSummary,
};
use rdev::{listen, simulate, Button, EventType, Key};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
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
/// to throw it away. This gap is intentional (see `RecordingPreview` docs).
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
/// `name`. Call this only after `stop_macro_recording` — capture should
/// already be stopped by the time the user has typed a name.
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
pub fn delete_macro(id: String) -> Result<(), String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    delete_macro_item(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_macro(id: String, name: String) -> Result<(), String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    rename_macro_item(&conn, &id, &name).map_err(|e| e.to_string())
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

    state.cancel.store(false, Ordering::SeqCst);
    state.is_playing.store(true, Ordering::SeqCst);

    let is_playing = state.is_playing.clone();
    let cancel = state.cancel.clone();
    let speed = speed.unwrap_or(1.0).max(0.05);
    let repeat = repeat.unwrap_or(1).max(1);

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

    Ok(())
}

#[tauri::command]
pub fn stop_macro_playback(state: tauri::State<'_, MacroPlayback>) -> Result<(), String> {
    state.cancel.store(true, Ordering::SeqCst);
    Ok(())
}

// ---------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------

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