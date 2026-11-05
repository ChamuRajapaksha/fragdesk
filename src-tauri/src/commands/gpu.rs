use crate::gpu;
use crate::gpu::GpuStats;

/// One-shot snapshot of the primary GPU's utilization and VRAM usage.
/// Returns `None` when no real GPU is present or its VRAM can't be
/// queried -- the frontend renders that as a muted "No GPU detected"
/// card rather than an error.
#[tauri::command]
pub async fn get_gpu_stats() -> Result<Option<GpuStats>, String> {
    tauri::async_runtime::spawn_blocking(gpu::get_gpu_stats)
        .await
        .map_err(|err| format!("GPU sampling task failed: {err}"))?
}
