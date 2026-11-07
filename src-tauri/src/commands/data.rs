use crate::commands::clipboard::ClipboardMonitor;
use crate::commands::fps::FpsMonitorState;
use crate::commands::macros::{
    HotkeyRegistry, MacroPlayback, MacroRecorder, RecordHotkeyState, DEFAULT_RECORD_HOTKEY,
};
use std::sync::atomic::Ordering;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

/// Factory reset. First stops everything that could keep writing to the
/// database or firing shortcuts, then clears all in-memory runtime state.
/// The actual data deletion is a separate step (added in the next commit).
#[tauri::command]
pub fn wipe_local_data(
    app_handle: AppHandle,
    clipboard: tauri::State<'_, ClipboardMonitor>,
    fps: tauri::State<'_, FpsMonitorState>,
    recorder: tauri::State<'_, MacroRecorder>,
    playback: tauri::State<'_, MacroPlayback>,
    registry: tauri::State<'_, HotkeyRegistry>,
    record_hotkey: tauri::State<'_, RecordHotkeyState>,
) -> Result<(), String> {
    // Stop background workers before touching anything they might write to.
    crate::commands::clipboard::shutdown(&clipboard);
    crate::commands::fps::clear_tracking(&fps);

    // Discard any in-progress recording and cancel playback.
    recorder.is_recording.store(false, Ordering::SeqCst);
    recorder.buffer.lock().unwrap().clear();
    *recorder.last_event_at.lock().unwrap() = None;
    playback.cancel.store(true, Ordering::SeqCst);

    // Forget every macro hotkey and drop the OS registrations.
    registry.map.lock().unwrap().clear();
    if let Err(err) = app_handle.global_shortcut().unregister_all() {
        eprintln!("[data] failed to unregister global shortcuts during wipe: {err}");
    }

    // Restore the app-level record-toggle hotkey to its default so the
    // freshly reset app still has a working shortcut without a restart.
    *record_hotkey.current.lock().unwrap() = DEFAULT_RECORD_HOTKEY.to_string();
    if let Err(err) = app_handle.global_shortcut().register(DEFAULT_RECORD_HOTKEY) {
        eprintln!("[data] failed to re-register the default record hotkey: {err}");
    }

    Ok(())
}
