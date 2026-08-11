use crate::database::{
    delete_alert_rule_item, get_alert_rule_by_id, get_alert_rules as db_get_alert_rules,
    init_database, insert_alert_rule, toggle_alert_rule_item, AlertRule,
};
use crate::fragments::{Fragment, FragmentPayload, FRAGMENT_FORMAT_VERSION};
use uuid::Uuid;

#[tauri::command]
pub fn create_alert_rule(
    name: String,
    metric: String,
    comparison: String,
    threshold: f32,
) -> Result<AlertRule, String> {
    if metric != "cpu" && metric != "ram" {
        return Err("Metric must be 'cpu' or 'ram'".to_string());
    }
    if comparison != "above" && comparison != "below" {
        return Err("Comparison must be 'above' or 'below'".to_string());
    }

    let id = Uuid::new_v4().to_string();
    let conn = init_database().map_err(|e| e.to_string())?;
    insert_alert_rule(&conn, &id, &name, &metric, &comparison, threshold, None)
        .map_err(|e| e.to_string())?;

    get_alert_rule_by_id(&conn, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Failed to load newly created rule".to_string())
}

#[tauri::command]
pub fn get_alert_rules() -> Result<Vec<AlertRule>, String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    db_get_alert_rules(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_alert_rule(id: String) -> Result<(), String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    delete_alert_rule_item(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_alert_rule(id: String) -> Result<(), String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    toggle_alert_rule_item(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_alert_rule_json(id: String) -> Result<String, String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    let rule = get_alert_rule_by_id(&conn, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Alert rule not found".to_string())?;

    let fragment = Fragment {
        format_version: FRAGMENT_FORMAT_VERSION,
        name: rule.name,
        tags: vec![],
        exported_at: chrono::Utc::now().timestamp(),
        payload: FragmentPayload::MonitorAlertRule {
            metric: rule.metric,
            comparison: rule.comparison,
            threshold: rule.threshold,
        },
    };

    serde_json::to_string_pretty(&fragment).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_alert_rule_json(json: String) -> Result<AlertRule, String> {
    let fragment: Fragment =
        serde_json::from_str(&json).map_err(|e| format!("Couldn't parse fragment file: {e}"))?;

    if fragment.format_version > FRAGMENT_FORMAT_VERSION {
        return Err(
            "This fragment was exported by a newer version of FragDesk and can't be read yet"
                .to_string(),
        );
    }

    let FragmentPayload::MonitorAlertRule {
        metric,
        comparison,
        threshold,
    } = fragment.payload
    else {
        return Err("This fragment isn't an alert rule".to_string());
    };

    let id = Uuid::new_v4().to_string();
    let conn = init_database().map_err(|e| e.to_string())?;
    insert_alert_rule(
        &conn,
        &id,
        &fragment.name,
        &metric,
        &comparison,
        threshold,
        Some("community"),
    )
    .map_err(|e| e.to_string())?;

    get_alert_rule_by_id(&conn, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Failed to load imported rule".to_string())
}