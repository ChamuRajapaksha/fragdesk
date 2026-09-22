export interface MacroSummary {
    id: string;
    name: string;
    created_at: number; // unix seconds
    event_count: number;
    duration_ms: number;
    hotkey: string | null;
    tags: string[];
    source: string | null; // null = recorded/imported locally, "community", "starter"
}

export interface RecordingPreview {
    event_count: number;
    duration_ms: number;
}

export interface PlaybackProgress {
    macro_id: string;
    current_index: number;
    total: number;
    repeat_index: number;
    repeat_total: number;
}

export interface PlaybackFinished {
    macro_id: string;
    cancelled: boolean;
}

export function formatDuration(ms: number): string {
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
}

export function formatDate(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toLocaleString();
}

export function formatHotkey(hotkey: string): string {
    return hotkey.replace("CommandOrControl", "Ctrl");
}