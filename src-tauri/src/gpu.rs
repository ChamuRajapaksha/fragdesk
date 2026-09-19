use serde::Serialize;

/// Snapshot of the primary GPU's current utilization and VRAM usage,
/// paralleling the existing CPU/RAM readouts in the monitor page.
#[derive(Debug, Clone, Serialize)]
pub struct GpuStats {
    pub name: String,
    /// 0-100, summed across the adapter's GPU engines via PDH.
    pub usage_percent: f32,
    /// Dedicated VRAM currently in use, bytes.
    pub memory_used: u64,
    /// Dedicated VRAM total, bytes.
    pub memory_total: u64,
    /// 0-100.
    pub memory_percent: f32,
}

pub fn get_gpu_stats() -> Result<Option<GpuStats>, String> {
    #[cfg(target_os = "windows")]
    {
        windows_impl::get_gpu_stats()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use super::GpuStats;
    use std::mem::size_of;
    use std::{thread, time::Duration};
    use windows::core::{Interface, PCWSTR};
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::Graphics::Dxgi::{
        CreateDXGIFactory2, DXGI_ADAPTER_DESC1, DXGI_ADAPTER_FLAG_SOFTWARE,
        DXGI_MEMORY_SEGMENT_GROUP_LOCAL, DXGI_QUERY_VIDEO_MEMORY_INFO, IDXGIAdapter1,
        IDXGIAdapter3, IDXGIFactory4,
    };
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};
    use windows::Win32::System::Performance::{
        PdhAddEnglishCounterW, PdhCloseQuery, PdhCollectQueryData, PdhGetFormattedCounterArrayW,
        PdhOpenQueryW, PDH_CSTATUS_VALID_DATA, PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE,
        PDH_MORE_DATA, PDH_NO_DATA,
    };

    const GPU_ENGINE_COUNTER_PATH: &str = r"\GPU Engine(*)\Utilization Percentage";
    const PDH_SAMPLE_DELAY_MS: u64 = 100;
    const MAX_INSTANCES: usize = 4096;

    struct AdapterInfo {
        name: String,
        luid_high: i32,
        luid_low: u32,
        vram_total: u64,
        adapter: IDXGIAdapter3,
    }

    pub fn get_gpu_stats() -> Result<Option<GpuStats>, String> {
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.ok();
        let result = get_gpu_stats_inner();
        unsafe { CoUninitialize() };
        result
    }

    fn get_gpu_stats_inner() -> Result<Option<GpuStats>, String> {
        let Some(info) = primary_adapter()? else {
            return Ok(None);
        };

        let (vram_used, vram_total) = query_vram(&info.adapter)?;
        let vram_total = if vram_total > 0 {
            vram_total
        } else {
            info.vram_total
        };
        if vram_total == 0 {
            return Ok(None);
        }

        let usage = query_gpu_usage(info.luid_high, info.luid_low)?;

        let memory_percent = ((vram_used as f64 / vram_total as f64) * 100.0).clamp(0.0, 100.0) as f32;

        Ok(Some(GpuStats {
            name: info.name,
            usage_percent: usage,
            memory_used: vram_used,
            memory_total: vram_total,
            memory_percent,
        }))
    }

    /// Scans DXGI adapters and returns the first real (non-software,
    /// non-Microsoft stub) one -- the "primary/performance" GPU. The
    /// Basic Render Driver / WARP / Remote Display / GDK adapters are
    /// all Microsoft-signed stubs that report no meaningful counters.
    fn primary_adapter() -> Result<Option<AdapterInfo>, String> {
        let factory: IDXGIFactory4 = unsafe { CreateDXGIFactory2::<IDXGIFactory4>(Default::default()) }
            .map_err(|e| format!("failed to create DXGI factory: {e}"))?;

        let mut index: u32 = 0;
        loop {
            let adapter1: IDXGIAdapter1 = match unsafe { factory.EnumAdapters1(index) } {
                Ok(a) => a,
                Err(_) => break, // DXGI_ERROR_NOT_FOUND: no more adapters
            };
            index += 1;

            let desc1 = unsafe { adapter1.GetDesc1() }
                .map_err(|e| format!("failed to read adapter #{index} description: {e}"))?;

            if is_software_or_stub(&desc1) {
                continue;
            }

            let adapter: IDXGIAdapter3 = match adapter1.cast::<IDXGIAdapter3>() {
                Ok(a) => a,
                Err(_) => continue, // too old to query video memory; skip
            };

            return Ok(Some(AdapterInfo {
                name: wide_to_string(&desc1.Description),
                luid_high: desc1.AdapterLuid.HighPart,
                luid_low: desc1.AdapterLuid.LowPart,
                vram_total: desc1.DedicatedVideoMemory as u64,
                adapter,
            }));
        }

        Ok(None)
    }

    fn is_software_or_stub(desc1: &DXGI_ADAPTER_DESC1) -> bool {
        if desc1.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32 != 0 {
            return true;
        }
        let name = wide_to_string(&desc1.Description).to_ascii_lowercase();
        name.starts_with("microsoft")
    }

    /// Dedicated (local) VRAM used/total via `QueryVideoMemoryInfo`.
    /// `Budget` is the amount of local memory this process may use,
    /// which tracks the adapter's dedicated VRAM total.
    fn query_vram(adapter: &IDXGIAdapter3) -> Result<(u64, u64), String> {
        let mut info = DXGI_QUERY_VIDEO_MEMORY_INFO::default();
        unsafe { adapter.QueryVideoMemoryInfo(0, DXGI_MEMORY_SEGMENT_GROUP_LOCAL, &mut info) }
            .map_err(|e| format!("failed to query video memory info: {e}"))?;
        Ok((info.CurrentUsage, info.Budget))
    }

    fn query_gpu_usage(luid_high: i32, luid_low: u32) -> Result<f32, String> {
        let (query, counter) = open_gpu_engine_counter()?;
        let result = collect_gpu_usage(query, counter, luid_high, luid_low);
        unsafe { PdhCloseQuery(query) };
        result
    }

    fn open_gpu_engine_counter() -> Result<(isize, isize), String> {
        let mut query: isize = 0;
        let status = unsafe { PdhOpenQueryW(PCWSTR::null(), 0, &mut query) };
        if status != ERROR_SUCCESS.0 {
            return Err(format!("PdhOpenQueryW failed with status 0x{status:08x}"));
        }

        let path = to_wide(GPU_ENGINE_COUNTER_PATH);
        let mut counter: isize = 0;
        let status =
            unsafe { PdhAddEnglishCounterW(query, PCWSTR(path.as_ptr()), 0, &mut counter) };
        if status != ERROR_SUCCESS.0 {
            unsafe { PdhCloseQuery(query) };
            return Err(format!(
                "PdhAddEnglishCounterW failed with status 0x{status:08x} \
                 (are GPU Engine performance counters available on this system?)"
            ));
        }

        Ok((query, counter))
    }

    fn collect_gpu_usage(
        query: isize,
        counter: isize,
        luid_high: i32,
        luid_low: u32,
    ) -> Result<f32, String> {
        let first = unsafe { PdhCollectQueryData(query) };
        if first != ERROR_SUCCESS.0 && first != PDH_NO_DATA {
            return Err(format!("first PdhCollectQueryData failed: 0x{first:08x}"));
        }

        // Utilization Percentage is a timer-type counter: PDH needs a
        // second sample to derive a rate. Sleep briefly so the delta is
        // non-zero, instead of misreporting 0% on the first call.
        thread::sleep(Duration::from_millis(PDH_SAMPLE_DELAY_MS));

        let second = unsafe { PdhCollectQueryData(query) };
        if second != ERROR_SUCCESS.0 && second != PDH_NO_DATA {
            return Err(format!("second PdhCollectQueryData failed: 0x{second:08x}"));
        }
        if first == PDH_NO_DATA || second == PDH_NO_DATA {
            return Ok(0.0);
        }

        let items = read_formatted_items(counter)?;
        Ok(aggregate_usage(&items, luid_high, luid_low))
    }

    fn read_formatted_items(counter: isize) -> Result<Vec<PDH_FMT_COUNTERVALUE_ITEM_W>, String> {
        let mut buffer_size: u32 = 0;
        let mut item_count: u32 = 0;
        let status = unsafe {
            PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE, &mut buffer_size, &mut item_count, None)
        };
        if status != ERROR_SUCCESS.0 && status != PDH_MORE_DATA {
            if status == PDH_NO_DATA {
                return Ok(Vec::new());
            }
            return Err(format!("failed to size GPU Engine counter buffer: 0x{status:08x}"));
        }

        let buf_items = (buffer_size as usize)
            .div_ceil(size_of::<PDH_FMT_COUNTERVALUE_ITEM_W>())
            .max(item_count as usize)
            + 1;
        let mut items = vec![PDH_FMT_COUNTERVALUE_ITEM_W::default(); buf_items];

        let status = unsafe {
            PdhGetFormattedCounterArrayW(
                counter,
                PDH_FMT_DOUBLE,
                &mut buffer_size,
                &mut item_count,
                Some(items.as_mut_ptr()),
            )
        };
        if status != ERROR_SUCCESS.0 {
            return Err(format!("failed to read GPU Engine counter data: 0x{status:08x}"));
        }

        items.truncate(item_count as usize);
        Ok(items)
    }

    /// Sums utilization across every engine instance whose instance name
    /// embeds the given adapter LUID. Instance names look like
    /// `pid_2616_luid_0x00000000_0x00011372_phys_0_eng_2_engtype_3D`;
    /// the `luid_0x<high>_0x<low>` fragment is the only per-adapter
    /// unique identifier (phys_n is NOT unique across adapters).
    fn aggregate_usage(items: &[PDH_FMT_COUNTERVALUE_ITEM_W], luid_high: i32, luid_low: u32) -> f32 {
        let needle = format!("luid_0x{:08x}_0x{:08x}", luid_high, luid_low);
        let mut total: f64 = 0.0;

        for item in items.iter().take(MAX_INSTANCES) {
            if item.FmtValue.CStatus != PDH_CSTATUS_VALID_DATA {
                continue;
            }
            let value = unsafe { item.FmtValue.Anonymous.doubleValue };
            if !value.is_finite() || value < 0.0 {
                continue;
            }
            let name = unsafe { read_wide_cstring(item.szName.as_ptr()) };
            if !name.to_ascii_lowercase().contains(&needle) {
                continue;
            }
            total += value;
        }

        // Multiple engines can each report up to 100%; the adapter as a
        // whole is busy at most 100%.
        total.min(100.0) as f32
    }

    fn to_wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn wide_to_string(wide: &[u16]) -> String {
        let end = wide.iter().position(|&c| c == 0).unwrap_or(wide.len());
        String::from_utf16_lossy(&wide[..end])
    }

    unsafe fn read_wide_cstring(ptr: *const u16) -> String {
        if ptr.is_null() {
            return String::new();
        }
        let mut len = 0usize;
        while *ptr.add(len) != 0 {
            len += 1;
        }
        let len = len.min(MAX_INSTANCES);
        String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len))
    }
}