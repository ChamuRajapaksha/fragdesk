use rusqlite::{Connection, Result};
use std::path::PathBuf;

pub fn init_database() -> Result<Connection> {
    let db_path = get_db_path();
    let conn = Connection::open(db_path)?;


    conn.execute(
        "CREATE TABLE IF NOT EXISTS monitor_alert_rules (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            metric TEXT NOT NULL,
            comparison TEXT NOT NULL,
            threshold REAL NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            source TEXT,
            created_at INTEGER NOT NULL
        )",
        [],
    )?;


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

    // Migration: add tags column (JSON array of strings, e.g. '["Combat","Utility"]').
    // NULL/missing is treated identically to an empty array everywhere this
    // is read, so existing macros don't need backfilling.
    let _ = conn.execute("ALTER TABLE macros ADD COLUMN tags TEXT", []);

    // Migration: add source column (NULL = recorded locally, "community",
    // or "starter"). Used only for UI badging so a downloaded macro is
    // never visually indistinguishable from one you recorded yourself.
    let _ = conn.execute("ALTER TABLE macros ADD COLUMN source TEXT", []);

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
    pub tags: Vec<String>,
    /// None = recorded locally. Some("community") = imported from the
    /// Community Library. Some("starter") = imported from the bundled
    /// starter pack. Used purely for UI badging -- lets the Macro Manager
    /// show a clear, permanent visual distinction between your own
    /// recordings and anything that came from someone else, since a
    /// community macro simulates real input the same as any other once
    /// it's in your library.
    pub source: Option<String>,
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
    pub tags: Vec<String>,
    pub source: Option<String>,
    pub events: Vec<MacroEvent>,
}

/// Parses the `tags` column, which is a JSON array of strings or NULL.
/// NULL (never-set) is treated the same as an empty array everywhere.
fn parse_tags(raw: Option<String>) -> Vec<String> {
    raw.and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
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

/// Sets the `source` column for a macro. Called right after `insert_macro`
/// by import paths that know where the macro came from -- kept as a
/// separate call rather than a parameter on `insert_macro` itself, so
/// `save_macro_recording` (a local recording, source always None) doesn't
/// need to pass a value it'll never use.
pub fn set_macro_source_item(conn: &Connection, id: &str, source: Option<&str>) -> Result<()> {
    conn.execute(
        "UPDATE macros SET source = ?1 WHERE id = ?2",
        rusqlite::params![source, id],
    )?;
    Ok(())
}

pub fn get_macros(conn: &Connection) -> Result<Vec<MacroSummary>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, created_at, event_count, duration_ms, hotkey, tags, source
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
            tags: parse_tags(row.get(6)?),
            source: row.get(7)?,
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
        "SELECT id, name, created_at, event_count, duration_ms, events_json, hotkey, tags, source
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
            tags: parse_tags(row.get(7)?),
            source: row.get(8)?,
        }))
    } else {
        Ok(None)
    }

}

pub fn set_macro_tags(conn: &Connection, id: &str, tags: &[String]) -> Result<()> {
    let tags_json = serde_json::to_string(tags)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    conn.execute(
        "UPDATE macros SET tags = ?1 WHERE id = ?2",
        rusqlite::params![tags_json, id],
    )?;
    Ok(())
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

 
#[derive(Debug, Clone, serde::Serialize)]
pub struct AlertRule {
    pub id: String,
    pub name: String,
    pub metric: String,
    pub comparison: String,
    pub threshold: f32,
    pub enabled: bool,
    pub source: Option<String>,
    pub created_at: i64,
}
 
pub fn insert_alert_rule(
    conn: &Connection,
    id: &str,
    name: &str,
    metric: &str,
    comparison: &str,
    threshold: f32,
    source: Option<&str>,
) -> Result<()> {
    let timestamp = chrono::Utc::now().timestamp();
    conn.execute(
        "INSERT INTO monitor_alert_rules (id, name, metric, comparison, threshold, enabled, source, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)",
        rusqlite::params![id, name, metric, comparison, threshold, source, timestamp],
    )?;
    Ok(())
}
 
pub fn get_alert_rules(conn: &Connection) -> Result<Vec<AlertRule>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, metric, comparison, threshold, enabled, source, created_at
         FROM monitor_alert_rules ORDER BY created_at DESC",
    )?;
 
    let items = stmt.query_map([], |row| {
        Ok(AlertRule {
            id: row.get(0)?,
            name: row.get(1)?,
            metric: row.get(2)?,
            comparison: row.get(3)?,
            threshold: row.get(4)?,
            enabled: row.get::<_, i64>(5)? != 0,
            source: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?;
 
    let mut result = Vec::new();
    for item in items {
        result.push(item?);
    }
    Ok(result)
}
 
pub fn get_alert_rule_by_id(conn: &Connection, id: &str) -> Result<Option<AlertRule>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, metric, comparison, threshold, enabled, source, created_at
         FROM monitor_alert_rules WHERE id = ?1",
    )?;
    let mut rows = stmt.query(rusqlite::params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(AlertRule {
            id: row.get(0)?,
            name: row.get(1)?,
            metric: row.get(2)?,
            comparison: row.get(3)?,
            threshold: row.get(4)?,
            enabled: row.get::<_, i64>(5)? != 0,
            source: row.get(6)?,
            created_at: row.get(7)?,
        }))
    } else {
        Ok(None)
    }
}
 
pub fn delete_alert_rule_item(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM monitor_alert_rules WHERE id = ?1", rusqlite::params![id])?;
    Ok(())
}
 
pub fn toggle_alert_rule_item(conn: &Connection, id: &str) -> Result<()> {
    conn.execute(
        "UPDATE monitor_alert_rules SET enabled = NOT enabled WHERE id = ?1",
        rusqlite::params![id],
    )?;
    Ok(())
}
 