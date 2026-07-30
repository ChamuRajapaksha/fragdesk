use crate::database::MacroEvent;
use serde::{Deserialize, Serialize};

/// Version of the on-disk fragment format itself (not any individual
/// fragment type's payload). Bump this if the *wrapper* shape changes
/// (e.g. a new required top-level field). Individual payload variants
/// can evolve independently -- see the comment on `FragmentPayload`.
pub const FRAGMENT_FORMAT_VERSION: u32 = 1;

/// The type-specific data a fragment carries. Tagged so a single `.json`
/// file self-describes what kind of fragment it is -- a "Community
/// Fragments" browser (or a starter-pack importer) can read the
/// `fragment_type` field and route to the right handler without the
/// importer needing to know in advance what it's looking at.
///
/// Only `Macro` exists today. Adding a new fragment type later (clipboard
/// snippets, tips/configs, etc.) means adding a variant here -- the
/// `Fragment` wrapper below, and every export/import command built on it,
/// stays unchanged.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "fragment_type", content = "payload", rename_all = "snake_case")]
pub enum FragmentPayload {
    Macro { events: Vec<MacroEvent> },
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