use crate::rtss::read_rtss_apps;
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

/// How many individual frame samples the rolling buffer keeps. At a
/// steady 144fps this is roughly 7 seconds of history; at 60fps, about
/// 17 seconds. Long enough for a meaningful 1% low, short enough to
/// react reasonably quickly to a game closing or performance changing.
const SAMPLE_BUFFER_SIZE: usize = 1000;

/// How often the background thread polls RTSS's shared memory. This is
/// a sampling approximation, not a full per-frame capture -- see the
/// frame-count dedup logic in `spawn_poller` for how it tries to avoid
/// both re-sampling stale frames and missing frames entirely, and its
/// real limitation at very high frame rates.
const POLL_INTERVAL: Duration = Duration::from_millis(4);

pub struct FpsMonitorState {
    target_pid: Arc<Mutex<Option<u32>>>,
    samples: Arc<Mutex<VecDeque<u32>>>,
    last_seen_frames: Arc<Mutex<Option<u32>>>,
    poller_spawned: Arc<AtomicBool>,
}

impl FpsMonitorState {
    pub fn new() -> Self {
        Self {
            target_pid: Arc::new(Mutex::new(None)),
            samples: Arc::new(Mutex::new(VecDeque::new())),
            last_seen_frames: Arc::new(Mutex::new(None)),
            poller_spawned: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct RtssAppSummary {
    pub process_id: u32,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FpsStats {
    pub current_fps: f32,
    pub avg_fps: f32,
    pub one_percent_low_fps: f32,
    pub sample_count: usize,
}

/// One-shot list of apps RTSS currently has hooked, for the user to
/// pick a tracking target from. Doesn't touch the polling state at all.
#[tauri::command]
pub fn list_rtss_apps() -> Result<Vec<RtssAppSummary>, String> {
    let apps = read_rtss_apps()?;
    Ok(apps
        .into_iter()
        .map(|a| RtssAppSummary {
            process_id: a.process_id,
            name: a.name,
        })
        .collect())
}

#[tauri::command]
pub fn set_fps_tracking_target(
    state: tauri::State<'_, FpsMonitorState>,
    process_id: Option<u32>,
) -> Result<(), String> {
    *state.target_pid.lock().unwrap() = process_id;
    state.samples.lock().unwrap().clear();
    *state.last_seen_frames.lock().unwrap() = None;

    if process_id.is_some()
        && state
            .poller_spawned
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
    {
        spawn_poller(
            state.target_pid.clone(),
            state.samples.clone(),
            state.last_seen_frames.clone(),
        );
    }

    Ok(())
}

#[tauri::command]
pub fn get_fps_stats(state: tauri::State<'_, FpsMonitorState>) -> Result<Option<FpsStats>, String> {
    if state.target_pid.lock().unwrap().is_none() {
        return Ok(None);
    }
    let mut samples = state.samples.lock().unwrap();
    Ok(calculate_fps_stats(samples.make_contiguous()))
}

fn spawn_poller(
    target_pid: Arc<Mutex<Option<u32>>>,
    samples: Arc<Mutex<VecDeque<u32>>>,
    last_seen_frames: Arc<Mutex<Option<u32>>>,
) {
    thread::spawn(move || loop {
        thread::sleep(POLL_INTERVAL);

        let pid = match *target_pid.lock().unwrap() {
            Some(pid) => pid,
            None => continue, // tracking stopped -- keep the thread alive, just idle
        };

        let apps = match read_rtss_apps() {
            Ok(apps) => apps,
            Err(_) => continue, // RTSS momentarily unavailable -- skip this tick
        };

        let Some(app) = apps.iter().find(|a| a.process_id == pid) else {
            continue; // target not currently hooked by RTSS (e.g. game closed)
        };

        // Only record a sample when the frame counter has actually
        // advanced since the last poll -- otherwise a slower game (or
        // one that's paused/alt-tabbed) would have the same
        // frame_time_us re-recorded on every 4ms tick, silently
        // skewing the average toward whatever the last real frame was.
        //
        // Real limitation, stated plainly: at frame rates faster than
        // ~250fps (faster than one frame per 4ms poll interval), this
        // still only captures one sample per poll even if multiple
        // frames actually rendered in between -- it's a representative
        // sample of that period, not a complete per-frame capture. For
        // typical gaming frame rates this is a reasonable
        // approximation; it is not frame-perfect at very high refresh
        // rates.
        let mut last_frames = last_seen_frames.lock().unwrap();
        let is_new_frame = match *last_frames {
            Some(prev) => app.frames != prev,
            None => true, // first sample for this tracking session
        };
        *last_frames = Some(app.frames);
        drop(last_frames);

        if is_new_frame && app.frame_time_us > 0 {
            let mut buf = samples.lock().unwrap();
            buf.push_back(app.frame_time_us);
            if buf.len() > SAMPLE_BUFFER_SIZE {
                buf.pop_front();
            }
        }
    });
}

/// Pure, testable statistics computation -- deliberately separated from
/// the RTSS-reading/threading code above so it can be unit tested
/// without needing a real RTSS instance or a live polling thread.
///
/// The "1% low" here is the common overlay-tool approximation: sort
/// individual frame TIMES descending (longest = worst), take the
/// slowest 1% of samples, average their times, convert to fps. This is
/// not a formal statistical percentile of the fps value distribution
/// itself (which would give a slightly different, and arguably less
/// intuitive, number) -- it's the convention tools like RTSS/CapFrameX
/// use, so numbers here should read as familiar to anyone used to those.
pub fn calculate_fps_stats(frame_times_us: &[u32]) -> Option<FpsStats> {
    let valid: Vec<u32> = frame_times_us.iter().copied().filter(|&t| t > 0).collect();
    if valid.is_empty() {
        return None;
    }

    let fps_values: Vec<f64> = valid.iter().map(|&t| 1_000_000.0 / t as f64).collect();
    let current_fps = *fps_values.last().unwrap();
    let avg_fps = fps_values.iter().sum::<f64>() / fps_values.len() as f64;

    let mut sorted_times = valid.clone();
    sorted_times.sort_unstable_by(|a, b| b.cmp(a)); // descending: longest frame time first

    let one_percent_count = ((sorted_times.len() as f64) * 0.01).ceil().max(1.0) as usize;
    let slowest = &sorted_times[..one_percent_count.min(sorted_times.len())];
    let avg_slowest_time_us =
        slowest.iter().map(|&t| t as f64).sum::<f64>() / slowest.len() as f64;
    let one_percent_low_fps = 1_000_000.0 / avg_slowest_time_us;

    Some(FpsStats {
        current_fps: current_fps as f32,
        avg_fps: avg_fps as f32,
        one_percent_low_fps: one_percent_low_fps as f32,
        sample_count: valid.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_returns_none() {
        assert!(calculate_fps_stats(&[]).is_none());
    }

    #[test]
    fn all_zero_input_returns_none() {
        assert!(calculate_fps_stats(&[0, 0, 0]).is_none());
    }

    #[test]
    fn uniform_60fps_frame_times() {
        // 16667us per frame ~= 60fps
        let samples = vec![16667u32; 100];
        let stats = calculate_fps_stats(&samples).unwrap();
        assert!((stats.avg_fps - 60.0).abs() < 0.5);
        assert!((stats.current_fps - 60.0).abs() < 0.5);
        // Uniform frame times -> 1% low should equal the average, since
        // every frame is equally "slow".
        assert!((stats.one_percent_low_fps - 60.0).abs() < 0.5);
        assert_eq!(stats.sample_count, 100);
    }

    #[test]
    fn a_few_slow_frames_pull_down_the_one_percent_low_but_not_the_average() {
        // 99 frames at 16667us (60fps) + 1 frame at 100000us (10fps,
        // a stutter). With 100 samples, "slowest 1%" = 1 sample = the
        // stutter frame itself.
        let mut samples = vec![16667u32; 99];
        samples.push(100_000);

        let stats = calculate_fps_stats(&samples).unwrap();
        assert!(stats.avg_fps > 55.0, "one stutter shouldn't tank the average much");
        assert!(
            stats.one_percent_low_fps < 15.0,
            "the 1% low should reflect the stutter frame specifically, got {}",
            stats.one_percent_low_fps
        );
    }

    #[test]
    fn single_sample_does_not_panic() {
        let stats = calculate_fps_stats(&[16667]).unwrap();
        assert_eq!(stats.sample_count, 1);
        assert!((stats.current_fps - 60.0).abs() < 0.5);
        assert!((stats.one_percent_low_fps - 60.0).abs() < 0.5);
    }

    #[test]
    fn ignores_zero_samples_mixed_with_valid_ones() {
        // A zero frame_time_us shouldn't be possible from real RTSS
        // data, but defensively shouldn't cause a division by zero if
        // it ever shows up.
        let samples = vec![16667, 0, 16667, 0, 16667];
        let stats = calculate_fps_stats(&samples).unwrap();
        assert_eq!(stats.sample_count, 3);
    }
}