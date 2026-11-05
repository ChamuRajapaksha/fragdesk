use crate::commands::with_db;
use crate::database::{
    delete_alert_rule_item, get_alert_rule_by_id, get_alert_rules as db_get_alert_rules,
    insert_alert_rule, toggle_alert_rule_item, AlertRule, DbState,
};
use crate::fragments::{Fragment, FragmentPayload, FRAGMENT_FORMAT_VERSION};
use uuid::Uuid;

#[tauri::command]
pub fn create_alert_rule(
    state: tauri::State<'_, DbState>,
    name: String,
    metric: String,
    comparison: String,
    threshold: f32,
) -> Result<AlertRule, String> {
    if metric != "cpu" && metric != "ram" && metric != "gpu" {
        return Err("Metric must be 'cpu', 'ram', or 'gpu'".to_string());
    }
    if comparison != "above" && comparison != "below" {
        return Err("Comparison must be 'above' or 'below'".to_string());
    }

    let id = Uuid::new_v4().to_string();
    let rule = with_db(&state, |conn| {
        insert_alert_rule(conn, &id, &name, &metric, &comparison, threshold, None)?;
        get_alert_rule_by_id(conn, &id)
    })?;

    rule.ok_or_else(|| "Failed to load newly created rule".to_string())
}

#[tauri::command]
pub fn get_alert_rules(state: tauri::State<'_, DbState>) -> Result<Vec<AlertRule>, String> {
    with_db(&state, db_get_alert_rules)
}

#[tauri::command]
pub fn delete_alert_rule(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    with_db(&state, |conn| delete_alert_rule_item(conn, &id))
}

#[tauri::command]
pub fn toggle_alert_rule(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    with_db(&state, |conn| toggle_alert_rule_item(conn, &id))
}

#[tauri::command]
pub fn export_alert_rule_json(
    state: tauri::State<'_, DbState>,
    id: String,
) -> Result<String, String> {
    let rule = with_db(&state, |conn| get_alert_rule_by_id(conn, &id))?
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
pub fn import_alert_rule_json(
    state: tauri::State<'_, DbState>,
    json: String,
) -> Result<AlertRule, String> {
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
    let rule = with_db(&state, |conn| {
        insert_alert_rule(
            conn,
            &id,
            &fragment.name,
            &metric,
            &comparison,
            threshold,
            Some("community"),
        )?;
        get_alert_rule_by_id(conn, &id)
    })?;

    rule.ok_or_else(|| "Failed to load imported rule".to_string())
}
