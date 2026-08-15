use crate::database::{get_setting, init_database, set_setting};

const SETTING_KEY: &str = "onboarding_completed";

/// Reuses the generic `settings` table (originally built for the record
/// hotkey) rather than a dedicated column/table -- a single boolean-ish
/// flag doesn't warrant its own schema.
#[tauri::command]
pub fn has_completed_onboarding() -> Result<bool, String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    let value = get_setting(&conn, SETTING_KEY).map_err(|e| e.to_string())?;
    Ok(value.as_deref() == Some("true"))
}

#[tauri::command]
pub fn mark_onboarding_completed() -> Result<(), String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    set_setting(&conn, SETTING_KEY, "true").map_err(|e| e.to_string())
}