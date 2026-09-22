export interface CommunityFragmentRow {
    id: string;
    fragment_type: string;
    name: string;
    tags: string[];
    format_version: number;
    payload: unknown;
    submitted_by: string | null;
    download_count: number;
    created_at: string;
}

export interface MacroEventLike {
    type: string;
    key?: string;
    button?: string;
    delay_ms?: number;
}

export interface MacroPreviewStats {
    keyPresses: number;
    mouseClicks: number;
    mouseMoves: number;
    wheelScrolls: number;
    distinctKeys: string[];
    totalEvents: number;
}

export const TYPE_LABELS: Record<string, string> = {
    macro: "Macro",
    clipboard_snippet: "Clipboard Snippet",
    monitor_alert_rule: "Alert Rule",
    monitor_layout: "Monitor Layout",
};

export const REPORT_REASONS: { value: string; label: string }[] = [
    { value: "not_as_described", label: "Doesn't do what it claims" },
    { value: "offensive", label: "Offensive content" },
    { value: "spam", label: "Spam or duplicate" },
    { value: "other", label: "Other" },
];

export function summarizeMacroPayload(payload: unknown): MacroPreviewStats | null {
    if (
        typeof payload !== "object" ||
        payload === null ||
        !("events" in payload) ||
        !Array.isArray((payload as { events: unknown }).events)
    ) {
        return null;
    }

    const events = (payload as { events: MacroEventLike[] }).events;
    const stats: MacroPreviewStats = {
        keyPresses: 0,
        mouseClicks: 0,
        mouseMoves: 0,
        wheelScrolls: 0,
        distinctKeys: [],
        totalEvents: events.length,
    };
    const keySet = new Set<string>();

    for (const e of events) {
        switch (e.type) {
            case "KeyDown":
                stats.keyPresses += 1;
                if (e.key) keySet.add(e.key);
                break;
            case "MouseDown":
                stats.mouseClicks += 1;
                break;
            case "MouseMove":
                stats.mouseMoves += 1;
                break;
            case "Wheel":
                stats.wheelScrolls += 1;
                break;
            default:
                break;
        }
    }

    stats.distinctKeys = Array.from(keySet);
    return stats;
}