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