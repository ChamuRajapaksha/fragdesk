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
    use windows::core::Interface;
    use windows::Win32::Graphics::Dxgi::{
        CreateDXGIFactory2, DXGI_ADAPTER_DESC1, DXGI_ADAPTER_FLAG_SOFTWARE,
        DXGI_MEMORY_SEGMENT_GROUP_LOCAL, DXGI_QUERY_VIDEO_MEMORY_INFO, IDXGIAdapter1,
        IDXGIAdapter3, IDXGIFactory4,
    };

    struct AdapterInfo {
        name: String,
        luid_high: i32,
        luid_low: u32,
        vram_total: u64,
        adapter: IDXGIAdapter3,
    }

    pub fn get_gpu_stats() -> Result<Option<GpuStats>, String> {
        Ok(None)
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

    fn wide_to_string(wide: &[u16]) -> String {
        let end = wide.iter().position(|&c| c == 0).unwrap_or(wide.len());
        String::from_utf16_lossy(&wide[..end])
    }
}