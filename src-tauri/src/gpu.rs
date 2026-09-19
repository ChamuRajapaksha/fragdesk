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

    pub fn get_gpu_stats() -> Result<Option<GpuStats>, String> {
        Ok(None)
    }
}