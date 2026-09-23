use crate::database::{init_database, wipe_all_data};

/// Wipes all locally stored app data and settings (macros, clipboard
/// history, monitor alert rules, and the settings store -- hotkey, theme,
/// onboarding flag). Called from the Settings "delete account and data"
/// flow after the online account has been deleted, so a full reset feels
/// like one action rather than two.
#[tauri::command]
pub fn wipe_local_data() -> Result<(), String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    wipe_all_data(&conn).map_err(|e| e.to_string())
}