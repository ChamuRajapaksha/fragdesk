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

    Ok(conn)
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
}

/// Full macro including its event sequence, used for playback.
#[derive(Debug, Clone, serde::Serialize)]
pub struct MacroItem {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub event_count: i32,
    pub duration_ms: i64,
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
        "SELECT id, name, created_at, event_count, duration_ms
         FROM macros ORDER BY created_at DESC",
    )?;

    let items = stmt.query_map([], |row| {
        Ok(MacroSummary {
            id: row.get(0)?,
            name: row.get(1)?,
            created_at: row.get(2)?,
            event_count: row.get(3)?,
            duration_ms: row.get(4)?,
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
        "SELECT id, name, created_at, event_count, duration_ms, events_json
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