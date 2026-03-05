use sysinfo::{System, CpuRefreshKind, MemoryRefreshKind, RefreshKind};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct SystemStats {
    pub cpu_usage: f32,
    pub cpu_count: usize,
    pub ram_used: u64,
    pub ram_total: u64,
    pub ram_percent: f32,
}

#[tauri::command]
pub fn get_system_stats() -> Result<SystemStats, String> {
    let mut sys = System::new_with_specifics(
        RefreshKind::new()
            .with_cpu(CpuRefreshKind::everything())
            .with_memory(MemoryRefreshKind::everything()),
    );
    
    // Wait a bit to get accurate CPU readings
    std::thread::sleep(std::time::Duration::from_millis(200));
    sys.refresh_cpu_all();
    sys.refresh_memory();
    
    let cpu_usage = sys.global_cpu_usage();
    let cpu_count = sys.cpus().len();
    let ram_used = sys.used_memory();
    let ram_total = sys.total_memory();
    let ram_percent = (ram_used as f32 / ram_total as f32) * 100.0;
    
    Ok(SystemStats {
        cpu_usage,
        cpu_count,
        ram_used,
        ram_total,
        ram_percent,
    })
}

#[tauri::command]
pub fn get_cpu_per_core() -> Result<Vec<f32>, String> {
    let mut sys = System::new_with_specifics(
        RefreshKind::new().with_cpu(CpuRefreshKind::everything()),
    );
    
    std::thread::sleep(std::time::Duration::from_millis(200));
    sys.refresh_cpu_all();
    
    let per_core: Vec<f32> = sys.cpus()
        .iter()
        .map(|cpu| cpu.cpu_usage())
        .collect();
    
    Ok(per_core)
}