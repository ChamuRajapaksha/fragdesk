import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { extractErrorMessage, isSupabaseConfigured, supabase } from "../../../community/supabaseClient";

interface CommunityFragmentRow {
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

interface MacroEventLike {
    type: string;
    key?: string;
    button?: string;
    delay_ms?: number;
}

interface MacroPreviewStats {
    keyPresses: number;
    mouseClicks: number;
    mouseMoves: number;
    wheelScrolls: number;
    distinctKeys: string[];
    totalEvents: number;
}

const TYPE_LABELS: Record<string, string> = {
    macro: "Macro",
};

/// Summarizes a macro's raw event list into human-readable counts, purely
/// client-side -- the full payload is already in memory from the browse
/// query, no extra backend call needed. This is the actual safety gate:
/// a community macro simulates real keyboard/mouse input the moment it's
/// played, so someone should see roughly what it does before it lands in
/// their library, not just a name and a tag.
function summarizeMacroPayload(payload: unknown): MacroPreviewStats | null {
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

export default function CommunityLibrary() {
    const [fragments, setFragments] = useState<CommunityFragmentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
    const [importingId, setImportingId] = useState<string | null>(null);
    const [previewOpenId, setPreviewOpenId] = useState<string | null>(null);

    useEffect(() => {
        if (isSupabaseConfigured) {
            refreshFragments();
        } else {
            setLoading(false);
        }
    }, []);

    async function refreshFragments() {
        if (!supabase) return;
        setLoading(true);
        setError(null);
        try {
            const { data, error: queryError } = await supabase
                .from("fragments")
                .select("*")
                .order("created_at", { ascending: false });

            if (queryError) throw queryError;
            setFragments((data as CommunityFragmentRow[]) ?? []);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setLoading(false);
        }
    }

    async function handleImport(row: CommunityFragmentRow) {
        setError(null);
        setImportingId(row.id);
        try {
            // Reconstruct the same Fragment envelope the backend already
            // knows how to parse (see src-tauri/src/fragments.rs) -- the
            // Supabase row and the local export/import JSON shape are
            // deliberately kept structurally identical, so this is just a
            // straight reassembly, not a translation.
            const fragmentJson = JSON.stringify({
                format_version: row.format_version,
                name: row.name,
                tags: row.tags,
                exported_at: Math.floor(new Date(row.created_at).getTime() / 1000),
                fragment_type: row.fragment_type,
                payload: row.payload,
            });

            await invoke("import_macro_json", { json: fragmentJson, source: "community" });
            setImportedIds((prev) => new Set(prev).add(row.id));
            setPreviewOpenId(null);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setImportingId(null);
        }
    }

    if (!isSupabaseConfigured) {
        return (
            <div className="min-h-full bg-[#0a0e27] text-white p-6 space-y-4">
                <div>
                    <h1 className="text-2xl font-bold text-[#00d9ff]">Community Library</h1>
                    <p className="text-sm text-gray-400 mt-1">
                        Browse and import fragments shared by the community.
                    </p>
                </div>
                <div className="bg-[#141933] rounded-xl p-5 border border-white/5 text-sm text-gray-400">
                    <p className="font-medium text-gray-200 mb-1">Not set up yet</p>
                    <p>
                        The community library needs a Supabase project connected. Add{" "}
                        <code className="text-[#00d9ff]">VITE_SUPABASE_URL</code> and{" "}
                        <code className="text-[#00d9ff]">VITE_SUPABASE_ANON_KEY</code> to your{" "}
                        <code className="text-[#00d9ff]">.env</code> file, then restart the dev
                        server. In the meantime, check out the bundled{" "}
                        <span className="text-gray-200">Fragment Library</span> tab for local
                        starter content.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-full bg-[#0a0e27] text-white p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-[#00d9ff]">Community Library</h1>
                <p className="text-sm text-gray-400 mt-1">
                    Browse and import fragments shared by the community. Macros simulate real
                    keyboard/mouse input — preview what one does before importing it.
                </p>
            </div>

            {error && (
                <div className="bg-[#ff3366]/10 border border-[#ff3366]/40 text-[#ff3366] text-sm rounded-lg px-4 py-2">
                    {error}
                </div>
            )}

            {loading ? (
                <p className="text-gray-500 text-sm">Loading...</p>
            ) : fragments.length === 0 ? (
                <p className="text-gray-500 text-sm">No community fragments yet.</p>
            ) : (
                <div className="space-y-2">
                    {fragments.map((row) => {
                        const isImported = importedIds.has(row.id);
                        const isImporting = importingId === row.id;
                        const isPreviewOpen = previewOpenId === row.id;
                        const stats = isPreviewOpen ? summarizeMacroPayload(row.payload) : null;

                        return (
                            <div
                                key={row.id}
                                className="bg-[#141933] rounded-xl p-4 border border-white/5"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium">{row.name}</p>
                                            <span className="text-xs bg-[#b026ff]/15 text-[#b026ff] border border-[#b026ff]/30 rounded px-1.5 py-0.5">
                                                {TYPE_LABELS[row.fragment_type] ?? row.fragment_type}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {row.download_count} downloads
                                        </p>
                                        {row.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                {row.tags.map((tag) => (
                                                    <span
                                                        key={tag}
                                                        className="text-xs bg-white/5 text-gray-400 rounded-full px-2 py-0.5"
                                                    >
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {isImported ? (
                                        <span className="px-4 py-2 rounded-lg text-sm font-medium bg-[#00ff88]/15 text-[#00ff88] border border-[#00ff88]/30">
                                            Imported ✓
                                        </span>
                                    ) : (
                                        <button
                                            onClick={() =>
                                                setPreviewOpenId(isPreviewOpen ? null : row.id)
                                            }
                                            className="px-4 py-2 rounded-lg text-sm font-medium bg-white/5 hover:bg-white/10 text-gray-300"
                                        >
                                            {isPreviewOpen ? "Hide preview" : "Preview"}
                                        </button>
                                    )}
                                </div>

                                {isPreviewOpen && (
                                    <div className="mt-3 pt-3 border-t border-white/5 space-y-3">
                                        {stats ? (
                                            <div className="text-sm text-gray-300 space-y-1">
                                                <p>
                                                    <span className="text-gray-500">
                                                        This macro will simulate:
                                                    </span>
                                                </p>
                                                <ul className="text-xs text-gray-400 space-y-0.5 pl-4 list-disc">
                                                    <li>{stats.keyPresses} key press(es)</li>
                                                    <li>{stats.mouseClicks} mouse click(s)</li>
                                                    <li>{stats.mouseMoves} mouse movement(s)</li>
                                                    <li>{stats.wheelScrolls} scroll event(s)</li>
                                                </ul>
                                                {stats.distinctKeys.length > 0 && (
                                                    <p className="text-xs text-gray-500">
                                                        Keys involved: {stats.distinctKeys.join(", ")}
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-gray-500">
                                                Couldn't parse this fragment's contents to preview.
                                            </p>
                                        )}
                                        <p className="text-xs text-[#ff3366]">
                                            Once imported, playing this macro will actually perform
                                            these actions on your computer.
                                        </p>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleImport(row)}
                                                disabled={isImporting || !stats}
                                                className="px-3 py-1.5 rounded-lg bg-[#00d9ff] hover:bg-[#00d9ff]/80 text-[#0a0e27] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                {isImporting ? "Importing..." : "Import"}
                                            </button>
                                            <button
                                                onClick={() => setPreviewOpenId(null)}
                                                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-medium"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}