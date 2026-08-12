use crate::database::{get_setting, init_database, set_setting};
use crate::fragments::{Fragment, FragmentPayload, MonitorWidgetConfig, FRAGMENT_FORMAT_VERSION};

const SETTING_KEY: &str = "monitor_layout";

/// Every widget id Monitor currently knows how to render. Kept as a
/// single source of truth so `normalize_layout` can validate against it
/// -- both when a user reorders things locally, and when an imported
/// community fragment might reference widgets from a version of the app
/// (older or newer) that doesn't quite match this one.
const KNOWN_WIDGET_IDS: [&str; 4] = ["stats", "alerts", "cpu_graph", "ram_graph"];

fn default_layout() -> Vec<MonitorWidgetConfig> {
    KNOWN_WIDGET_IDS
        .iter()
        .map(|id| MonitorWidgetConfig {
            id: id.to_string(),
            visible: true,
        })
        .collect()
}

/// Reconciles an arbitrary widget list (from a user reorder, or an
/// imported fragment) against `KNOWN_WIDGET_IDS`:
/// - Drops anything not in the known set (forward-compat: an older app
///   version importing a fragment built on a newer one with extra
///   widgets just ignores what it doesn't recognize, rather than
///   erroring).
/// - Appends any known widget missing from the input, defaulted to
///   visible, so a fragment that predates a widget being added doesn't
///   silently make that widget disappear for the importer.
/// - Drops duplicate ids, keeping the first occurrence's position.
fn normalize_layout(input: Vec<MonitorWidgetConfig>) -> Vec<MonitorWidgetConfig> {
    let mut seen = std::collections::HashSet::new();
    let mut result: Vec<MonitorWidgetConfig> = input
        .into_iter()
        .filter(|w| KNOWN_WIDGET_IDS.contains(&w.id.as_str()) && seen.insert(w.id.clone()))
        .collect();

    for id in KNOWN_WIDGET_IDS {
        if !seen.contains(id) {
            result.push(MonitorWidgetConfig {
                id: id.to_string(),
                visible: true,
            });
        }
    }

    result
}

#[tauri::command]
pub fn get_monitor_layout() -> Result<Vec<MonitorWidgetConfig>, String> {
    let conn = init_database().map_err(|e| e.to_string())?;
    match get_setting(&conn, SETTING_KEY).map_err(|e| e.to_string())? {
        Some(json) => {
            let parsed: Vec<MonitorWidgetConfig> =
                serde_json::from_str(&json).unwrap_or_else(|_| default_layout());
            Ok(normalize_layout(parsed))
        }
        None => Ok(default_layout()),
    }
}

#[tauri::command]
pub fn set_monitor_layout(widgets: Vec<MonitorWidgetConfig>) -> Result<Vec<MonitorWidgetConfig>, String> {
    let normalized = normalize_layout(widgets);
    let json = serde_json::to_string(&normalized).map_err(|e| e.to_string())?;
    let conn = init_database().map_err(|e| e.to_string())?;
    set_setting(&conn, SETTING_KEY, &json).map_err(|e| e.to_string())?;
    Ok(normalized)
}

#[tauri::command]
pub fn export_monitor_layout_json(name: String) -> Result<String, String> {
    let widgets = get_monitor_layout()?;

    let fragment = Fragment {
        format_version: FRAGMENT_FORMAT_VERSION,
        name,
        tags: vec![],
        exported_at: chrono::Utc::now().timestamp(),
        payload: FragmentPayload::MonitorLayout { widgets },
    };

    serde_json::to_string_pretty(&fragment).map_err(|e| e.to_string())
}

/// Applies an imported layout fragment immediately -- unlike macros or
/// snippets (which each become a new independent item), a layout is a
/// singleton setting, so "importing" one means "replace my current
/// layout with this." There's no separate list of "your layouts" to
/// browse afterward.
#[tauri::command]
pub fn import_monitor_layout_json(json: String) -> Result<Vec<MonitorWidgetConfig>, String> {
    let fragment: Fragment =
        serde_json::from_str(&json).map_err(|e| format!("Couldn't parse fragment file: {e}"))?;

    if fragment.format_version > FRAGMENT_FORMAT_VERSION {
        return Err(
            "This fragment was exported by a newer version of FragDesk and can't be read yet"
                .to_string(),
        );
    }

    let FragmentPayload::MonitorLayout { widgets } = fragment.payload else {
        return Err("This fragment isn't a monitor layout".to_string());
    };

    set_monitor_layout(widgets)
}