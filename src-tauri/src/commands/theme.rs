use crate::database::{get_setting, init_database, set_setting};

const SETTING_KEY: &str = "ui_theme";
const DEFAULT_UI_THEME: &str = "neon";

/// Returns the persisted palette id, or the Neon default on first run.
/// The full colour definitions live in the frontend (src/themes.ts) -- we
/// only persist the palette's short id string.
#[tauri::command]
pub fn get_ui_theme() -> Result<String, String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    let value = get_setting(&conn, SETTING_KEY).map_err(|e| e.to_string())?;
    Ok(value.unwrap_or_else(|| DEFAULT_UI_THEME.to_string()))
}

#[tauri::command]
pub fn set_ui_theme(theme: String) -> Result<(), String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    set_setting(&conn, SETTING_KEY, &theme).map_err(|e| e.to_string())
}