//! Shared hotkey parsing/canonicalization.
//!
//! The global-shortcut plugin accepts several spellings for the same combo
//! (`Ctrl`, `Control`, `CommandOrControl`, …) but emits its own canonical
//! string from `Shortcut::to_string()` (lowercase, fixed modifier order).
//! Persisting or comparing the raw user/UI string means the same physical
//! key can be stored under one spelling and looked up under another, so
//! every entry point funnels through [`canonicalize_hotkey`] first.

use std::str::FromStr;
use tauri_plugin_global_shortcut::Shortcut;

/// Parses `input` and returns the plugin's canonical string form.
///
/// Rejects empty strings, modifier-only combos, unknown keys, and combos
/// with more than one main key. The returned value is exactly what the
/// plugin's own `to_string()` produces, which is also the form the global
/// shortcut handler receives when the key fires.
pub fn canonicalize_hotkey(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Hotkey cannot be empty".to_string());
    }

    let shortcut =
        Shortcut::from_str(trimmed).map_err(|e| format!("Invalid hotkey '{input}': {e}"))?;

    Ok(shortcut.to_string())
}

#[cfg(test)]
mod tests {
    use super::canonicalize_hotkey;

    #[test]
    fn single_function_key_is_preserved() {
        assert_eq!(canonicalize_hotkey("F9").unwrap(), "F9");
    }

    #[test]
    fn modifier_order_is_canonicalized() {
        assert_eq!(
            canonicalize_hotkey("Ctrl+Shift+F9").unwrap(),
            "shift+control+F9"
        );
        assert_eq!(
            canonicalize_hotkey("Shift+Ctrl+F9").unwrap(),
            "shift+control+F9"
        );
    }

    #[test]
    fn command_or_control_maps_to_platform_modifier() {
        let canonical = canonicalize_hotkey("CommandOrControl+Alt+KeyA").unwrap();
        #[cfg(target_os = "macos")]
        assert_eq!(canonical, "super+alt+KeyA");
        #[cfg(not(target_os = "macos"))]
        assert_eq!(canonical, "control+alt+KeyA");
    }

    #[test]
    fn casing_variants_produce_the_same_canonical_string() {
        assert_eq!(
            canonicalize_hotkey("ctrl+shift+f9").unwrap(),
            canonicalize_hotkey("CTRL+SHIFT+F9").unwrap()
        );
        assert_eq!(
            canonicalize_hotkey("alt+keya").unwrap(),
            canonicalize_hotkey("Alt+KeyA").unwrap()
        );
    }

    #[test]
    fn whitespace_is_trimmed() {
        assert_eq!(canonicalize_hotkey("  F9  ").unwrap(), "F9");
    }

    #[test]
    fn rejects_empty_input() {
        assert!(canonicalize_hotkey("").is_err());
        assert!(canonicalize_hotkey("   ").is_err());
    }

    #[test]
    fn rejects_modifier_only_combo() {
        assert!(canonicalize_hotkey("Ctrl").is_err());
        assert!(canonicalize_hotkey("Ctrl+Shift").is_err());
    }

    #[test]
    fn rejects_unknown_key() {
        assert!(canonicalize_hotkey("Ctrl+NotARealKey").is_err());
    }

    #[test]
    fn rejects_multiple_main_keys() {
        assert!(canonicalize_hotkey("Ctrl+A+B").is_err());
    }
}
