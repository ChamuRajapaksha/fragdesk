import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Upload, Zap } from "lucide-react";
import { extractErrorMessage, isSupabaseConfigured, supabase } from "../../../community/supabaseClient";
import { useAuth } from "../../../community/useAuth";
import MacroCard from "./MacroCard";
import {
    formatDuration,
    type MacroSummary,
    type PlaybackProgress,
    type RecordingPreview,
} from "./macroTypes";
import type { NavId } from "../../../features/registry";
import {
    Button,
    EmptyState,
    ErrorBanner,
    LoadingState,
    PageHeader,
    useToast,
} from "../../ui";

export default function MacroManager({ setActiveTab }: { setActiveTab: (tab: NavId) => void }) {
    const { toast } = useToast();
    const [macros, setMacros] = useState<MacroSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [liveCount, setLiveCount] = useState(0);
    const [pendingPreview, setPendingPreview] = useState<RecordingPreview | null>(null);
    const [macroName, setMacroName] = useState("");
    const [error, setError] = useState<string | null>(null);

    const [playingId, setPlayingId] = useState<string | null>(null);
    const [progress, setProgress] = useState<PlaybackProgress | null>(null);
    const [speed, setSpeed] = useState(1);
    const [repeat, setRepeat] = useState(1);

    // Rename state: which macro id is being edited, and its draft text.
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameDraft, setRenameDraft] = useState("");

    // Delete confirmation: which macro id is armed for a second click.
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    // Community sharing: mirrors the delete-confirm pattern, since sharing
    // is currently a one-way action (no update/delete policy exists yet
    // on the fragments table, so there's no "unshare" from the app).
    const [confirmShareId, setConfirmShareId] = useState<string | null>(null);
    const [sharingId, setSharingId] = useState<string | null>(null);
    const [sharedIds, setSharedIds] = useState<Set<string>>(new Set());
    const shareConfirmResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Hotkey capture: which macro id is currently listening for a key combo.
    const [capturingHotkeyId, setCapturingHotkeyId] = useState<string | null>(null);

    // The fixed record-toggle hotkey (default "F9"), fetched from the
    // backend so the displayed tip stays in sync if it's ever changed there.
    const [recordHotkey, setRecordHotkey] = useState<string>("F9");
    const [isCapturingRecordHotkey, setIsCapturingRecordHotkey] = useState(false);

    // macOS Accessibility permission — null while unchecked, so the banner
    // doesn't flash on platforms where it's always true.
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);

    // Tag filtering: selected tags act as an OR filter over the list.
    const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
    // Which macro id currently has its "add a tag" input open.
    const [addingTagToId, setAddingTagToId] = useState<string | null>(null);
    const [tagDraft, setTagDraft] = useState("");

    const nameInputRef = useRef<HTMLInputElement>(null);
    const confirmResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const importFileInputRef = useRef<HTMLInputElement>(null);

    // Ref mirrors so confirm/rename handlers keep stable identities while
    // still observing the latest armed-confirmation / rename-in-progress value.
    const confirmDeleteIdRef = useRef<string | null>(null);
    const confirmShareIdRef = useRef<string | null>(null);
    const renamingIdRef = useRef<string | null>(null);

    useEffect(() => {
        confirmDeleteIdRef.current = confirmDeleteId;
    }, [confirmDeleteId]);

    useEffect(() => {
        confirmShareIdRef.current = confirmShareId;
    }, [confirmShareId]);

    useEffect(() => {
        renamingIdRef.current = renamingId;
    }, [renamingId]);

    const { user } = useAuth();

    useEffect(() => {
        refreshMacros();
        invoke<string>("get_record_hotkey").then(setRecordHotkey).catch(() => {});
        invoke<boolean>("check_recording_permission").then(setHasPermission).catch(() => {});

        const unlistenRecording = listen<{ event_count: number }>(
            "macro-recording-progress",
            (e) => setLiveCount(e.payload.event_count)
        );

        const unlistenHotkeyStarted = listen("macro-recording-hotkey-started", () => {
            setIsRecording(true);
            setLiveCount(0);
        });

        const unlistenHotkeyStopped = listen<RecordingPreview>(
            "macro-recording-hotkey-stopped",
            (e) => {
                setIsRecording(false);
                if (e.payload.event_count === 0) {
                    setError(
                        "No input was captured — try again and press some keys or move the mouse"
                    );
                    return;
                }
                setPendingPreview(e.payload);
                setMacroName("");
            }
        );

        const unlistenPlaybackProgress = listen<PlaybackProgress>(
            "macro-playback-progress",
            (e) => setProgress(e.payload)
        );

        const unlistenPlaybackFinished = listen("macro-playback-finished", () => {
            setPlayingId(null);
            setProgress(null);
        });

        return () => {
            unlistenRecording.then((f) => f());
            unlistenHotkeyStarted.then((f) => f());
            unlistenHotkeyStopped.then((f) => f());
            unlistenPlaybackProgress.then((f) => f());
            unlistenPlaybackFinished.then((f) => f());
            if (confirmResetTimer.current) clearTimeout(confirmResetTimer.current);
            if (shareConfirmResetTimer.current) clearTimeout(shareConfirmResetTimer.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (pendingPreview) {
            // Focus the name field once naming is safe to do (recording has
            // already been fully stopped server-side at this point).
            setTimeout(() => nameInputRef.current?.focus(), 50);
        }
    }, [pendingPreview]);

    useEffect(() => {
        if (!capturingHotkeyId) return;
        const targetId = capturingHotkeyId; // narrowed to `string`, safe to close over

        function onKeyDown(e: KeyboardEvent) {
            e.preventDefault();
            e.stopPropagation();

            if (e.key === "Escape") {
                setCapturingHotkeyId(null);
                return;
            }
            if (["Control", "Meta", "Alt", "Shift"].includes(e.key)) return;

            const mods: string[] = [];
            if (e.ctrlKey || e.metaKey) mods.push("CommandOrControl");
            if (e.altKey) mods.push("Alt");
            if (e.shiftKey) mods.push("Shift");
            const combo = [...mods, e.code].join("+");

            void handleSetHotkey(targetId, combo);
        }

        document.addEventListener("keydown", onKeyDown, true);
        return () => document.removeEventListener("keydown", onKeyDown, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [capturingHotkeyId]);

    useEffect(() => {
        if (!isCapturingRecordHotkey) return;

        function onKeyDown(e: KeyboardEvent) {
            e.preventDefault();
            e.stopPropagation();

            if (e.key === "Escape") {
                setIsCapturingRecordHotkey(false);
                return;
            }
            if (["Control", "Meta", "Alt", "Shift"].includes(e.key)) return;

            const mods: string[] = [];
            if (e.ctrlKey || e.metaKey) mods.push("CommandOrControl");
            if (e.altKey) mods.push("Alt");
            if (e.shiftKey) mods.push("Shift");
            const combo = [...mods, e.code].join("+");

            invoke("set_record_hotkey", { hotkey: combo })
                .then(() => {
                    setRecordHotkey(combo);
                    toast("Recording hotkey updated.", "success");
                })
                .catch((err) => setError(String(err)))
                .finally(() => setIsCapturingRecordHotkey(false));
        }

        document.addEventListener("keydown", onKeyDown, true);
        return () => document.removeEventListener("keydown", onKeyDown, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCapturingRecordHotkey]);

    const refreshMacros = useCallback(async () => {
        try {
            const result = await invoke<MacroSummary[]>("get_macros");
            setMacros(result);
        } catch (err) {
            setError(String(err));
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleStartRecording = useCallback(async () => {
        setError(null);
        try {
            await invoke("start_macro_recording");
            setIsRecording(true);
            setLiveCount(0);
        } catch (err) {
            setError(String(err));
        }
    }, []);

    const handleStopRecording = useCallback(async () => {
        try {
            const preview = await invoke<RecordingPreview>("stop_macro_recording");
            setIsRecording(false);
            if (preview.event_count === 0) {
                setError("No input was captured — try again and press some keys or move the mouse");
                return;
            }
            setPendingPreview(preview);
            setMacroName("");
        } catch (err) {
            setError(String(err));
        }
    }, []);

    const handleSaveMacro = useCallback(async () => {
        const name = macroName.trim();
        if (!name) return;
        try {
            await invoke("save_macro_recording", { name });
            setPendingPreview(null);
            setMacroName("");
            await refreshMacros();
            toast("Macro saved.", "success");
        } catch (err) {
            setError(String(err));
        }
    }, [macroName, refreshMacros, toast]);

    const handleDiscardRecording = useCallback(async () => {
        try {
            await invoke("discard_macro_recording");
        } finally {
            setPendingPreview(null);
            setMacroName("");
        }
    }, []);

    const handlePlay = useCallback(async (id: string) => {
        setError(null);
        try {
            setPlayingId(id);
            await invoke("play_macro", { id, speed, repeat });
        } catch (err) {
            setPlayingId(null);
            setError(String(err));
        }
    }, [speed, repeat]);

    const handleStopPlayback = useCallback(async () => {
        try {
            await invoke("stop_macro_playback");
        } catch (err) {
            setError(String(err));
        }
    }, []);

    const startRename = useCallback((m: MacroSummary) => {
        setRenamingId(m.id);
        setRenameDraft(m.name);
    }, []);

    const commitRename = useCallback(async () => {
        const id = renamingIdRef.current;
        const name = renameDraft.trim();
        setRenamingId(null);
        if (!id || !name) return;

        // Optimistic update so the list feels instant; refresh reconciles
        // with the DB afterward in case the call fails.
        setMacros((prev) => prev.map((m) => (m.id === id ? { ...m, name } : m)));
        try {
            await invoke("rename_macro", { id, name });
        } catch (err) {
            setError(String(err));
            await refreshMacros();
        }
    }, [renameDraft, refreshMacros]);

    const cancelRename = useCallback(() => {
        setRenamingId(null);
        setRenameDraft("");
    }, []);

    const handleDelete = useCallback(async (id: string) => {
        try {
            await invoke("delete_macro", { id });
            await refreshMacros();
            toast("Macro deleted.", "success");
        } catch (err) {
            setError(String(err));
        }
    }, [refreshMacros, toast]);

    const handleDeleteClick = useCallback(
        (id: string) => {
            if (confirmDeleteIdRef.current === id) {
                // Second click within the window — actually delete.
                if (confirmResetTimer.current) clearTimeout(confirmResetTimer.current);
                setConfirmDeleteId(null);
                void handleDelete(id);
                return;
            }

            // First click — arm confirmation, auto-reset after a few seconds
            // so a stray later click elsewhere doesn't leave it primed forever.
            setConfirmDeleteId(id);
            if (confirmResetTimer.current) clearTimeout(confirmResetTimer.current);
            confirmResetTimer.current = setTimeout(() => setConfirmDeleteId(null), 3000);
        },
        [handleDelete]
    );

    const handleShare = useCallback(
        async (id: string) => {
            if (!supabase) return;
            if (!user) {
                setError("Sign in from the Community Library tab first to share macros.");
                return;
            }
            setError(null);
            setSharingId(id);
            try {
                const json = await invoke<string>("export_macro_json", { id });
                const fragment = JSON.parse(json) as {
                    fragment_type: string;
                    name: string;
                    tags: string[];
                    format_version: number;
                    payload: unknown;
                };

                const { error: insertError } = await supabase.from("fragments").insert({
                    fragment_type: fragment.fragment_type,
                    name: fragment.name,
                    tags: fragment.tags,
                    format_version: fragment.format_version,
                    payload: fragment.payload,
                    submitted_by: user.id,
                });

                if (insertError) throw insertError;
                setSharedIds((prev) => new Set(prev).add(id));
                toast("Macro shared to the community library.", "success");
            } catch (err) {
                setError(extractErrorMessage(err));
            } finally {
                setSharingId(null);
            }
        },
        [user, toast]
    );

    const handleShareClick = useCallback(
        (id: string) => {
            if (!isSupabaseConfigured) {
                setError(
                    "Community sharing isn't set up yet — add Supabase credentials to .env first."
                );
                return;
            }

            if (!user) {
                // Jump straight to Community's sign-in panel instead of showing a
                // passive error the person has to interpret and act on themselves.
                setActiveTab("community");
                return;
            }

            if (confirmShareIdRef.current === id) {
                if (shareConfirmResetTimer.current) clearTimeout(shareConfirmResetTimer.current);
                setConfirmShareId(null);
                void handleShare(id);
                return;
            }

            setConfirmShareId(id);
            if (shareConfirmResetTimer.current) clearTimeout(shareConfirmResetTimer.current);
            shareConfirmResetTimer.current = setTimeout(() => setConfirmShareId(null), 4000);
        },
        [user, setActiveTab, handleShare]
    );

    const handleExport = useCallback(
        async (m: MacroSummary) => {
            try {
                const json = await invoke<string>("export_macro_json", { id: m.id });
                const blob = new Blob([json], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${m.name.replace(/[^a-z0-9-_ ]/gi, "_")}.fragdesk-macro.json`;
                a.click();
                URL.revokeObjectURL(url);
                toast(`Exported "${m.name}".`, "success");
            } catch (err) {
                setError(String(err));
            }
        },
        [toast]
    );

    const handleImportClick = useCallback(() => {
        importFileInputRef.current?.click();
    }, []);

    const handleImportFileChange = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // allow re-selecting the same file later
            if (!file) return;

            try {
                const text = await file.text();
                await invoke("import_macro_json", { json: text, source: null });
                await refreshMacros();
                toast(`Imported "${file.name}".`, "success");
            } catch (err) {
                setError(String(err));
            }
        },
        [refreshMacros, toast]
    );

    const handleSetHotkey = useCallback(
        async (id: string, hotkey: string) => {
            try {
                await invoke("set_macro_hotkey", { id, hotkey });
                setCapturingHotkeyId(null);
                await refreshMacros();
            } catch (err) {
                setCapturingHotkeyId(null);
                setError(String(err));
            }
        },
        [refreshMacros]
    );

    const handleClearHotkey = useCallback(
        async (id: string) => {
            try {
                await invoke("set_macro_hotkey", { id, hotkey: null });
                await refreshMacros();
            } catch (err) {
                setError(String(err));
            }
        },
        [refreshMacros]
    );

    const handleAddTag = useCallback(
        async (m: MacroSummary) => {
            const tag = tagDraft.trim();
            setTagDraft("");
            setAddingTagToId(null);
            if (!tag || m.tags.includes(tag)) return;

            const newTags = [...m.tags, tag];
            setMacros((prev) => prev.map((x) => (x.id === m.id ? { ...x, tags: newTags } : x)));
            try {
                await invoke("set_macro_tags", { id: m.id, tags: newTags });
            } catch (err) {
                setError(String(err));
                await refreshMacros();
            }
        },
        [tagDraft, refreshMacros]
    );

    const handleRemoveTag = useCallback(
        async (m: MacroSummary, tag: string) => {
            const newTags = m.tags.filter((t) => t !== tag);
            setMacros((prev) => prev.map((x) => (x.id === m.id ? { ...x, tags: newTags } : x)));
            try {
                await invoke("set_macro_tags", { id: m.id, tags: newTags });
            } catch (err) {
                setError(String(err));
                await refreshMacros();
            }
        },
        [refreshMacros]
    );

    const toggleTagFilter = useCallback((tag: string) => {
        setActiveTagFilters((prev) =>
            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
        );
    }, []);

    const closeTagInput = useCallback(() => {
        setAddingTagToId(null);
        setTagDraft("");
    }, []);

    const allTags = Array.from(new Set(macros.flatMap((m) => m.tags))).sort();
    const visibleMacros =
        activeTagFilters.length === 0
            ? macros
            : macros.filter((m) => m.tags.some((t) => activeTagFilters.includes(t)));

    return (
        <div className="min-h-full bg-frag-bg text-frag-text p-4 md:p-6 space-y-6">
            <PageHeader
                title="Macro Manager"
                subtitle="Record keyboard and mouse input, then replay it anytime."
                accent={<Zap size={22} />}
                actions={
                    <>
                        <input
                            ref={importFileInputRef}
                            type="file"
                            accept=".json"
                            onChange={handleImportFileChange}
                            className="hidden"
                        />
                        <Button variant="secondary" onClick={handleImportClick}>
                            <Upload size={16} />
                            Import macro
                        </Button>
                    </>
                }
            />

            {hasPermission === false && (
                <div className="bg-frag-danger/10 border border-frag-danger/40 text-sm rounded-lg px-4 py-3 space-y-1">
                    <p className="font-medium text-frag-danger">Accessibility permission needed</p>
                    <p className="text-frag-text">
                        FragDesk can't record keyboard or mouse input until it's granted
                        Accessibility access. Open{" "}
                        <span className="font-mono text-frag-text">
                            System Settings → Privacy &amp; Security → Accessibility
                        </span>
                        , enable FragDesk, then restart the app.
                    </p>
                </div>
            )}

            {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

            {/* Recording control */}
            <div className="bg-frag-surface rounded-xl p-4 md:p-5 border border-frag-border">
                <p className="text-xs text-frag-muted mb-3">
                    Tip: press{" "}
                    {isCapturingRecordHotkey ? (
                        <span className="font-mono text-frag-accent animate-pulse">
                            Press a key combo... (Esc to cancel)
                        </span>
                    ) : (
                        <button
                            onClick={() => setIsCapturingRecordHotkey(true)}
                            className="font-mono text-frag-primary hover:underline"
                            title="Click to change"
                        >
                            {recordHotkey}
                        </button>
                    )}{" "}
                    anywhere to start/stop instead of clicking below — clicking the button while
                    recording gets captured as part of the macro itself.
                </p>
                {!pendingPreview ? (
                    <div className="flex flex-wrap items-center justify-between gap-y-3">
                        <div>
                            <div className="flex items-center gap-2">
                                {isRecording && (
                                    <span className="h-2.5 w-2.5 rounded-full bg-frag-danger animate-pulse" />
                                )}
                                <span className="font-medium">
                                    {isRecording ? "Recording..." : "Ready to record"}
                                </span>
                            </div>
                            {isRecording && (
                                <p className="text-sm text-frag-muted mt-1">
                                    {liveCount} event{liveCount === 1 ? "" : "s"} captured
                                </p>
                            )}
                        </div>
                        <button
                            onClick={isRecording ? handleStopRecording : handleStartRecording}
                            className={`px-5 py-2.5 rounded-lg font-medium transition-colors ${
                                isRecording
                                    ? "bg-frag-danger hover:bg-frag-danger/80 text-frag-bg"
                                    : "bg-frag-primary hover:bg-frag-primary/80 text-frag-bg"
                            }`}
                        >
                            {isRecording ? "Stop Recording" : "Start Recording"}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div>
                            <p className="font-medium">Recording stopped</p>
                            <p className="text-sm text-frag-muted">
                                {pendingPreview.event_count} events, {formatDuration(pendingPreview.duration_ms)}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <input
                                ref={nameInputRef}
                                type="text"
                                value={macroName}
                                onChange={(e) => setMacroName(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleSaveMacro()}
                                placeholder="Name this macro..."
                                className="flex-1 min-w-0 bg-frag-bg border border-frag-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-frag-primary"
                            />
                            <button
                                onClick={handleSaveMacro}
                                disabled={!macroName.trim()}
                                className="px-4 py-2 rounded-lg bg-frag-success text-frag-bg font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Save
                            </button>
                            <button
                                onClick={handleDiscardRecording}
                                className="px-4 py-2 rounded-lg bg-frag-border/40 hover:bg-frag-border/70 text-frag-text font-medium text-sm"
                            >
                                Discard
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Playback options */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
                <label className="flex items-center gap-2 text-frag-muted">
                    Speed
                    <select
                        value={speed}
                        onChange={(e) => setSpeed(Number(e.target.value))}
                        className="bg-frag-surface border border-frag-border rounded px-2 py-1 text-frag-text"
                    >
                        <option value={0.5}>0.5x</option>
                        <option value={1}>1x</option>
                        <option value={2}>2x</option>
                        <option value={4}>4x</option>
                    </select>
                </label>
                <label className="flex items-center gap-2 text-frag-muted">
                    Repeat
                    <select
                        value={repeat}
                        onChange={(e) => setRepeat(Number(e.target.value))}
                        className="bg-frag-surface border border-frag-border rounded px-2 py-1 text-frag-text"
                    >
                        <option value={1}>1x</option>
                        <option value={3}>3x</option>
                        <option value={5}>5x</option>
                        <option value={10}>10x</option>
                    </select>
                </label>
            </div>

            {/* Macro list */}
            <div className="space-y-2">
                <h2 className="text-sm font-medium text-frag-muted">Your macros</h2>
                {allTags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pb-1">
                        {allTags.map((tag) => {
                            const active = activeTagFilters.includes(tag);
                            return (
                                <button
                                    key={tag}
                                    onClick={() => toggleTagFilter(tag)}
                                    aria-pressed={active}
                                    className={`max-w-xs truncate text-xs px-2 py-1 rounded-full border transition-colors ${
                                        active
                                            ? "bg-frag-primary/15 border-frag-primary/50 text-frag-primary"
                                            : "bg-frag-border/40 border-frag-border text-frag-muted hover:text-frag-text"
                                    }`}
                                >
                                    {tag}
                                </button>
                            );
                        })}
                        {activeTagFilters.length > 0 && (
                            <button
                                onClick={() => setActiveTagFilters([])}
                                className="text-xs text-frag-muted hover:text-frag-text ml-1"
                            >
                                clear filters
                            </button>
                        )}
                    </div>
                )}

                {isLoading ? (
                    <LoadingState rows={3} label="Loading macros" />
                ) : macros.length === 0 ? (
                    <EmptyState
                        icon={Zap}
                        title="No macros yet"
                        description="Record one above, or import a saved macro file."
                    />
                ) : visibleMacros.length === 0 ? (
                    <EmptyState
                        title="No macros match the selected tags"
                        description="Try clearing the tag filters above."
                    />
                ) : (
                    <div className="space-y-2">
                        {visibleMacros.map((m) => (
                            <MacroCard
                                key={m.id}
                                macro={m}
                                isPlaying={playingId === m.id}
                                progress={playingId === m.id ? progress : null}
                                isRenaming={renamingId === m.id}
                                renameDraft={renameDraft}
                                isConfirmingDelete={confirmDeleteId === m.id}
                                isCapturingHotkey={capturingHotkeyId === m.id}
                                isConfirmingShare={confirmShareId === m.id}
                                isSharing={sharingId === m.id}
                                isShared={sharedIds.has(m.id)}
                                isAddingTag={addingTagToId === m.id}
                                tagDraft={tagDraft}
                                hasActivePlayback={playingId !== null}
                                onStartRename={startRename}
                                onRenameChange={setRenameDraft}
                                onCommitRename={commitRename}
                                onCancelRename={cancelRename}
                                onClearHotkey={handleClearHotkey}
                                onCaptureHotkey={setCapturingHotkeyId}
                                onAddTag={handleAddTag}
                                onRemoveTag={handleRemoveTag}
                                onTagDraftChange={setTagDraft}
                                onOpenTagInput={setAddingTagToId}
                                onCloseTagInput={closeTagInput}
                                onPlay={handlePlay}
                                onStopPlayback={handleStopPlayback}
                                onExport={handleExport}
                                onShareClick={handleShareClick}
                                onDeleteClick={handleDeleteClick}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}