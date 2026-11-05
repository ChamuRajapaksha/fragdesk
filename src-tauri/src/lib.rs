mod commands;
mod database;
mod fragments;
mod gpu;
mod hotkey;
mod rtss;

use commands::alerts::{
    create_alert_rule, delete_alert_rule, export_alert_rule_json, get_alert_rules,
    import_alert_rule_json, toggle_alert_rule,
};
use commands::clipboard::{
    copy_to_clipboard, delete_clipboard, export_clipboard_snippet_json, get_clipboard_items,
    get_clipboard_monitor_status, get_current_clipboard, import_clipboard_snippet_json,
    save_clipboard_text, start_clipboard_monitor, stop_clipboard_monitor, toggle_pin,
    ClipboardMonitor,
};
use commands::macros::{
    delete_macro, discard_macro_recording, export_macro_json, get_macros, get_record_hotkey,
    handle_global_shortcut, import_bundled_fragment, import_macro_json, list_bundled_fragments,
    load_record_hotkey, play_macro, rename_macro, save_macro_recording, set_macro_hotkey,
    set_macro_tags, set_record_hotkey, start_macro_recording, stop_macro_playback,
    stop_macro_recording, HotkeyRegistry, MacroPlayback, MacroRecorder, RecordHotkeyState,
    DEFAULT_RECORD_HOTKEY, RECORD_HOTKEY_SETTING_KEY,
};

use commands::monitor_layout::{
    export_monitor_layout_json, get_monitor_layout, import_monitor_layout_json, set_monitor_layout,
};

use commands::onboarding::{has_completed_onboarding, mark_onboarding_completed};

use commands::theme::{get_ui_theme, set_ui_theme};

use commands::data::wipe_local_data;

use commands::fps::{get_fps_stats, list_rtss_apps, set_fps_tracking_target, FpsMonitorState};

use commands::gpu::get_gpu_stats;

use commands::monitor::{get_cpu_per_core, get_system_stats, SystemMonitorState};
use commands::permissions::check_recording_permission;
use hotkey::canonicalize_hotkey;
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    // Only fire on the actual key-down, not the release.
                    if event.state() == ShortcutState::Pressed {
                        handle_global_shortcut(app, &shortcut.to_string());
                    }
                })
                .build(),
        )
        .manage(ClipboardMonitor::new())
        .manage(MacroRecorder::new())
        .manage(MacroPlayback::new())
        .manage(HotkeyRegistry::new())
        .manage(FpsMonitorState::new())
        .manage(SystemMonitorState::new())
        .setup(|app| {
            let handle = app.handle().clone();

            // Open the shared connection once. If the database cannot be
            // opened or migrated, fail startup loudly rather than running
            // with commands that would silently do nothing.
            let conn = database::init_database()?;
            app.manage(database::DbState::new(conn));

            // Load whichever record-toggle hotkey was saved last (or the
            // "F9" default on first run), register it, and make it
            // available to commands/the shortcut handler via managed state.
            let saved_hotkey =
                commands::with_db_handle(&handle, |conn| Ok(load_record_hotkey(conn)))?;
            let hotkey = match canonicalize_hotkey(&saved_hotkey) {
                Ok(canonical) => canonical,
                Err(err) => {
                    eprintln!(
                        "[macros] saved record-toggle hotkey '{saved_hotkey}' is invalid ({err}); \
                         falling back to {DEFAULT_RECORD_HOTKEY}"
                    );
                    commands::macros::DEFAULT_RECORD_HOTKEY.to_string()
                }
            };

            if hotkey != saved_hotkey {
                if let Err(err) = commands::with_db_handle(&handle, |conn| {
                    database::set_setting(conn, RECORD_HOTKEY_SETTING_KEY, &hotkey)
                }) {
                    eprintln!("[macros] failed to persist record-toggle hotkey '{hotkey}': {err}");
                }
            }

            if let Err(err) = handle.global_shortcut().register(hotkey.as_str()) {
                eprintln!("[macros] failed to register record-toggle hotkey '{hotkey}': {err}");
            }

            app.manage(RecordHotkeyState::new(hotkey));

            // Re-register any per-macro playback hotkeys saved from a
            // previous session.
            if let Ok(pairs) = commands::with_db_handle(&handle, database::load_hotkey_map) {
                let registry = handle.state::<HotkeyRegistry>();
                for (hotkey, macro_id) in pairs {
                    let hotkey = match canonicalize_hotkey(&hotkey) {
                        Ok(canonical) => canonical,
                        Err(err) => {
                            eprintln!(
                                "[macros] skipping invalid saved macro hotkey '{hotkey}': {err}"
                            );
                            continue;
                        }
                    };
                    match handle.global_shortcut().register(hotkey.as_str()) {
                        Ok(_) => {
                            registry.map.lock().unwrap().insert(hotkey, macro_id);
                        }
                        Err(err) => {
                            eprintln!("[macros] failed to re-register hotkey '{hotkey}': {err}");
                        }
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Clipboard commands
            get_clipboard_items,
            save_clipboard_text,
            get_current_clipboard,
            start_clipboard_monitor,
            stop_clipboard_monitor,
            get_clipboard_monitor_status,
            delete_clipboard,
            toggle_pin,
            copy_to_clipboard,
            export_clipboard_snippet_json,
            import_clipboard_snippet_json,
            // Monitor commands
            get_system_stats,
            get_cpu_per_core,
            get_gpu_stats,
            // Macro commands
            get_macros,
            start_macro_recording,
            stop_macro_recording,
            save_macro_recording,
            discard_macro_recording,
            delete_macro,
            rename_macro,
            play_macro,
            stop_macro_playback,
            set_macro_hotkey,
            get_record_hotkey,
            set_record_hotkey,
            check_recording_permission,
            export_macro_json,
            import_macro_json,
            set_macro_tags,
            list_bundled_fragments,
            import_bundled_fragment,
            // Alert commands
            create_alert_rule,
            get_alert_rules,
            delete_alert_rule,
            toggle_alert_rule,
            export_alert_rule_json,
            import_alert_rule_json,
            // Monitor layout commands
            get_monitor_layout,
            set_monitor_layout,
            export_monitor_layout_json,
            import_monitor_layout_json,
            // Onboarding commands
            has_completed_onboarding,
            mark_onboarding_completed,
            // Theme commands
            get_ui_theme,
            set_ui_theme,
            // Data commands
            wipe_local_data,
            // FPS commands
            get_fps_stats,
            list_rtss_apps,
            set_fps_tracking_target,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
