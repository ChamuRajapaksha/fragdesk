import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { extractErrorMessage, isSupabaseConfigured, supabase } from "../../../community/supabaseClient";
import { useAuth } from "../../../community/useAuth";
import AuthPanel from "./AuthPanel";

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
    const { user, loading: authLoading, signOut } = useAuth();
    const [fragments, setFragments] = useState<CommunityFragmentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
    const [importingId, setImportingId] = useState<string | null>(null);
    const [previewOpenId, setPreviewOpenId] = useState<string | null>(null);
    const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [showOnlyMine, setShowOnlyMine] = useState(false);
    const [addingTagToId, setAddingTagToId] = useState<string | null>(null);
    const [tagDraft, setTagDraft] = useState("");

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
        if (!supabase) return;
        setError(null);
        setImportingId(row.id);
        try {
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

            supabase
                .rpc("increment_download_count", { fragment_id: row.id })
                .then(({ error: rpcError }) => {
                    if (rpcError) {
                        console.warn("Failed to bump download count:", rpcError);
                        return;
                    }
                    setFragments((prev) =>
                        prev.map((f) =>
                            f.id === row.id ? { ...f, download_count: f.download_count + 1 } : f
                        )
                    );
                });
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setImportingId(null);
        }
    }

    function handleDeleteClick(id: string) {
        if (confirmDeleteId === id) {
            void handleDelete(id);
            return;
        }
        setConfirmDeleteId(id);
        setTimeout(() => setConfirmDeleteId((cur) => (cur === id ? null : cur)), 4000);
    }

    async function handleDelete(id: string) {
        if (!supabase) return;
        setError(null);
        setDeletingId(id);
        setConfirmDeleteId(null);
        try {
            const { error: deleteError } = await supabase.from("fragments").delete().eq("id", id);
            if (deleteError) throw deleteError;
            setFragments((prev) => prev.filter((f) => f.id !== id));
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setDeletingId(null);
        }
    }

    // Editing tags on a fragment you own hits the same table, gated by the
    // "Owners can update their own fragments" RLS policy added alongside
    // auth -- Postgres enforces auth.uid() = submitted_by on its own, this
    // is just the UI for a capability that already existed at the DB level.
    async function handleAddTag(row: CommunityFragmentRow) {
        const tag = tagDraft.trim();
        setTagDraft("");
        setAddingTagToId(null);
        if (!tag || row.tags.includes(tag) || !supabase) return;

        const newTags = [...row.tags, tag];
        setFragments((prev) =>
            prev.map((f) => (f.id === row.id ? { ...f, tags: newTags } : f))
        );
        try {
            const { error: updateError } = await supabase
                .from("fragments")
                .update({ tags: newTags })
                .eq("id", row.id);
            if (updateError) throw updateError;
        } catch (err) {
            setError(extractErrorMessage(err));
            await refreshFragments();
        }
    }

    async function handleRemoveTag(row: CommunityFragmentRow, tag: string) {
        if (!supabase) return;
        const newTags = row.tags.filter((t) => t !== tag);
        setFragments((prev) =>
            prev.map((f) => (f.id === row.id ? { ...f, tags: newTags } : f))
        );
        try {
            const { error: updateError } = await supabase
                .from("fragments")
                .update({ tags: newTags })
                .eq("id", row.id);
            if (updateError) throw updateError;
        } catch (err) {
            setError(extractErrorMessage(err));
            await refreshFragments();
        }
    }

    function toggleTagFilter(tag: string) {
        setActiveTagFilters((prev) =>
            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
        );
    }

    const allTags = Array.from(new Set(fragments.flatMap((f) => f.tags))).sort();
    const visibleFragments = fragments
        .filter((f) => (showOnlyMine ? user !== null && f.submitted_by === user.id : true))
        .filter((f) =>
            activeTagFilters.length === 0 ? true : f.tags.some((t) => activeTagFilters.includes(t))
        );

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
                        server.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-full bg-[#0a0e27] text-white p-6 space-y-6">
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-[#00d9ff]">Community Library</h1>
                    <p className="text-sm text-gray-400 mt-1">
                        Browse and import fragments shared by the community. Macros simulate real
                        keyboard/mouse input — preview what one does before importing it.
                    </p>
                </div>
                {!authLoading && user && (
                    <div className="text-right text-xs text-gray-400 shrink-0 ml-4">
                        <p>
                            Signed in as <span className="text-gray-200">{user.email}</span>
                        </p>
                        <button onClick={() => signOut()} className="text-[#ff3366] hover:underline">
                            Sign out
                        </button>
                    </div>
                )}
            </div>

            {!authLoading && !user && (
                <div className="space-y-2">
                    <p className="text-sm text-gray-400">
                        Sign in to submit or manage your own fragments. Browsing and importing
                        don't require an account.
                    </p>
                    <AuthPanel onAuthed={refreshFragments} />
                </div>
            )}

            {error && (
                <div className="bg-[#ff3366]/10 border border-[#ff3366]/40 text-[#ff3366] text-sm rounded-lg px-4 py-2">
                    {error}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
                {user && (
                    <button
                        onClick={() => setShowOnlyMine((v) => !v)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                            showOnlyMine
                                ? "bg-[#b026ff]/15 border-[#b026ff]/50 text-[#b026ff]"
                                : "bg-white/5 border-white/10 text-gray-400 hover:text-gray-200"
                        }`}
                    >
                        My submissions
                    </button>
                )}
                {!loading &&
                    allTags.map((tag) => {
                        const active = activeTagFilters.includes(tag);
                        return (
                            <button
                                key={tag}
                                onClick={() => toggleTagFilter(tag)}
                                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                                    active
                                        ? "bg-[#00d9ff]/15 border-[#00d9ff]/50 text-[#00d9ff]"
                                        : "bg-white/5 border-white/10 text-gray-400 hover:text-gray-200"
                                }`}
                            >
                                {tag}
                            </button>
                        );
                    })}
                {activeTagFilters.length > 0 && (
                    <button
                        onClick={() => setActiveTagFilters([])}
                        className="text-xs text-gray-500 hover:text-gray-300"
                    >
                        clear tag filters
                    </button>
                )}
            </div>

            {loading ? (
                <p className="text-gray-500 text-sm">Loading...</p>
            ) : fragments.length === 0 ? (
                <p className="text-gray-500 text-sm">No community fragments yet.</p>
            ) : visibleFragments.length === 0 ? (
                <p className="text-gray-500 text-sm">
                    {showOnlyMine ? "You haven't shared anything yet." : "No fragments match the selected tags."}
                </p>
            ) : (
                <div className="space-y-2">
                    {visibleFragments.map((row) => {
                        const isImported = importedIds.has(row.id);
                        const isImporting = importingId === row.id;
                        const isPreviewOpen = previewOpenId === row.id;
                        const stats = isPreviewOpen ? summarizeMacroPayload(row.payload) : null;
                        const isOwner = user !== null && row.submitted_by === user.id;
                        const isDeleting = deletingId === row.id;
                        const isConfirmingDelete = confirmDeleteId === row.id;
                        const isAddingTag = addingTagToId === row.id;

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
                                            {isOwner && (
                                                <span className="text-xs bg-white/5 text-gray-400 rounded px-1.5 py-0.5">
                                                    yours
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {row.download_count} downloads
                                        </p>

                                        <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                            {row.tags.map((tag) =>
                                                isOwner ? (
                                                    <span
                                                        key={tag}
                                                        className="inline-flex items-center gap-1 text-xs bg-white/5 text-gray-300 rounded-full px-2 py-0.5"
                                                    >
                                                        {tag}
                                                        <button
                                                            onClick={() => handleRemoveTag(row, tag)}
                                                            className="text-gray-500 hover:text-[#ff3366]"
                                                        >
                                                            ×
                                                        </button>
                                                    </span>
                                                ) : (
                                                    <span
                                                        key={tag}
                                                        className="text-xs bg-white/5 text-gray-400 rounded-full px-2 py-0.5"
                                                    >
                                                        {tag}
                                                    </span>
                                                )
                                            )}
                                            {isOwner &&
                                                (isAddingTag ? (
                                                    <input
                                                        autoFocus
                                                        type="text"
                                                        value={tagDraft}
                                                        onChange={(e) => setTagDraft(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") handleAddTag(row);
                                                            if (e.key === "Escape") {
                                                                setAddingTagToId(null);
                                                                setTagDraft("");
                                                            }
                                                        }}
                                                        onBlur={() => handleAddTag(row)}
                                                        placeholder="tag name"
                                                        className="text-xs bg-[#0a0e27] border border-white/10 rounded-full px-2 py-0.5 w-24 focus:outline-none focus:border-[#00d9ff]"
                                                    />
                                                ) : (
                                                    <button
                                                        onClick={() => setAddingTagToId(row.id)}
                                                        className="text-xs text-gray-500 hover:text-[#00d9ff]"
                                                    >
                                                        + tag
                                                    </button>
                                                ))}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0 ml-4">
                                        {isOwner && (
                                            <button
                                                onClick={() => handleDeleteClick(row.id)}
                                                disabled={isDeleting}
                                                className={`px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40 transition-colors ${
                                                    isConfirmingDelete
                                                        ? "bg-[#ff3366] text-white"
                                                        : "bg-white/5 hover:bg-white/10 text-gray-300"
                                                }`}
                                            >
                                                {isDeleting
                                                    ? "Deleting..."
                                                    : isConfirmingDelete
                                                    ? "Confirm?"
                                                    : "Delete"}
                                            </button>
                                        )}
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