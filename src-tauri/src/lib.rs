mod database;
mod commands;

use commands::clipboard::{
    copy_to_clipboard, delete_clipboard, get_clipboard_items, get_current_clipboard,
    save_clipboard_text, start_clipboard_monitor, stop_clipboard_monitor, toggle_pin,
    ClipboardMonitor,
};
use commands::macros::{
    delete_macro, discard_macro_recording, get_macros, get_record_hotkey, handle_global_shortcut,
    play_macro, rename_macro, save_macro_recording, set_macro_hotkey, start_macro_recording,
    stop_macro_playback, stop_macro_recording, HotkeyRegistry, MacroPlayback, MacroRecorder,
    RECORD_TOGGLE_HOTKEY,
};
use commands::monitor::{get_cpu_per_core, get_system_stats};
use commands::permissions::check_recording_permission;
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

// Learn more about Tauri commands at https://tauri.app/develop/calling-Rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    // Only fire on the actual key-down, not the release.
                    if event.state() == ShortcutState::Pressed {
                        handle_global_shortcut(app, &shortcut.to_string());
                    }
                })
                .build(),
        )
        .manage(ClipboardMonitor::new())
        .manage(MacroRecorder::new())
        .manage(MacroPlayback::new())
        .manage(HotkeyRegistry::new())
        .setup(|app| {
            let handle = app.handle().clone();

            // Register the fixed record-toggle hotkey (F9 by default).
            if let Err(err) = handle.global_shortcut().register(RECORD_TOGGLE_HOTKEY) {
                eprintln!(
                    "[macros] failed to register record-toggle hotkey '{RECORD_TOGGLE_HOTKEY}': {err}"
                );
            }

            // Re-register any per-macro playback hotkeys saved from a
            // previous session.
            if let Ok(conn) = database::init_database() {
                if let Ok(pairs) = database::load_hotkey_map(&conn) {
                    let registry = handle.state::<HotkeyRegistry>();
                    for (hotkey, macro_id) in pairs {
                        match handle.global_shortcut().register(hotkey.as_str()) {
                            Ok(_) => {
                                registry.map.lock().unwrap().insert(hotkey, macro_id);
                            }
                            Err(err) => {
                                eprintln!(
                                    "[macros] failed to re-register hotkey '{hotkey}': {err}"
                                );
                            }
                        }
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            // Clipboard commands
            get_clipboard_items,
            save_clipboard_text,
            get_current_clipboard,
            start_clipboard_monitor,
            stop_clipboard_monitor,
            delete_clipboard,
            toggle_pin,
            copy_to_clipboard,
            // Monitor commands
            get_system_stats,
            get_cpu_per_core,
            // Macro commands
            get_macros,
            start_macro_recording,
            stop_macro_recording,
            save_macro_recording,
            discard_macro_recording,
            delete_macro,
            rename_macro,
            play_macro,
            stop_macro_playback,
            set_macro_hotkey,
            get_record_hotkey,
            check_recording_permission,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}