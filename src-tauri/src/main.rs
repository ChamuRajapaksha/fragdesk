// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod database;
mod commands;

use commands::clipboard::{
    ClipboardMonitor,
    get_clipboard_items,
    save_clipboard_text,
    get_current_clipboard,
    start_clipboard_monitor,
    stop_clipboard_monitor,
    delete_clipboard,
    toggle_pin,
    copy_to_clipboard,
};

fn main() {
    tauri::Builder::default()
        .manage(ClipboardMonitor::new())
        .invoke_handler(tauri::generate_handler![
            get_clipboard_items,
            save_clipboard_text,
            get_current_clipboard,
            start_clipboard_monitor,
            stop_clipboard_monitor,
            delete_clipboard,
            toggle_pin,
            copy_to_clipboard,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}