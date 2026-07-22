mod database;
mod commands;

use commands::macros::{MacroPlayback, MacroRecorder};

// Learn more about Tauri commands at https://tauri.app/develop/calling-Rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(MacroRecorder::new())
        .manage(MacroPlayback::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::macros::get_macros,
            commands::macros::start_macro_recording,
            commands::macros::stop_macro_recording,
            commands::macros::discard_macro_recording,
            commands::macros::delete_macro,
            commands::macros::rename_macro,
            commands::macros::play_macro,
            commands::macros::stop_macro_playback,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}