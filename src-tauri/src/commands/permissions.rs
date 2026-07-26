/// Checks whether the app has been granted the OS-level permission needed
/// for global input capture/simulation (used by the macros feature).
///
/// Only macOS enforces this: Accessibility permission must be granted to
/// the app binary via System Settings -> Privacy & Security -> Accessibility,
/// or `rdev::listen`/`rdev::simulate` will silently receive/do nothing --
/// no error, just zero captured events, which is a confusing failure mode
/// to debug blind. Windows and Linux (X11) don't require an equivalent
/// grant, so this always returns true there. (Linux on Wayland has its own
/// separate restriction on global input hooks, which isn't something an
/// app can request/detect the same way -- that's a compositor-level
/// limitation, not a permission prompt.)
#[cfg(target_os = "macos")]
mod macos_permissions {
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
    }

    pub fn is_trusted() -> bool {
        unsafe { AXIsProcessTrusted() }
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn check_recording_permission() -> bool {
    macos_permissions::is_trusted()
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn check_recording_permission() -> bool {
    true
}