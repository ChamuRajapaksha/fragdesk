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
    use std::ffi::c_void;
    use std::mem::size_of;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Memory::{
        MapViewOfFile, OpenFileMappingW, UnmapViewOfFile, VirtualQuery, FILE_MAP_READ,
        MEMORY_BASIC_INFORMATION,
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

    // Signature(4) + dwAppEntrySize(4) + dwAppArrOffset(4) + dwAppArrSize(4)
    // plus the four bytes at offset 4 this reader skips. Everything before
    // dwAppArrOffset is header, never entry data.
    const RTSS_HEADER_MIN_LEN: usize = 20;

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

        // MapViewOfFile(0, 0, 0) maps the whole section, but the header must
        // never be trusted to describe a region larger than what Windows
        // actually mapped. VirtualQuery gives us the real committed length.
        let mut region = MEMORY_BASIC_INFORMATION::default();
        let queried = VirtualQuery(
            Some(base as *const c_void),
            &mut region,
            size_of::<MEMORY_BASIC_INFORMATION>(),
        );

        let result = if queried == 0 || region.RegionSize == 0 {
            Err("Failed to query the mapped RTSS shared-memory region".to_string())
        } else {
            let data = std::slice::from_raw_parts(base, region.RegionSize);
            parse(data)
        };

        let _ = UnmapViewOfFile(view);

        result
    }

    /// Validates the fixed header, then walks app entries using the header's
    /// own stride/offset fields. Every offset and range is checked against
    /// `data.len()`; a hostile or version-mismatched header is rejected
    /// rather than allowed to read outside the mapped region.
    fn parse(data: &[u8]) -> Result<Vec<RtssApp>, String> {
        if data.len() < 4 {
            return Err(format!(
                "RTSS shared memory is too small ({} bytes) to contain a signature",
                data.len()
            ));
        }

        let signature = &data[0..4];
        if signature != RTSS_SIGNATURE && signature != RTSS_SIGNATURE_ALT {
            return Err(format!(
                "RTSS shared memory signature mismatch -- found bytes {:02X?} \
                 (as text: {:?}). Neither expected ordering matched; this is the \
                 real data needed to fix the signature check precisely.",
                signature,
                String::from_utf8_lossy(signature),
            ));
        }

        if data.len() < RTSS_HEADER_MIN_LEN {
            return Err(format!(
                "RTSS shared memory is too small ({} bytes) for the {} byte header",
                data.len(),
                RTSS_HEADER_MIN_LEN
            ));
        }

        let read_u32 = |offset: usize| -> Result<u32, String> {
            let bytes = data.get(offset..offset + 4).ok_or_else(|| {
                format!(
                    "RTSS header read out of bounds at offset {offset} \
                     (mapped region is {} bytes)",
                    data.len()
                )
            })?;
            Ok(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
        };

        let app_entry_size = read_u32(8)? as usize;
        let app_arr_offset = read_u32(12)? as usize;
        let app_arr_size = (read_u32(16)? as usize).min(MAX_APPS_TO_READ);

        if app_arr_offset < RTSS_HEADER_MIN_LEN {
            return Err(format!(
                "RTSS app array offset ({app_arr_offset}) points into the header \
                 (must be >= {RTSS_HEADER_MIN_LEN}) -- refusing to read it"
            ));
        }

        if app_entry_size < ENTRY_PREFIX_SIZE {
            return Err(format!(
                "RTSS app entry size ({app_entry_size} bytes) is smaller than expected \
                 ({ENTRY_PREFIX_SIZE} bytes) -- likely an RTSS version mismatch with this reader"
            ));
        }

        let mut apps = Vec::new();

        for i in 0..app_arr_size {
            let stride = i.checked_mul(app_entry_size).ok_or_else(|| {
                format!("RTSS app entry {i} stride overflows address space")
            })?;
            let entry_offset = app_arr_offset.checked_add(stride).ok_or_else(|| {
                format!("RTSS app entry {i} offset overflows address space")
            })?;
            let entry_end = entry_offset.checked_add(ENTRY_PREFIX_SIZE).ok_or_else(|| {
                format!("RTSS app entry {i} end offset overflows address space")
            })?;

            if entry_end > data.len() {
                return Err(format!(
                    "RTSS app entry {i} spans {entry_offset}..{entry_end}, outside the \
                     mapped region ({} bytes) -- rejecting malformed header",
                    data.len()
                ));
            }

            let process_id = read_u32(entry_offset)?;

            if process_id == 0 {
                continue; // empty slot
            }

            let name_start = entry_offset + 4;
            let name_bytes = &data[name_start..name_start + APP_NAME_MAX_LEN];
            let name_end = name_bytes
                .iter()
                .position(|&b| b == 0)
                .unwrap_or(name_bytes.len());
            let name =
                process_name(&String::from_utf8_lossy(&name_bytes[..name_end])).to_string();

            // offset within entry: processId(4) + name(260) + flags(4)
            // + time0(4) + time1(4) = 276, then frames, then frameTime
            let frames_offset = entry_offset + 4 + APP_NAME_MAX_LEN + 4 + 4 + 4;
            let frames = read_u32(frames_offset)?;
            let frame_time_us = read_u32(frames_offset + 4)?;

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
        use super::{
            parse, process_name, APP_NAME_MAX_LEN, ENTRY_PREFIX_SIZE, RTSS_SIGNATURE,
        };

        fn header(entry_size: u32, arr_offset: u32, count: u32, total_len: usize) -> Vec<u8> {
            let mut data = vec![0u8; total_len];
            data[0..4].copy_from_slice(RTSS_SIGNATURE);
            data[8..12].copy_from_slice(&entry_size.to_le_bytes());
            data[12..16].copy_from_slice(&arr_offset.to_le_bytes());
            data[16..20].copy_from_slice(&count.to_le_bytes());
            data
        }

        #[test]
        fn rejects_buffer_too_small_for_signature() {
            assert!(parse(&[0, 1, 2]).is_err());
        }

        #[test]
        fn rejects_tiny_entry_size() {
            let data = header(16, 20, 1, 4096);
            assert!(parse(&data).is_err());
        }

        #[test]
        fn rejects_entry_size_smaller_than_prefix() {
            let data = header(ENTRY_PREFIX_SIZE as u32 - 1, 20, 1, 4096);
            assert!(parse(&data).is_err());
        }

        #[test]
        fn rejects_app_array_offset_inside_header() {
            let data = header(ENTRY_PREFIX_SIZE as u32, 4, 1, 4096);
            assert!(parse(&data).is_err());
        }

        #[test]
        fn rejects_entry_range_outside_mapped_region() {
            let data = header(ENTRY_PREFIX_SIZE as u32, 20, 1, 100);
            assert!(parse(&data).is_err());
        }

        #[test]
        fn rejects_stride_that_cannot_fit_in_region() {
            let data = header(u32::MAX, 20, 2, 512);
            assert!(parse(&data).is_err());
        }

        #[test]
        fn rejects_oversized_count() {
            let data = header(
                ENTRY_PREFIX_SIZE as u32,
                20,
                u32::MAX,
                20 + ENTRY_PREFIX_SIZE,
            );
            assert!(parse(&data).is_err());
        }

        #[test]
        fn accepts_header_with_empty_slot() {
            let data = header(
                ENTRY_PREFIX_SIZE as u32,
                20,
                1,
                20 + ENTRY_PREFIX_SIZE,
            );
            assert!(parse(&data).unwrap().is_empty());
        }

        #[test]
        fn parses_valid_app_entry() {
            let mut data = header(
                ENTRY_PREFIX_SIZE as u32,
                20,
                1,
                20 + ENTRY_PREFIX_SIZE,
            );

            let entry = 20usize;
            data[entry..entry + 4].copy_from_slice(&4242u32.to_le_bytes());
            let name = b"C:\\Games\\Game.exe";
            data[entry + 4..entry + 4 + name.len()].copy_from_slice(name);

            let frames_offset = entry + 4 + APP_NAME_MAX_LEN + 4 + 4 + 4;
            data[frames_offset..frames_offset + 4].copy_from_slice(&7u32.to_le_bytes());
            data[frames_offset + 4..frames_offset + 8]
                .copy_from_slice(&16667u32.to_le_bytes());

            let apps = parse(&data).unwrap();
            assert_eq!(apps.len(), 1);
            assert_eq!(apps[0].process_id, 4242);
            assert_eq!(apps[0].name, "Game.exe");
            assert_eq!(apps[0].frames, 7);
            assert_eq!(apps[0].frame_time_us, 16667);
        }

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