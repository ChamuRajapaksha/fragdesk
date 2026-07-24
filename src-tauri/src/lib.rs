mod database;
mod commands;

use commands::clipboard::{
    copy_to_clipboard, delete_clipboard, get_clipboard_items, get_current_clipboard,
    save_clipboard_text, start_clipboard_monitor, stop_clipboard_monitor, toggle_pin,
    ClipboardMonitor,
};
use commands::macros::{
    delete_macro, discard_macro_recording, get_macros, play_macro, rename_macro,
    save_macro_recording, start_macro_recording, stop_macro_playback, stop_macro_recording,
    MacroPlayback, MacroRecorder,
};
use commands::monitor::{get_cpu_per_core, get_system_stats};

// Learn more about Tauri commands at https://tauri.app/develop/calling-Rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ClipboardMonitor::new())
        .manage(MacroRecorder::new())
        .manage(MacroPlayback::new())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}