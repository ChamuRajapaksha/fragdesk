use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use sysinfo::{CpuRefreshKind, MemoryRefreshKind, RefreshKind, System};

/// Minimum gap between CPU refreshes. sysinfo derives CPU usage from the
/// delta between two samples, so a refresh closer than this would report
/// a meaningless (often 0%) value. At the UI's 1 s polling cadence this
/// sleep never runs after the first call.
const MIN_REFRESH_INTERVAL: Duration = Duration::from_millis(200);

/// Persistent sysinfo handle. Keeping one `System` alive across calls is
/// what makes the time-since-last-refresh approach possible -- the old
/// per-call `System::new` + 200 ms sleep stalled the command thread on
/// every poll.
pub struct SystemMonitorState {
    sys: Arc<Mutex<System>>,
    last_refresh: Arc<Mutex<Option<Instant>>>,
}

impl SystemMonitorState {
    pub fn new() -> Self {
        let sys = System::new_with_specifics(
            RefreshKind::new()
                .with_cpu(CpuRefreshKind::everything())
                .with_memory(MemoryRefreshKind::everything()),
        );

        Self {
            sys: Arc::new(Mutex::new(sys)),
            last_refresh: Arc::new(Mutex::new(None)),
        }
    }
}

/// Refreshes only if enough time has passed for CPU deltas to be
/// meaningful, sleeping the remainder when it hasn't (only possible on
/// the very first call or a fast manual retry).
fn refresh(sys: &mut System, last_refresh: &Mutex<Option<Instant>>, memory: bool) {
    let elapsed = last_refresh
        .lock()
        .unwrap()
        .map(|instant| instant.elapsed())
        .unwrap_or(Duration::ZERO);

    if elapsed < MIN_REFRESH_INTERVAL {
        std::thread::sleep(MIN_REFRESH_INTERVAL - elapsed);
    }

    sys.refresh_cpu_all();
    if memory {
        sys.refresh_memory();
    }

    *last_refresh.lock().unwrap() = Some(Instant::now());
}

#[derive(Debug, Clone, Serialize)]
pub struct SystemStats {
    pub cpu_usage: f32,
    pub cpu_count: usize,
    pub ram_used: u64,
    pub ram_total: u64,
    pub ram_percent: f32,
}

#[tauri::command]
pub async fn get_system_stats(
    state: tauri::State<'_, SystemMonitorState>,
) -> Result<SystemStats, String> {
    let sys = state.sys.clone();
    let last_refresh = state.last_refresh.clone();

    tauri::async_runtime::spawn_blocking(move || -> Result<SystemStats, String> {
        let mut sys = sys
            .lock()
            .map_err(|_| "system monitor state is unavailable".to_string())?;

        refresh(&mut sys, &last_refresh, true);

        let cpu_usage = sys.global_cpu_usage();
        let cpu_count = sys.cpus().len();
        let ram_used = sys.used_memory();
        let ram_total = sys.total_memory();
        let ram_percent = if ram_total > 0 {
            (ram_used as f32 / ram_total as f32) * 100.0
        } else {
            0.0
        };

        Ok(SystemStats {
            cpu_usage,
            cpu_count,
            ram_used,
            ram_total,
            ram_percent,
        })
    })
    .await
    .map_err(|err| format!("system stats task failed: {err}"))?
}

#[tauri::command]
pub async fn get_cpu_per_core(
    state: tauri::State<'_, SystemMonitorState>,
) -> Result<Vec<f32>, String> {
    let sys = state.sys.clone();
    let last_refresh = state.last_refresh.clone();

    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<f32>, String> {
        let mut sys = sys
            .lock()
            .map_err(|_| "system monitor state is unavailable".to_string())?;

        refresh(&mut sys, &last_refresh, false);

        Ok(sys.cpus().iter().map(|cpu| cpu.cpu_usage()).collect())
    })
    .await
    .map_err(|err| format!("cpu stats task failed: {err}"))?
}
