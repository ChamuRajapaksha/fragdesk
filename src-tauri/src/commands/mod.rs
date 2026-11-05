pub mod alerts;
pub mod clipboard;
pub mod data;
pub mod fps;
pub mod gpu;
pub mod macros;
pub mod monitor;
pub mod monitor_layout;
pub mod onboarding;
pub mod permissions;
pub mod theme;

use crate::database::DbState;
use rusqlite::Connection;
use tauri::{AppHandle, Manager};

/// Runs a closure against the shared database connection from a call site
/// (global-shortcut handler, background worker, setup) that only has an
/// `AppHandle`, converting errors to the `String` shape commands return.
pub fn with_db_handle<T>(
    app_handle: &AppHandle,
    f: impl FnOnce(&Connection) -> rusqlite::Result<T>,
) -> Result<T, String> {
    let state = app_handle.state::<DbState>();
    state.with(f).map_err(|e| e.to_string())
}
