import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Users } from "lucide-react";
import { extractErrorMessage, isSupabaseConfigured, supabase } from "../../../community/supabaseClient";
import { useAuth } from "../../../community/useAuth";
import AuthPanel from "./AuthPanel";
import CommunityCard from "./CommunityCard";
import FilterBar from "./FilterBar";
import { type CommunityFragmentRow } from "./communityTypes";
import { EmptyState, ErrorBanner, LoadingState, PageHeader } from "../../ui";

const PAGE_SIZE = 25;

export default function CommunityLibrary() {
    const { user, loading: authLoading, signOut } = useAuth();
    const [fragments, setFragments] = useState<CommunityFragmentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
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
    const [reportingId, setReportingId] = useState<string | null>(null);
    const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
    const [submittingReportId, setSubmittingReportId] = useState<string | null>(null);

    useEffect(() => {
        if (isSupabaseConfigured) {
            refreshFragments();
        } else {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Load which fragments this user has already reported, so the button
    // reflects that across sessions, not just within this page load.
    useEffect(() => {
        if (!supabase || !user) return;
        supabase
            .from("fragment_reports")
            .select("fragment_id")
            .eq("reporter", user.id)
            .then(({ data, error: reportsError }) => {
                if (reportsError) {
                    console.warn("Failed to load existing reports:", reportsError);
                    return;
                }
                setReportedIds(new Set((data ?? []).map((r) => r.fragment_id as string)));
            });
    }, [user]);

    async function refreshFragments() {
        if (!supabase) return;
        setLoading(true);
        setError(null);
        try {
            const { data, error: queryError } = await supabase
                .from("fragments")
                .select("*")
                .order("created_at", { ascending: false })
                .range(0, PAGE_SIZE - 1);

            if (queryError) throw queryError;
            setFragments((data as CommunityFragmentRow[]) ?? []);
            setHasMore((data?.length ?? 0) === PAGE_SIZE);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setLoading(false);
        }
    }

    async function loadMore() {
        if (!supabase || loadingMore) return;
        setLoadingMore(true);
        try {
            const { data, error: queryError } = await supabase
                .from("fragments")
                .select("*")
                .order("created_at", { ascending: false })
                .range(fragments.length, fragments.length + PAGE_SIZE - 1);

            if (queryError) throw queryError;
            setFragments((prev) => {
                const existing = new Set(prev.map((f) => f.id));
                const fresh = (data as CommunityFragmentRow[])
                    .filter((f) => !existing.has(f.id))
                    .map((f) => f);
                return [...prev, ...fresh];
            });
            setHasMore((data?.length ?? 0) === PAGE_SIZE);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setLoadingMore(false);
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

            // Each fragment type has its own importer command on the Rust
            // side, since each inserts into a different local table
            // (macros vs clipboard_history). Add a case here whenever a
            // new FragmentPayload variant gets its own import command.
            if (row.fragment_type === "macro") {
                await invoke("import_macro_json", { json: fragmentJson, source: "community" });
            } else if (row.fragment_type === "clipboard_snippet") {
                await invoke("import_clipboard_snippet_json", { json: fragmentJson });
            } else if (row.fragment_type === "monitor_alert_rule") {
                await invoke("import_alert_rule_json", { json: fragmentJson });
            } else if (row.fragment_type === "monitor_layout") {
                await invoke("import_monitor_layout_json", { json: fragmentJson });
            } else {
                throw new Error(`Don't know how to import fragment type "${row.fragment_type}"`);
            }

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

    async function handleSubmitReport(row: CommunityFragmentRow, reason: string) {
        if (!supabase || !user) return;
        setSubmittingReportId(row.id);
        setError(null);
        try {
            const { error: insertError } = await supabase.from("fragment_reports").insert({
                fragment_id: row.id,
                reporter: user.id,
                reason,
            });

            // A unique-violation (code 23505) just means they already
            // reported this one -- treat that as success rather than
            // surfacing a confusing DB error for a harmless double-click.
            if (insertError && insertError.code !== "23505") throw insertError;

            setReportedIds((prev) => new Set(prev).add(row.id));
            setReportingId(null);
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSubmittingReportId(null);
        }
    }

    function toggleTagFilter(tag: string) {
        setActiveTagFilters((prev) =>
            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
        );
    }

    const allTags = Array.from(new Set(fragments.flatMap((f) => f.tags))).sort();
    const query = searchQuery.trim().toLowerCase();
    const visibleFragments = fragments
        .filter((f) => (showOnlyMine ? user !== null && f.submitted_by === user.id : true))
        .filter((f) =>
            activeTagFilters.length === 0 ? true : f.tags.some((t) => activeTagFilters.includes(t))
        )
        .filter((f) =>
            query.length === 0
                ? true
                : f.name.toLowerCase().includes(query) ||
                  f.tags.some((t) => t.toLowerCase().includes(query)) ||
                  f.fragment_type.toLowerCase().includes(query)
        );

    if (!isSupabaseConfigured) {
        return (
            <div className="min-h-full bg-frag-bg text-frag-text p-4 md:p-6 space-y-4">
                <PageHeader
                    title="Community Library"
                    subtitle="Browse and import fragments shared by the community."
                    accent={<Users size={22} />}
                />
                <div className="bg-frag-surface rounded-xl p-5 border border-frag-border text-sm text-frag-muted">
                    <p className="font-medium text-frag-text mb-1">Not set up yet</p>
                    <p>
                        The community library needs a Supabase project connected. Add{" "}
                        <code className="text-frag-primary">VITE_SUPABASE_URL</code> and{" "}
                        <code className="text-frag-primary">VITE_SUPABASE_ANON_KEY</code> to your{" "}
                        <code className="text-frag-primary">.env</code> file, then restart the dev
                        server.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-full bg-frag-bg text-frag-text p-4 md:p-6 space-y-6">
            <PageHeader
                title="Community Library"
                subtitle="Browse and import fragments shared by the community. Macros simulate real keyboard/mouse input — preview what one does before importing it."
                accent={<Users size={22} />}
                actions={
                    <>
                        {!authLoading && user && (
                            <div className="text-right text-xs text-frag-muted shrink-0 ml-4">
                                <p>
                                    Signed in as <span className="text-frag-text">{user.email}</span>
                                </p>
                                <button onClick={() => signOut()} className="text-frag-danger hover:underline">
                                    Sign out
                                </button>
                            </div>
                        )}
                    </>
                }
            />

            {!authLoading && !user && (
                <div className="space-y-2">
                    <p className="text-sm text-frag-muted">
                        Sign in to submit or manage your own fragments. Browsing and importing
                        don't require an account.
                    </p>
                    <AuthPanel onAuthed={refreshFragments} />
                </div>
            )}

            {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

            <FilterBar
                user={user}
                showOnlyMine={showOnlyMine}
                onToggleMine={() => setShowOnlyMine((v) => !v)}
                allTags={allTags}
                activeTagFilters={activeTagFilters}
                onToggleTag={toggleTagFilter}
                onClearFilters={() => setActiveTagFilters([])}
                loading={loading}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
            />

            {loading ? (
                <LoadingState rows={5} label="Loading community fragments" />
            ) : fragments.length === 0 ? (
                <EmptyState
                    icon={Users}
                    title="No community fragments yet"
                    description="Be the first to share a macro, snippet, or monitor setup."
                />
            ) : visibleFragments.length === 0 ? (
                <EmptyState
                    title={
                        showOnlyMine
                            ? "You haven't shared anything yet"
                            : "No fragments match your search or filters"
                    }
                    description={showOnlyMine ? "" : "Try clearing the tag filters or search above."}
                />
            ) : (
                <>
                    <div className="space-y-2">
                    {visibleFragments.map((row) => {
                        const isImported = importedIds.has(row.id);
                        const isImporting = importingId === row.id;
                        const isPreviewOpen = previewOpenId === row.id;
                        const isOwner = user !== null && row.submitted_by === user.id;
                        const isDeleting = deletingId === row.id;
                        const isConfirmingDelete = confirmDeleteId === row.id;
                        const isAddingTag = addingTagToId === row.id;
                        const isReportOpen = reportingId === row.id;
                        const hasReported = reportedIds.has(row.id);
                        const isSubmittingReport = submittingReportId === row.id;

                        return (
                            <CommunityCard
                                key={row.id}
                                row={row}
                                isOwner={isOwner}
                                canReport={user !== null && !isOwner}
                                isImported={isImported}
                                isImporting={isImporting}
                                isPreviewOpen={isPreviewOpen}
                                isDeleting={isDeleting}
                                isConfirmingDelete={isConfirmingDelete}
                                isAddingTag={isAddingTag}
                                tagDraft={tagDraft}
                                isReportOpen={isReportOpen}
                                hasReported={hasReported}
                                isSubmittingReport={isSubmittingReport}
                                onTogglePreview={() =>
                                    setPreviewOpenId(isPreviewOpen ? null : row.id)
                                }
                                onDeleteClick={() => handleDeleteClick(row.id)}
                                onAddTag={() => handleAddTag(row)}
                                onRemoveTag={(tag) => handleRemoveTag(row, tag)}
                                onTagDraftChange={setTagDraft}
                                onOpenTagInput={() => setAddingTagToId(row.id)}
                                onCloseTagInput={() => {
                                    setAddingTagToId(null);
                                    setTagDraft("");
                                }}
                                onToggleReport={() =>
                                    setReportingId(isReportOpen ? null : row.id)
                                }
                                onSubmitReport={(reason) => handleSubmitReport(row, reason)}
                                onCancelReport={() => setReportingId(null)}
                                onImport={() => handleImport(row)}
                                onCancelPreview={() => setPreviewOpenId(null)}
                            />
                        );
                    })}
                    </div>
                    {hasMore && (
                        <button
                            onClick={loadMore}
                            disabled={loadingMore}
                            className="w-full mt-2 py-2 rounded-lg bg-frag-surface border border-frag-border text-sm text-frag-muted hover:text-frag-text disabled:opacity-40 transition-colors"
                        >
                            {loadingMore ? "Loading..." : "Load more"}
                        </button>
                    )}
                </>
            )}
        </div>
    );
}