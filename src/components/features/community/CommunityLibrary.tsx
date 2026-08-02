import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isSupabaseConfigured, supabase } from "../../../community/supabaseClient";

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

const TYPE_LABELS: Record<string, string> = {
    macro: "Macro",
};

export default function CommunityLibrary() {
    const [fragments, setFragments] = useState<CommunityFragmentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
    const [importingId, setImportingId] = useState<string | null>(null);

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
            setError(err instanceof Error ? err.message : String(err));
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

            await invoke("import_macro_json", { json: fragmentJson });
            setImportedIds((prev) => new Set(prev).add(row.id));
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
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
                    Browse and import fragments shared by the community.
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

                        return (
                            <div
                                key={row.id}
                                className="bg-[#141933] rounded-xl p-4 border border-white/5 flex items-center justify-between"
                            >
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
                                <button
                                    onClick={() => handleImport(row)}
                                    disabled={isImporting || isImported}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                                        isImported
                                            ? "bg-[#00ff88]/15 text-[#00ff88] border border-[#00ff88]/30"
                                            : "bg-[#00d9ff] hover:bg-[#00d9ff]/80 text-[#0a0e27] disabled:opacity-40"
                                    }`}
                                >
                                    {isImported ? "Imported ✓" : isImporting ? "Importing..." : "Import"}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}