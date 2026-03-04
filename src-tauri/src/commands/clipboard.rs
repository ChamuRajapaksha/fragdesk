use crate::database::{init_database, insert_clipboard_item, get_clipboard_history, ClipboardItem, delete_clipboard_item, toggle_pin_item};
use arboard::Clipboard;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub struct ClipboardMonitor {
    pub is_running: Arc<Mutex<bool>>,
    pub last_content: Arc<Mutex<String>>,
}

impl ClipboardMonitor {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(Mutex::new(false)),
            last_content: Arc::new(Mutex::new(String::new())),
        }
    }
}

#[tauri::command]
pub fn start_clipboard_monitor(
    app_handle: AppHandle,
    state: tauri::State<'_, ClipboardMonitor>,
) -> Result<String, String> {
    let mut is_running = state.is_running.lock().unwrap();
    
    if *is_running {
        return Ok("Already running".to_string());
    }
    
    *is_running = true;
    
    let is_running_clone = state.is_running.clone();
    let last_content_clone = state.last_content.clone();
    
    thread::spawn(move || {
        let mut clipboard = Clipboard::new().unwrap();
        
        loop {
            // Check if we should stop
            {
                let running = is_running_clone.lock().unwrap();
                if !*running {
                    break;
                }
            }
            
            // Check clipboard
            if let Ok(content) = clipboard.get_text() {
                let mut last = last_content_clone.lock().unwrap();
                
                if content != *last && !content.trim().is_empty() {
                    *last = content.clone();
                    
                    // Save to database
                    if let Ok(conn) = init_database() {
                        let _ = insert_clipboard_item(&conn, &content);
                        
                        // Emit event to frontend
                        let _ = app_handle.emit("clipboard-updated", ());
                    }
                }
            }
            
            thread::sleep(Duration::from_millis(500));
        }
    });
    
    Ok("Monitoring started".to_string())
}

#[tauri::command]
pub fn stop_clipboard_monitor(state: tauri::State<'_, ClipboardMonitor>) -> Result<String, String> {
    let mut is_running = state.is_running.lock().unwrap();
    *is_running = false;
    Ok("Monitoring stopped".to_string())
}

#[tauri::command]
pub fn get_clipboard_items(limit: i32) -> Result<Vec<ClipboardItem>, String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    let items = get_clipboard_history(&conn, limit).map_err(|e| e.to_string())?;
    Ok(items)
}

#[tauri::command]
pub fn save_clipboard_text(text: String) -> Result<(), String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    insert_clipboard_item(&conn, &text).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_current_clipboard() -> Result<String, String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    let content = clipboard.get_text().map_err(|e| e.to_string())?;
    Ok(content)
}

#[tauri::command]
pub fn delete_clipboard(id: i32) -> Result<(), String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    delete_clipboard_item(&conn, id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn toggle_pin(id: i32) -> Result<(), String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    toggle_pin_item(&conn, id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn copy_to_clipboard(text: String) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())?;
    Ok(())
}