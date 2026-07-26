use rusqlite::{Connection, Result};
use std::path::PathBuf;

pub fn init_database() -> Result<Connection> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path)?;

    // Create clipboard_history table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS clipboard_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            content_type TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            is_pinned BOOLEAN DEFAULT 0
        )",
        [],
    )?;

    // Create index for faster queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_timestamp ON clipboard_history(timestamp DESC)",
        [],
    )?;

    // Create macros table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS macros (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            event_count INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL,
            events_json TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_macros_created_at ON macros(created_at DESC)",
        [],
    )?;

    // Migration: add hotkey column if it doesn't exist yet (older DBs won't
    // have it). SQLite has no "ADD COLUMN IF NOT EXISTS", so we just ignore
    // the error if the column is already there.
    let _ = conn.execute("ALTER TABLE macros ADD COLUMN hotkey TEXT", []);

    // Generic key-value settings store. Currently used for the
    // record-toggle hotkey, but kept general so future app-wide
    // preferences don't each need their own table.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    )?;

    Ok(conn)
}

pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
    let mut rows = stmt.query(rusqlite::params![key])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key, value],
    )?;
    Ok(())
}

fn get_db_path() -> PathBuf {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("FragDesk");
    std::fs::create_dir_all(&path).ok();
    path.push("fragdesk.db");
    path
}

pub fn insert_clipboard_item(conn: &Connection, content: &str) -> Result<()> {
    let timestamp = chrono::Utc::now().timestamp();

    conn.execute(
        "INSERT INTO clipboard_history (content, content_type, timestamp) VALUES (?1, ?2, ?3)",
        [content, "text", &timestamp.to_string()],
    )?;

    Ok(())
}

pub fn get_clipboard_history(conn: &Connection, limit: i32) -> Result<Vec<ClipboardItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, content, timestamp, is_pinned FROM clipboard_history 
         ORDER BY timestamp DESC LIMIT ?1"
    )?;

    let items = stmt.query_map([limit], |row| {
        Ok(ClipboardItem {
            id: row.get(0)?,
            content: row.get(1)?,
            timestamp: row.get(2)?,
            is_pinned: row.get(3)?,
        })
    })?;

    let mut result = Vec::new();
    for item in items {
        result.push(item?);
    }

    Ok(result)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ClipboardItem {
    pub id: i32,
    pub content: String,
    pub timestamp: i64,
    pub is_pinned: bool,
}

pub fn delete_clipboard_item(conn: &Connection, id: i32) -> Result<()> {
    conn.execute("DELETE FROM clipboard_history WHERE id = ?1", [id])?;
    Ok(())
}

pub fn toggle_pin_item(conn: &Connection, id: i32) -> Result<()> {
    conn.execute(
        "UPDATE clipboard_history SET is_pinned = NOT is_pinned WHERE id = ?1",
        [id],
    )?;
    Ok(())
}

// ---------------------------------------------------------------------
// Macros feature
// ---------------------------------------------------------------------

/// A single captured input event. `delay_ms` is the gap *before* this
/// event fires, relative to the previous one — storing deltas rather than
/// absolute timestamps makes speed-scaled playback a simple multiply.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type")]
pub enum MacroEvent {
    KeyDown { key: String, delay_ms: u64 },
    KeyUp { key: String, delay_ms: u64 },
    MouseMove { x: f64, y: f64, delay_ms: u64 },
    MouseDown { button: String, delay_ms: u64 },
    MouseUp { button: String, delay_ms: u64 },
    Wheel { delta_x: i64, delta_y: i64, delay_ms: u64 },
}

/// Metadata-only view used for list screens (no event payload).
#[derive(Debug, Clone, serde::Serialize)]
pub struct MacroSummary {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub event_count: i32,
    pub duration_ms: i64,
    pub hotkey: Option<String>,
}

/// Full macro including its event sequence, used for playback.
#[derive(Debug, Clone, serde::Serialize)]
pub struct MacroItem {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub event_count: i32,
    pub duration_ms: i64,
    pub hotkey: Option<String>,
    pub events: Vec<MacroEvent>,
}

pub fn insert_macro(
    conn: &Connection,
    id: &str,
    name: &str,
    events: &[MacroEvent],
    duration_ms: i64,
) -> Result<()> {
    let timestamp = chrono::Utc::now().timestamp();
    let events_json = serde_json::to_string(events)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

    conn.execute(
        "INSERT INTO macros (id, name, created_at, event_count, duration_ms, events_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![id, name, timestamp, events.len() as i32, duration_ms, events_json],
    )?;

    Ok(())
}

pub fn get_macros(conn: &Connection) -> Result<Vec<MacroSummary>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, created_at, event_count, duration_ms, hotkey
         FROM macros ORDER BY created_at DESC",
    )?;

    let items = stmt.query_map([], |row| {
        Ok(MacroSummary {
            id: row.get(0)?,
            name: row.get(1)?,
            created_at: row.get(2)?,
            event_count: row.get(3)?,
            duration_ms: row.get(4)?,
            hotkey: row.get(5)?,
        })
    })?;

    let mut result = Vec::new();
    for item in items {
        result.push(item?);
    }

    Ok(result)
}

pub fn get_macro_by_id(conn: &Connection, id: &str) -> Result<Option<MacroItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, created_at, event_count, duration_ms, events_json, hotkey
         FROM macros WHERE id = ?1",
    )?;

    let mut rows = stmt.query(rusqlite::params![id])?;

    if let Some(row) = rows.next()? {
        let events_json: String = row.get(5)?;
        let events: Vec<MacroEvent> = serde_json::from_str(&events_json).unwrap_or_default();

        Ok(Some(MacroItem {
            id: row.get(0)?,
            name: row.get(1)?,
            created_at: row.get(2)?,
            event_count: row.get(3)?,
            duration_ms: row.get(4)?,
            events,
            hotkey: row.get(6)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn delete_macro_item(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM macros WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}

pub fn rename_macro_item(conn: &Connection, id: &str, name: &str) -> Result<()> {
    conn.execute(
        "UPDATE macros SET name = ?1 WHERE id = ?2",
        rusqlite::params![name, id],
    )?;
    Ok(())
}

pub fn set_macro_hotkey_item(conn: &Connection, id: &str, hotkey: Option<&str>) -> Result<()> {
    conn.execute(
        "UPDATE macros SET hotkey = ?1 WHERE id = ?2",
        rusqlite::params![hotkey, id],
    )?;
    Ok(())
}

/// Returns the id of whichever macro (if any) already owns this hotkey
/// string, so callers can detect conflicts before assigning it elsewhere.
pub fn get_macro_id_by_hotkey(conn: &Connection, hotkey: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT id FROM macros WHERE hotkey = ?1")?;
    let mut rows = stmt.query(rusqlite::params![hotkey])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

/// Loads every (hotkey, macro_id) pair currently saved, so they can be
/// re-registered with the OS on app startup.
pub fn load_hotkey_map(conn: &Connection) -> Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare("SELECT hotkey, id FROM macros WHERE hotkey IS NOT NULL")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    let mut result = Vec::new();
    for r in rows {
        result.push(r?);
    }
    Ok(result)
}