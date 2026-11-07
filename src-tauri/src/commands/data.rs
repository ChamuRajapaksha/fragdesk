use crate::commands::clipboard::ClipboardMonitor;
use crate::commands::fps::FpsMonitorState;
use crate::commands::macros::{
    HotkeyRegistry, MacroPlayback, MacroRecorder, RecordHotkeyState, DEFAULT_RECORD_HOTKEY,
};
use crate::commands::with_db_handle;
use crate::database::wipe_all_data;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

/// Factory reset. First stops everything that could keep writing to the
/// database or firing shortcuts, then clears all in-memory runtime state,
/// and finally deletes every locally stored row.
#[tauri::command]
pub fn wipe_local_data(app_handle: AppHandle) -> Result<(), String> {
    // Stop background workers before touching anything they might write to.
    crate::commands::clipboard::shutdown(&app_handle.state::<ClipboardMonitor>());
    crate::commands::fps::clear_tracking(&app_handle.state::<FpsMonitorState>());

    // Discard any in-progress recording and cancel playback.
    {
        let recorder = app_handle.state::<MacroRecorder>();
        recorder.is_recording.store(false, Ordering::SeqCst);
        recorder.buffer.lock().unwrap().clear();
        *recorder.last_event_at.lock().unwrap() = None;
    }
    app_handle
        .state::<MacroPlayback>()
        .cancel
        .store(true, Ordering::SeqCst);

    // Forget every macro hotkey and drop the OS registrations.
    app_handle
        .state::<HotkeyRegistry>()
        .map
        .lock()
        .unwrap()
        .clear();
    if let Err(err) = app_handle.global_shortcut().unregister_all() {
        eprintln!("[data] failed to unregister global shortcuts during wipe: {err}");
    }

    // Restore the app-level record-toggle hotkey to its default so the
    // freshly reset app still has a working shortcut without a restart.
    *app_handle
        .state::<RecordHotkeyState>()
        .current
        .lock()
        .unwrap() = DEFAULT_RECORD_HOTKEY.to_string();
    if let Err(err) = app_handle.global_shortcut().register(DEFAULT_RECORD_HOTKEY) {
        eprintln!("[data] failed to re-register the default record hotkey: {err}");
    }

    // Every worker is stopped, so no new rows can appear while the tables
    // are being emptied.
    with_db_handle(&app_handle, wipe_all_data)?;

    Ok(())
}
