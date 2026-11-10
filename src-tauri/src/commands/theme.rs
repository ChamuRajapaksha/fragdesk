use crate::commands::with_db;
use crate::database::{get_setting, set_setting, DbState};

const SETTING_KEY: &str = "ui_theme";
const DEFAULT_UI_THEME: &str = "neon";

/// Returns the persisted palette id, or the Neon default on first run.
/// The full colour definitions live in the frontend (src/themes.ts) -- we
/// only persist the palette's short id string.
#[tauri::command]
pub fn get_ui_theme(state: tauri::State<'_, DbState>) -> Result<String, String> {
    with_db(&state, |conn| {
        let value = get_setting(conn, SETTING_KEY)?;
        Ok(value.unwrap_or_else(|| DEFAULT_UI_THEME.to_string()))
    })
}

#[tauri::command]
pub fn set_ui_theme(state: tauri::State<'_, DbState>, theme: String) -> Result<(), String> {
    with_db(&state, |conn| set_setting(conn, SETTING_KEY, &theme))
}
