use crate::hotkey::canonicalize_hotkey;
use rusqlite::{Connection, Result};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

/// The single long-lived connection shared by every command. Holding one
/// connection behind a mutex (rather than opening the DB on every command)
/// keeps WAL/busy-timeout settings in effect and avoids repeated open/schema
/// work. Commands access it through `crate::commands::with_db`.
pub struct DbState {
    conn: Mutex<Connection>,
}

impl DbState {
    pub fn new(conn: Connection) -> Self {
        Self {
            conn: Mutex::new(conn),
        }
    }

    pub fn with<T>(&self, f: impl FnOnce(&Connection) -> Result<T>) -> Result<T> {
        let conn = self.conn.lock().map_err(|_| {
            schema_error("database lock poisoned; a previous command panicked while holding it")
        })?;
        f(&conn)
    }
}

pub fn init_database() -> Result<Connection> {
    let db_path = get_db_path()?;
    let conn = Connection::open(db_path)?;
    configure_connection(&conn)?;
    initialize_schema(&conn)?;
    Ok(conn)
}

/// Applies the connection-level PRAGMAs every command relies on. WAL lets
/// readers and the background clipboard worker coexist without blocking
/// each other, the busy timeout gives brief write contention a chance to
/// settle, and foreign keys are enabled for future schema additions.
fn configure_connection(conn: &Connection) -> Result<()> {
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.busy_timeout(Duration::from_secs(5))?;
    Ok(())
}

fn db_open_error(message: impl Into<String>) -> rusqlite::Error {
    rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CANTOPEN),
        Some(message.into()),
    )
}

fn schema_error(message: impl Into<String>) -> rusqlite::Error {
    rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_ERROR),
        Some(message.into()),
    )
}

/// Schema version tracked in `PRAGMA user_version`. Bump this and append a
/// migration whenever the schema changes.
const SCHEMA_VERSION: i64 = 1;

type Migration = fn(&Connection) -> Result<()>;

const MIGRATIONS: &[Migration] = &[migration_001_initial_schema];

fn initialize_schema(conn: &Connection) -> Result<()> {
    let current: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;

    if current > SCHEMA_VERSION {
        return Err(schema_error(format!(
            "database schema version {current} is newer than the supported version {SCHEMA_VERSION}"
        )));
    }

    for (index, migration) in MIGRATIONS.iter().enumerate() {
        let target = index as i64 + 1;
        if current >= target {
            continue;
        }

        let tx = conn.unchecked_transaction()?;
        migration(&tx)?;
        tx.pragma_update(None, "user_version", target)?;
        tx.commit()?;
    }

    normalize_stored_hotkeys(conn)?;

    Ok(())
}

/// Creates every table, index, and column that existed before migrations
/// were versioned. `CREATE ... IF NOT EXISTS` plus explicit column checks
/// keep this safe for databases created by older builds, which report
/// `user_version = 0` even though their schema is already partially current.
fn migration_001_initial_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS monitor_alert_rules (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            metric TEXT NOT NULL,
            comparison TEXT NOT NULL,
            threshold REAL NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            source TEXT,
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS clipboard_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            content_type TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            is_pinned BOOLEAN DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_timestamp ON clipboard_history(timestamp DESC);

        CREATE TABLE IF NOT EXISTS macros (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            event_count INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL,
            events_json TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_macros_created_at ON macros(created_at DESC);

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    )?;

    ensure_column(conn, "macros", "hotkey", "TEXT")?;
    ensure_column(conn, "macros", "tags", "TEXT")?;
    ensure_column(conn, "macros", "source", "TEXT")?;

    Ok(())
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == column {
            return Ok(true);
        }
    }
    Ok(false)
}

fn ensure_column(conn: &Connection, table: &str, column: &str, declaration: &str) -> Result<()> {
    if column_exists(conn, table, column)? {
        return Ok(());
    }

    conn.execute(
        &format!("ALTER TABLE {table} ADD COLUMN {column} {declaration}"),
        [],
    )?;
    Ok(())
}

/// Rewrites any persisted hotkey that isn't already in the global-shortcut
/// plugin's canonical form (`shift+control+F9`, not `Ctrl+Shift+F9`). Both
/// the record-toggle setting and every macro hotkey are normalized, so a
/// value loaded at startup compares equal to the string the plugin's
/// handler emits when that key actually fires.
fn normalize_stored_hotkeys(conn: &Connection) -> Result<()> {
    const RECORD_HOTKEY_SETTING_KEY: &str = "record_toggle_hotkey";

    if let Some(raw) = get_setting(conn, RECORD_HOTKEY_SETTING_KEY)? {
        if let Ok(canonical) = canonicalize_hotkey(&raw) {
            if canonical != raw {
                set_setting(conn, RECORD_HOTKEY_SETTING_KEY, &canonical)?;
            }
        }
    }

    let updates: Vec<(String, String)> = {
        let mut stmt = conn.prepare("SELECT id, hotkey FROM macros WHERE hotkey IS NOT NULL")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        let mut updates = Vec::new();
        for row in rows {
            let (id, raw) = row?;
            if let Ok(canonical) = canonicalize_hotkey(&raw) {
                if canonical != raw {
                    updates.push((id, canonical));
                }
            }
        }
        updates
    };

    for (id, canonical) in updates {
        conn.execute(
            "UPDATE macros SET hotkey = ?1 WHERE id = ?2",
            rusqlite::params![canonical, id],
        )?;
    }

    Ok(())
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

/// Deletes every row from the user-data tables (macros, clipboard history,
/// monitor alert rules) and clears the `settings` store -- the record
/// hotkey, UI theme, and onboarding-completed flag all reset to their
/// first-run defaults along with user data. A true factory reset.
///
/// The deletes run in one transaction so a failure cannot leave a partial
/// reset. `secure_delete` plus `VACUUM` overwrite freed pages instead of
/// merely marking them reusable, and the WAL is checkpointed so deleted
/// rows do not linger in the sidecar file. The database file itself is not
/// deleted: Windows keeps it locked while the managed connection is open,
/// and reopening would require tearing down `DbState`.
pub fn wipe_all_data(conn: &Connection) -> Result<()> {
    conn.pragma_update(None, "secure_delete", "ON")?;

    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM macros", [])?;
    tx.execute("DELETE FROM clipboard_history", [])?;
    tx.execute("DELETE FROM monitor_alert_rules", [])?;
    tx.execute("DELETE FROM settings", [])?;
    tx.execute(
        "DELETE FROM sqlite_sequence WHERE name = 'clipboard_history'",
        [],
    )?;
    tx.commit()?;

    // These must run outside the transaction. VACUUM rewrites the file so
    // deleted content is not left recoverable; the checkpoint folds the WAL
    // back into the main database.
    conn.execute_batch("VACUUM; PRAGMA wal_checkpoint(TRUNCATE);")?;

    Ok(())
}

fn get_db_path() -> Result<PathBuf> {
    let mut path = dirs::data_local_dir()
        .ok_or_else(|| db_open_error("could not resolve the platform local data directory"))?;
    path.push("FragDesk");
    std::fs::create_dir_all(&path).map_err(|err| {
        db_open_error(format!(
            "could not create the FragDesk data directory at {}: {err}",
            path.display()
        ))
    })?;
    path.push("fragdesk.db");
    Ok(path)
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
         ORDER BY timestamp DESC LIMIT ?1",
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
    KeyDown {
        key: String,
        delay_ms: u64,
    },
    KeyUp {
        key: String,
        delay_ms: u64,
    },
    MouseMove {
        x: f64,
        y: f64,
        delay_ms: u64,
    },
    MouseDown {
        button: String,
        delay_ms: u64,
    },
    MouseUp {
        button: String,
        delay_ms: u64,
    },
    Wheel {
        delta_x: i64,
        delta_y: i64,
        delay_ms: u64,
    },
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
        rusqlite::params![
            id,
            name,
            timestamp,
            events.len() as i32,
            duration_ms,
            events_json
        ],
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
    conn.execute(
        "DELETE FROM monitor_alert_rules WHERE id = ?1",
        rusqlite::params![id],
    )?;
    Ok(())
}

pub fn toggle_alert_rule_item(conn: &Connection, id: &str) -> Result<()> {
    conn.execute(
        "UPDATE monitor_alert_rules SET enabled = NOT enabled WHERE id = ?1",
        rusqlite::params![id],
    )?;
    Ok(())
}

#[cfg(test)]
mod hotkey_normalization_tests {
    use super::*;

    #[test]
    fn normalizes_record_and_macro_hotkeys_to_handler_form() {
        let conn = Connection::open_in_memory().unwrap();
        initialize_schema(&conn).unwrap();

        set_setting(&conn, "record_toggle_hotkey", "Ctrl+Shift+F9").unwrap();
        conn.execute(
            "INSERT INTO macros
                (id, name, created_at, event_count, duration_ms, events_json, hotkey)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                "m1",
                "Test macro",
                0,
                0,
                0,
                "[]",
                "CommandOrControl+Alt+KeyA"
            ],
        )
        .unwrap();

        normalize_stored_hotkeys(&conn).unwrap();

        let record = get_setting(&conn, "record_toggle_hotkey").unwrap().unwrap();
        assert_eq!(record, "shift+control+F9");

        let stored = load_hotkey_map(&conn).unwrap();
        assert_eq!(stored.len(), 1);
        #[cfg(not(target_os = "macos"))]
        assert_eq!(stored[0].0, "control+alt+KeyA");
        #[cfg(target_os = "macos")]
        assert_eq!(stored[0].0, "super+alt+KeyA");

        // The persisted value is already in the exact form the shortcut
        // handler receives from the plugin when the key fires.
        assert_eq!(canonicalize_hotkey(&stored[0].0).unwrap(), stored[0].0);
    }
}

#[cfg(test)]
mod connection_tests {
    use super::*;

    #[test]
    fn configures_concurrency_pragmas() {
        let conn = Connection::open_in_memory().unwrap();
        configure_connection(&conn).unwrap();

        let foreign_keys: i64 = conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap();
        assert_eq!(foreign_keys, 1);

        let busy_timeout: i64 = conn
            .query_row("PRAGMA busy_timeout", [], |row| row.get(0))
            .unwrap();
        assert_eq!(busy_timeout, 5_000);
    }
}

#[cfg(test)]
mod migration_tests {
    use super::*;

    fn user_version(conn: &Connection) -> i64 {
        conn.pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap()
    }

    #[test]
    fn migrations_are_idempotent_and_record_the_version() {
        let conn = Connection::open_in_memory().unwrap();

        initialize_schema(&conn).unwrap();
        assert_eq!(user_version(&conn), SCHEMA_VERSION);
        assert!(column_exists(&conn, "macros", "hotkey").unwrap());
        assert!(column_exists(&conn, "macros", "tags").unwrap());
        assert!(column_exists(&conn, "macros", "source").unwrap());

        initialize_schema(&conn).unwrap();
        assert_eq!(user_version(&conn), SCHEMA_VERSION);
    }

    #[test]
    fn upgrades_a_legacy_schema_that_has_no_version_marker() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE macros (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                event_count INTEGER NOT NULL,
                duration_ms INTEGER NOT NULL,
                events_json TEXT NOT NULL
            );",
        )
        .unwrap();

        assert_eq!(user_version(&conn), 0);

        initialize_schema(&conn).unwrap();

        assert_eq!(user_version(&conn), SCHEMA_VERSION);
        assert!(column_exists(&conn, "macros", "hotkey").unwrap());
        assert!(column_exists(&conn, "macros", "tags").unwrap());
        assert!(column_exists(&conn, "macros", "source").unwrap());
    }

    #[test]
    fn rejects_a_database_from_a_newer_schema_version() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "user_version", SCHEMA_VERSION + 1)
            .unwrap();

        assert!(initialize_schema(&conn).is_err());
    }
}

#[cfg(test)]
mod wipe_tests {
    use super::*;

    fn count_rows(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .unwrap()
    }

    #[test]
    fn wipe_empties_every_table_and_resets_the_id_sequence() {
        let conn = Connection::open_in_memory().unwrap();
        initialize_schema(&conn).unwrap();

        set_setting(&conn, "ui_theme", "neon").unwrap();
        insert_clipboard_item(&conn, "hello").unwrap();
        insert_macro(&conn, "m1", "Macro", &[], 0).unwrap();
        insert_alert_rule(&conn, "a1", "Alert", "cpu", "above", 90.0, None).unwrap();

        let seq: i64 = conn
            .query_row(
                "SELECT seq FROM sqlite_sequence WHERE name = 'clipboard_history'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(seq, 1);

        wipe_all_data(&conn).unwrap();

        for table in [
            "macros",
            "clipboard_history",
            "monitor_alert_rules",
            "settings",
        ] {
            assert_eq!(count_rows(&conn, table), 0, "{table} should be empty");
        }

        let seq_rows: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_sequence WHERE name = 'clipboard_history'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(seq_rows, 0, "clipboard id sequence should reset");

        // The next clipboard row starts at id 1 again.
        insert_clipboard_item(&conn, "again").unwrap();
        let id: i64 = conn
            .query_row("SELECT id FROM clipboard_history", [], |row| row.get(0))
            .unwrap();
        assert_eq!(id, 1);
    }

    #[test]
    fn wipe_is_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        initialize_schema(&conn).unwrap();

        wipe_all_data(&conn).unwrap();
        wipe_all_data(&conn).unwrap();

        assert_eq!(count_rows(&conn, "settings"), 0);
    }
}
