use crate::database::MacroEvent;
use serde::{Deserialize, Serialize};

/// Version of the on-disk fragment format itself (not any individual
/// fragment type's payload). Bump this if the *wrapper* shape changes
/// (e.g. a new required top-level field). Individual payload variants
/// can evolve independently -- see the comment on `FragmentPayload`.
pub const FRAGMENT_FORMAT_VERSION: u32 = 1;

/// One section of the Monitor page's layout: which widget, and whether
/// it's currently shown. Order in the containing `Vec` is the display
/// order. Shared between local persistence (the `settings` table) and
/// the `MonitorLayout` fragment payload -- both use this exact same
/// shape, so there's no conversion step between "how it's stored" and
/// "how it's shared."
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct MonitorWidgetConfig {
    pub id: String,
    pub visible: bool,
}

/// The type-specific data a fragment carries. Tagged so a single `.json`
/// file self-describes what kind of fragment it is -- a "Community
/// Fragments" browser (or a starter-pack importer) can read the
/// `fragment_type` field and route to the right handler without the
/// importer needing to know in advance what it's looking at.
///
/// Adding a new fragment type means adding a variant here -- the
/// `Fragment` wrapper below, and every export/import command built on
/// it, stays unchanged. IMPORTANT: also add the new variant's
/// snake_case name to the fragment_type allow-list in the Supabase
/// insert RLS policy (supabase/*.sql). This has already been missed
/// once (clipboard_snippet shipped without the SQL update, breaking
/// every share attempt with an RLS error until fixed) -- do it
/// proactively alongside the Rust change, not after someone hits it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "fragment_type", content = "payload", rename_all = "snake_case")]
pub enum FragmentPayload {
    Macro { events: Vec<MacroEvent> },
    ClipboardSnippet { content: String },
    MonitorAlertRule {
        metric: String,     // "cpu" | "ram"
        comparison: String, // "above" | "below"
        threshold: f32,
    },
    MonitorLayout { widgets: Vec<MonitorWidgetConfig> },
}

/// The on-disk shape of any exported fragment -- what gets written to a
/// `.json` file and what an import command reads back. Common metadata
/// (name, tags, when it was exported) lives here once, regardless of
/// fragment type; each variant in `FragmentPayload` only carries what's
/// unique to that type.
///
/// Deliberately excludes anything local-machine-specific: no `id`
/// (meaningless elsewhere), no `hotkey` (could collide with something
/// already bound on the importing machine), no `created_at` from the
/// original recording (a re-import gets its own fresh timestamp).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fragment {
    pub format_version: u32,
    pub name: String,
    pub tags: Vec<String>,
    pub exported_at: i64,
    #[serde(flatten)]
    pub payload: FragmentPayload,
}

// Note: these tests deliberately don't rely on #[derive(PartialEq)] for
// Fragment/FragmentPayload/MacroEvent (none of them currently derive it,
// and adding it would mean touching database/mod.rs too) -- instead they
// pattern-match on the deserialized result and assert individual fields.
 
#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::MacroEvent;
 
    fn sample_fragment(payload: FragmentPayload) -> Fragment {
        Fragment {
            format_version: FRAGMENT_FORMAT_VERSION,
            name: "Test Fragment".to_string(),
            tags: vec!["tag1".to_string(), "tag2".to_string()],
            exported_at: 1_700_000_000,
            payload,
        }
    }
 
    #[test]
    fn macro_fragment_round_trips() {
        let original = sample_fragment(FragmentPayload::Macro {
            events: vec![
                MacroEvent::KeyDown { key: "KeyA".to_string(), delay_ms: 0 },
                MacroEvent::KeyUp { key: "KeyA".to_string(), delay_ms: 50 },
            ],
        });
 
        let json = serde_json::to_string(&original).expect("serialize");
        let restored: Fragment = serde_json::from_str(&json).expect("deserialize");
 
        assert_eq!(restored.name, "Test Fragment");
        assert_eq!(restored.tags, vec!["tag1", "tag2"]);
        assert_eq!(restored.format_version, FRAGMENT_FORMAT_VERSION);
 
        match restored.payload {
            FragmentPayload::Macro { events } => {
                assert_eq!(events.len(), 2);
                match &events[0] {
                    MacroEvent::KeyDown { key, delay_ms } => {
                        assert_eq!(key, "KeyA");
                        assert_eq!(*delay_ms, 0);
                    }
                    other => panic!("expected KeyDown, got {other:?}"),
                }
            }
            other => panic!("expected Macro payload, got {other:?}"),
        }
    }
 
    #[test]
    fn clipboard_snippet_fragment_round_trips() {
        let original = sample_fragment(FragmentPayload::ClipboardSnippet {
            content: "gg wp".to_string(),
        });
 
        let json = serde_json::to_string(&original).expect("serialize");
        let restored: Fragment = serde_json::from_str(&json).expect("deserialize");
 
        match restored.payload {
            FragmentPayload::ClipboardSnippet { content } => assert_eq!(content, "gg wp"),
            other => panic!("expected ClipboardSnippet payload, got {other:?}"),
        }
    }
 
    #[test]
    fn monitor_alert_rule_fragment_round_trips() {
        let original = sample_fragment(FragmentPayload::MonitorAlertRule {
            metric: "cpu".to_string(),
            comparison: "above".to_string(),
            threshold: 90.5,
        });
 
        let json = serde_json::to_string(&original).expect("serialize");
        let restored: Fragment = serde_json::from_str(&json).expect("deserialize");
 
        match restored.payload {
            FragmentPayload::MonitorAlertRule { metric, comparison, threshold } => {
                assert_eq!(metric, "cpu");
                assert_eq!(comparison, "above");
                assert!((threshold - 90.5).abs() < f32::EPSILON);
            }
            other => panic!("expected MonitorAlertRule payload, got {other:?}"),
        }
    }
 
    #[test]
    fn monitor_layout_fragment_round_trips() {
        let original = sample_fragment(FragmentPayload::MonitorLayout {
            widgets: vec![
                MonitorWidgetConfig { id: "stats".to_string(), visible: true },
                MonitorWidgetConfig { id: "alerts".to_string(), visible: false },
            ],
        });
 
        let json = serde_json::to_string(&original).expect("serialize");
        let restored: Fragment = serde_json::from_str(&json).expect("deserialize");
 
        match restored.payload {
            FragmentPayload::MonitorLayout { widgets } => {
                assert_eq!(widgets.len(), 2);
                assert_eq!(widgets[0], MonitorWidgetConfig { id: "stats".to_string(), visible: true });
                assert_eq!(widgets[1], MonitorWidgetConfig { id: "alerts".to_string(), visible: false });
            }
            other => panic!("expected MonitorLayout payload, got {other:?}"),
        }
    }
 
    #[test]
    fn serialized_json_has_the_expected_tagged_shape() {
        // Confirms the on-disk shape itself, not just that round-tripping
        // works -- this is what actually gets written to a shared .json
        // file, so its exact structure matters (fragment_type/payload
        // wrapping, not flat fields).
        let fragment = sample_fragment(FragmentPayload::ClipboardSnippet {
            content: "hello".to_string(),
        });
        let json = serde_json::to_string(&fragment).expect("serialize");
        let value: serde_json::Value = serde_json::from_str(&json).expect("parse as Value");
 
        assert_eq!(value["fragment_type"], "clipboard_snippet");
        assert_eq!(value["payload"]["content"], "hello");
        assert_eq!(value["name"], "Test Fragment");
        assert_eq!(value["format_version"], FRAGMENT_FORMAT_VERSION);
    }
 
    #[test]
    fn unknown_fragment_type_fails_to_deserialize() {
        let bad_json = r#"{
            "format_version": 1,
            "name": "Bad Fragment",
            "tags": [],
            "exported_at": 0,
            "fragment_type": "something_made_up",
            "payload": {}
        }"#;
 
        let result: Result<Fragment, _> = serde_json::from_str(bad_json);
        assert!(result.is_err(), "an unrecognized fragment_type should fail to parse, not silently succeed");
    }
}