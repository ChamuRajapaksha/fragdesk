/// Reads frame-timing data from RTSS's (RivaTuner Statistics Server)
/// shared memory block. RTSS itself does the actual DirectX/Vulkan/
/// OpenGL present-call hooking into games -- this module only reads
/// its published results, it doesn't hook anything itself.
///
/// This only works if RTSS (standalone, or via MSI Afterburner) is
/// installed, running, and has hooked the target game. If it isn't,
/// `read_rtss_apps` returns a clear error rather than silently showing
/// no data.
#[derive(Debug, Clone)]
pub struct RtssApp {
    pub process_id: u32,
    pub name: String,
    /// Time of the most recent frame, in microseconds.
    pub frame_time_us: u32,
    /// Running frame count since RTSS started tracking this app. Used
    /// by the polling loop in commands/fps.rs to detect when a NEW
    /// frame has actually rendered, rather than re-sampling the same
    /// frame_time_us value multiple times between polls.
    pub frames: u32,
}

pub fn read_rtss_apps() -> Result<Vec<RtssApp>, String> {
    #[cfg(target_os = "windows")]
    {
        windows_impl::read()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("FPS tracking via RTSS is only supported on Windows".to_string())
    }
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use super::RtssApp;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Memory::{
        MapViewOfFile, OpenFileMappingW, UnmapViewOfFile, FILE_MAP_READ,
    };

    const RTSS_MAPPING_NAME: &str = "RTSSSharedMemoryV2";

    const RTSS_SIGNATURE: &[u8; 4] = b"RTSS";
    // RTSS's original C code almost certainly sets this via a multichar
    // literal ('RTSS'), and how that literal's bytes end up laid out in
    // memory depends on compiler/endianness conventions that differ
    // across the various community reimplementations of this reader --
    // some cite the signature as reading "RTSS" in memory order, others
    // as the byte-reversed "SSTR". Accepting either avoids betting on
    // one guess. If a real system matches neither, the resulting error
    // includes the ACTUAL bytes found (as hex), so a wrong assumption
    // here becomes a precise one-line fix instead of a third blind guess.
    const RTSS_SIGNATURE_ALT: &[u8; 4] = b"SSTR";

    const APP_NAME_MAX_LEN: usize = 260; // MAX_PATH, per the commonly-documented layout

    // RTSS doesn't publish an official header for this -- the layout
    // below is the community-reverse-engineered shape used by tools
    // like CapFrameX and various open-source shared-memory readers.
    // Deliberately only reads the fields every source consistently
    // agrees on (process id, name, last frame time, frame count).
    // Extended stats (min/avg/max/percentile fields some RTSS versions
    // also expose) are NOT read here -- their presence and exact
    // offset varies across versions, so 1% lows are instead computed
    // ourselves in commands/fps.rs from a rolling buffer of
    // frame_time_us samples. That keeps correctness independent of
    // guessing an uncertain offset, at the cost of needing our own
    // sampling loop.
    //
    // Robustness measures against a version mismatch:
    // - Signature bytes are checked before trusting anything else.
    // - The header's own dw_app_entry_size/dw_app_arr_offset fields
    //   are used as the actual stride/offset when walking entries,
    //   not a hardcoded Rust struct size -- so even if a real entry
    //   has MORE fields than we know about, later entries stay
    //   correctly aligned.
    // - Entry count is capped defensively regardless of what the
    //   header claims, so a corrupted/unexpected header can't cause
    //   an unbounded read.

    const ENTRY_PREFIX_SIZE: usize = 4 + APP_NAME_MAX_LEN + 4 + 4 + 4 + 4 + 4;
    // dwProcessID(4) + szName(260) + dwFlags(4) + dwTime0(4) + dwTime1(4)
    // + dwFrames(4) + dwFrameTime(4) = 284 bytes read from the front of
    // each entry, regardless of the entry's real total size.

    const MAX_APPS_TO_READ: usize = 256;

    pub fn read() -> Result<Vec<RtssApp>, String> {
        let wide_name = to_wide(RTSS_MAPPING_NAME);

        let handle = unsafe { OpenFileMappingW(FILE_MAP_READ.0, false, PCWSTR(wide_name.as_ptr())) }
            .map_err(|_| {
                "RTSS not detected -- is RTSS or MSI Afterburner running and hooked into a game?"
                    .to_string()
            })?;

        let result = unsafe { read_from_handle(&handle) };

        unsafe {
            let _ = CloseHandle(handle);
        }

        result
    }

    unsafe fn read_from_handle(
        handle: &windows::Win32::Foundation::HANDLE,
    ) -> Result<Vec<RtssApp>, String> {
        let view = MapViewOfFile(*handle, FILE_MAP_READ, 0, 0, 0);
        if view.Value.is_null() {
            return Err("Failed to map RTSS shared memory into this process".to_string());
        }

        let base = view.Value as *const u8;
        let result = parse(base);

        let _ = UnmapViewOfFile(view);

        result
    }

    unsafe fn parse(base: *const u8) -> Result<Vec<RtssApp>, String> {
        let signature = std::slice::from_raw_parts(base, 4);
        if signature != RTSS_SIGNATURE && signature != RTSS_SIGNATURE_ALT {
            return Err(format!(
                "RTSS shared memory signature mismatch -- found bytes {:02X?} \
                 (as text: {:?}). Neither expected ordering matched; this is the \
                 real data needed to fix the signature check precisely.",
                signature,
                String::from_utf8_lossy(signature),
            ));
        }

        let read_u32 = |offset: usize| -> u32 {
            let mut bytes = [0u8; 4];
            bytes.copy_from_slice(std::slice::from_raw_parts(base.add(offset), 4));
            u32::from_le_bytes(bytes)
        };

        let app_entry_size = read_u32(8) as usize;
        let app_arr_offset = read_u32(12) as usize;
        let app_arr_size = (read_u32(16) as usize).min(MAX_APPS_TO_READ);

        if app_entry_size < ENTRY_PREFIX_SIZE {
            return Err(format!(
                "RTSS app entry size ({app_entry_size} bytes) is smaller than expected \
                 ({ENTRY_PREFIX_SIZE} bytes) -- likely an RTSS version mismatch with this reader"
            ));
        }

        let mut apps = Vec::new();

        for i in 0..app_arr_size {
            let entry_offset = app_arr_offset + i * app_entry_size;
            let process_id = read_u32(entry_offset);

            if process_id == 0 {
                continue; // empty slot
            }

            let name_bytes =
                std::slice::from_raw_parts(base.add(entry_offset + 4), APP_NAME_MAX_LEN);
            let name_end = name_bytes
                .iter()
                .position(|&b| b == 0)
                .unwrap_or(name_bytes.len());
            let name =
                process_name(&String::from_utf8_lossy(&name_bytes[..name_end])).to_string();

            // offset within entry: processId(4) + name(260) + flags(4)
            // + time0(4) + time1(4) = 276, then frames, then frameTime
            let frames_offset = entry_offset + 4 + APP_NAME_MAX_LEN + 4 + 4 + 4;
            let frames = read_u32(frames_offset);
            let frame_time_offset = frames_offset + 4;
            let frame_time_us = read_u32(frame_time_offset);

            apps.push(RtssApp {
                process_id,
                name,
                frame_time_us,
                frames,
            });
        }

        Ok(apps)
    }

    fn to_wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// RTSS stores the hooked executable's FULL path in szName (e.g.
    /// `C:\Games\Game.exe`). Reduce it to just the process name so the
    /// UI/OSD doesn't show the whole path. Handles `\` and `/`; already-
    /// plain names pass through untouched.
    fn process_name(full_path: &str) -> &str {
        std::path::Path::new(full_path)
            .file_name()
            .and_then(|n| n.to_str())
            .filter(|n| !n.is_empty())
            .unwrap_or(full_path)
    }

    #[cfg(test)]
    mod tests {
        use super::process_name;

        #[test]
        fn strips_windows_backslash_path() {
            assert_eq!(process_name(r"C:\Games\Game.exe"), "Game.exe");
        }

        #[test]
        fn strips_forward_slash_path() {
            assert_eq!(process_name("C:/Games/Game.exe"), "Game.exe");
        }

        #[test]
        fn already_plain_name_passes_through() {
            assert_eq!(process_name("Game.exe"), "Game.exe");
        }

        #[test]
        fn deep_path_keeps_only_leaf() {
            assert_eq!(
                process_name(r"D:\Steam\steamapps\common\Game\bin\x64\Game.exe"),
                "Game.exe"
            );
        }

        #[test]
        fn trailing_separator_returns_parent_dir() {
            assert_eq!(process_name(r"C:\Games\"), "Games");
        }

        #[test]
        fn empty_input_stays_empty() {
            assert_eq!(process_name(""), "");
        }
    }
}