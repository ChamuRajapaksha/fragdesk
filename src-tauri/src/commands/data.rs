use crate::commands::with_db;
use crate::database::{wipe_all_data, DbState};

/// Wipes all locally stored app data and settings (macros, clipboard
/// history, monitor alert rules, and the settings store -- hotkey, theme,
/// onboarding flag). Called from the Settings "delete account and data"
/// flow after the online account has been deleted, so a full reset feels
/// like one action rather than two.
#[tauri::command]
pub fn wipe_local_data(state: tauri::State<'_, DbState>) -> Result<(), String> {
    with_db(&state, wipe_all_data)
}
