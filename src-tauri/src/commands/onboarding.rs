use crate::commands::with_db;
use crate::database::{get_setting, set_setting, DbState};

const SETTING_KEY: &str = "onboarding_completed";

/// Reuses the generic `settings` table (originally built for the record
/// hotkey) rather than a dedicated column/table -- a single boolean-ish
/// flag doesn't warrant its own schema.
#[tauri::command]
pub fn has_completed_onboarding(state: tauri::State<'_, DbState>) -> Result<bool, String> {
    with_db(&state, |conn| {
        let value = get_setting(conn, SETTING_KEY)?;
        Ok(value.as_deref() == Some("true"))
    })
}

#[tauri::command]
pub fn mark_onboarding_completed(state: tauri::State<'_, DbState>) -> Result<(), String> {
    with_db(&state, |conn| set_setting(conn, SETTING_KEY, "true"))
}
