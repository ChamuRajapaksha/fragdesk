import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { extractErrorMessage, isSupabaseConfigured, supabase } from "../../../community/supabaseClient";
import { useAuth } from "../../../community/useAuth";



interface MacroSummary {
    id: string;
    name: string;
    created_at: number; // unix seconds
    event_count: number;
    duration_ms: number;
    hotkey: string | null;
    tags: string[];
    source: string | null; // null = recorded/imported locally, "community", "starter"
}

interface RecordingPreview {
    event_count: number;
    duration_ms: number;
}

interface PlaybackProgress {
    macro_id: string;
    current_index: number;
    total: number;
    repeat_index: number;
    repeat_total: number;
}

interface PlaybackFinished {
    macro_id: string;
    cancelled: boolean;
}

function formatDuration(ms: number): string {
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
}

function formatDate(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toLocaleString();
}

export default function MacroManager({ setActiveTab }: { setActiveTab: (tab: string) => void }) {
    const [macros, setMacros] = useState<MacroSummary[]>([]);
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
    const renameInputRef = useRef<HTMLInputElement>(null);
    const confirmResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const importFileInputRef = useRef<HTMLInputElement>(null);

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

        const unlistenPlaybackFinished = listen<PlaybackFinished>(
            "macro-playback-finished",
            () => {
                setPlayingId(null);
                setProgress(null);
            }
        );

        return () => {
            unlistenRecording.then((f) => f());
            unlistenHotkeyStarted.then((f) => f());
            unlistenHotkeyStopped.then((f) => f());
            unlistenPlaybackProgress.then((f) => f());
            unlistenPlaybackFinished.then((f) => f());
            if (confirmResetTimer.current) clearTimeout(confirmResetTimer.current);
            if (shareConfirmResetTimer.current) clearTimeout(shareConfirmResetTimer.current);
        };
    }, []);

    useEffect(() => {
        if (pendingPreview) {
            // Focus the name field once naming is safe to do (recording has
            // already been fully stopped server-side at this point).
            setTimeout(() => nameInputRef.current?.focus(), 50);
        }
    }, [pendingPreview]);

    useEffect(() => {
        if (renamingId) {
            setTimeout(() => renameInputRef.current?.focus(), 50);
        }
    }, [renamingId]);

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

            void handleSetHotkey(targetId, combo);   // <-- use targetId instead
        }

        document.addEventListener("keydown", onKeyDown, true);
        return () => document.removeEventListener("keydown", onKeyDown, true);
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
                .then(() => setRecordHotkey(combo))
                .catch((err) => setError(String(err)))
                .finally(() => setIsCapturingRecordHotkey(false));
        }

        document.addEventListener("keydown", onKeyDown, true);
        return () => document.removeEventListener("keydown", onKeyDown, true);
    }, [isCapturingRecordHotkey]);

    async function refreshMacros() {
        try {
            const result = await invoke<MacroSummary[]>("get_macros");
            setMacros(result);
        } catch (err) {
            setError(String(err));
        }
    }

    async function handleStartRecording() {
        setError(null);
        try {
            await invoke("start_macro_recording");
            setIsRecording(true);
            setLiveCount(0);
        } catch (err) {
            setError(String(err));
        }
    }

    async function handleStopRecording() {
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
    }

    async function handleSaveMacro() {
        const name = macroName.trim();
        if (!name) return;
        try {
            await invoke("save_macro_recording", { name });
            setPendingPreview(null);
            setMacroName("");
            await refreshMacros();
        } catch (err) {
            setError(String(err));
        }
    }

    async function handleDiscardRecording() {
        try {
            await invoke("discard_macro_recording");
        } finally {
            setPendingPreview(null);
            setMacroName("");
        }
    }

    async function handlePlay(id: string) {
        setError(null);
        try {
            setPlayingId(id);
            await invoke("play_macro", { id, speed, repeat });
        } catch (err) {
            setPlayingId(null);
            setError(String(err));
        }
    }

    async function handleStopPlayback() {
        try {
            await invoke("stop_macro_playback");
        } catch (err) {
            setError(String(err));
        }
    }

    function startRename(m: MacroSummary) {
        setRenamingId(m.id);
        setRenameDraft(m.name);
    }

    async function commitRename() {
        const id = renamingId;
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
    }

    function cancelRename() {
        setRenamingId(null);
        setRenameDraft("");
    }

    function handleDeleteClick(id: string) {
        if (confirmDeleteId === id) {
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
    }

    async function handleDelete(id: string) {
        try {
            await invoke("delete_macro", { id });
            await refreshMacros();
        } catch (err) {
            setError(String(err));
        }
    }

    function handleShareClick(id: string) {
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

        if (confirmShareId === id) {
            if (shareConfirmResetTimer.current) clearTimeout(shareConfirmResetTimer.current);
            setConfirmShareId(null);
            void handleShare(id);
            return;
        }

        setConfirmShareId(id);
        if (shareConfirmResetTimer.current) clearTimeout(shareConfirmResetTimer.current);
        shareConfirmResetTimer.current = setTimeout(() => setConfirmShareId(null), 4000);
    }

    async function handleShare(id: string) {
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
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setSharingId(null);
        }
    }

    async function handleExport(m: MacroSummary) {
        try {
            const json = await invoke<string>("export_macro_json", { id: m.id });
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${m.name.replace(/[^a-z0-9-_ ]/gi, "_")}.fragdesk-macro.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            setError(String(err));
        }
    }

    function handleImportClick() {
        importFileInputRef.current?.click();
    }

    async function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = ""; // allow re-selecting the same file later
        if (!file) return;

        try {
            const text = await file.text();
            await invoke("import_macro_json", { json: text, source: null });
            await refreshMacros();
        } catch (err) {
            setError(String(err));
        }
    }

    async function handleSetHotkey(id: string, hotkey: string) {
        try {
            await invoke("set_macro_hotkey", { id, hotkey });
            setCapturingHotkeyId(null);
            await refreshMacros();
        } catch (err) {
            setCapturingHotkeyId(null);
            setError(String(err));
        }
    }

    async function handleClearHotkey(id: string) {
        try {
            await invoke("set_macro_hotkey", { id, hotkey: null });
            await refreshMacros();
        } catch (err) {
            setError(String(err));
        }
    }

    async function handleAddTag(m: MacroSummary) {
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
    }

    async function handleRemoveTag(m: MacroSummary, tag: string) {
        const newTags = m.tags.filter((t) => t !== tag);
        setMacros((prev) => prev.map((x) => (x.id === m.id ? { ...x, tags: newTags } : x)));
        try {
            await invoke("set_macro_tags", { id: m.id, tags: newTags });
        } catch (err) {
            setError(String(err));
            await refreshMacros();
        }
    }

    function toggleTagFilter(tag: string) {
        setActiveTagFilters((prev) =>
            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
        );
    }

    const allTags = Array.from(new Set(macros.flatMap((m) => m.tags))).sort();
    const visibleMacros =
        activeTagFilters.length === 0
            ? macros
            : macros.filter((m) => m.tags.some((t) => activeTagFilters.includes(t)));

    return (
        <div className="min-h-full bg-[#0a0e27] text-white p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-[#00d9ff]">Macro Manager</h1>
                <p className="text-sm text-gray-400 mt-1">
                    Record keyboard and mouse input, then replay it anytime.
                </p>
            </div>

            {hasPermission === false && (
                <div className="bg-[#ff3366]/10 border border-[#ff3366]/40 text-sm rounded-lg px-4 py-3 space-y-1">
                    <p className="font-medium text-[#ff3366]">Accessibility permission needed</p>
                    <p className="text-gray-300">
                        FragDesk can't record keyboard or mouse input until it's granted
                        Accessibility access. Open{" "}
                        <span className="font-mono text-gray-200">
                            System Settings → Privacy &amp; Security → Accessibility
                        </span>
                        , enable FragDesk, then restart the app.
                    </p>
                </div>
            )}

            {error && (
                <div className="break-words bg-[#ff3366]/10 border border-[#ff3366]/40 text-[#ff3366] text-sm rounded-lg px-4 py-2">
                    {error}
                </div>
            )}

            {/* Recording control */}
            <div className="bg-[#141933] rounded-xl p-5 border border-white/5">
                <p className="text-xs text-gray-500 mb-3">
                    Tip: press{" "}
                    {isCapturingRecordHotkey ? (
                        <span className="font-mono text-[#b026ff] animate-pulse">
                            Press a key combo... (Esc to cancel)
                        </span>
                    ) : (
                        <button
                            onClick={() => setIsCapturingRecordHotkey(true)}
                            className="font-mono text-[#00d9ff] hover:underline"
                            title="Click to change"
                        >
                            {recordHotkey}
                        </button>
                    )}{" "}
                    anywhere to start/stop instead of clicking below — clicking the button while
                    recording gets captured as part of the macro itself.
                </p>
                {!pendingPreview ? (
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                {isRecording && (
                                    <span className="h-2.5 w-2.5 rounded-full bg-[#ff3366] animate-pulse" />
                                )}
                                <span className="font-medium">
                                    {isRecording ? "Recording..." : "Ready to record"}
                                </span>
                            </div>
                            {isRecording && (
                                <p className="text-sm text-gray-400 mt-1">
                                    {liveCount} event{liveCount === 1 ? "" : "s"} captured
                                </p>
                            )}
                        </div>
                        <button
                            onClick={isRecording ? handleStopRecording : handleStartRecording}
                            className={`px-5 py-2.5 rounded-lg font-medium transition-colors ${
                                isRecording
                                    ? "bg-[#ff3366] hover:bg-[#ff3366]/80 text-white"
                                    : "bg-[#00d9ff] hover:bg-[#00d9ff]/80 text-[#0a0e27]"
                            }`}
                        >
                            {isRecording ? "Stop Recording" : "Start Recording"}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div>
                            <p className="font-medium">Recording stopped</p>
                            <p className="text-sm text-gray-400">
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
                                className="flex-1 min-w-0 bg-[#0a0e27] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00d9ff]"
                            />
                            <button
                                onClick={handleSaveMacro}
                                disabled={!macroName.trim()}
                                className="px-4 py-2 rounded-lg bg-[#00ff88] text-[#0a0e27] font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Save
                            </button>
                            <button
                                onClick={handleDiscardRecording}
                                className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 font-medium text-sm"
                            >
                                Discard
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Playback options */}
            <div className="flex items-center gap-6 text-sm">
                <label className="flex items-center gap-2 text-gray-400">
                    Speed
                    <select
                        value={speed}
                        onChange={(e) => setSpeed(Number(e.target.value))}
                        className="bg-[#141933] border border-white/10 rounded px-2 py-1 text-white"
                    >
                        <option value={0.5}>0.5x</option>
                        <option value={1}>1x</option>
                        <option value={2}>2x</option>
                        <option value={4}>4x</option>
                    </select>
                </label>
                <label className="flex items-center gap-2 text-gray-400">
                    Repeat
                    <select
                        value={repeat}
                        onChange={(e) => setRepeat(Number(e.target.value))}
                        className="bg-[#141933] border border-white/10 rounded px-2 py-1 text-white"
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
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-medium text-gray-400">Your macros</h2>
                    <div>
                        <input
                            ref={importFileInputRef}
                            type="file"
                            accept=".json"
                            onChange={handleImportFileChange}
                            className="hidden"
                        />
                        <button
                            onClick={handleImportClick}
                            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 font-medium"
                        >
                            Import macro
                        </button>
                    </div>
                </div>
                {allTags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pb-1">
                        {allTags.map((tag) => {
                            const active = activeTagFilters.includes(tag);
                            return (
                                <button
                                    key={tag}
                                    onClick={() => toggleTagFilter(tag)}
                                        className={`max-w-xs truncate text-xs px-2 py-1 rounded-full border transition-colors ${
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
                                className="text-xs text-gray-500 hover:text-gray-300 ml-1"
                            >
                                clear filters
                            </button>
                        )}
                    </div>
                )}
                {macros.length === 0 ? (
                    <p className="text-gray-500 text-sm">No macros yet — record one above.</p>
                ) : visibleMacros.length === 0 ? (
                    <p className="text-gray-500 text-sm">No macros match the selected tags.</p>
                ) : (
                    visibleMacros.map((m) => {
                        const isThisPlaying = playingId === m.id;
                        const isRenamingThis = renamingId === m.id;
                        const isConfirmingDelete = confirmDeleteId === m.id;

                        return (
                            <div
                                key={m.id}
                                className="bg-[#141933] rounded-xl p-4 border border-white/5 flex items-center justify-between"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        {isRenamingThis ? (
                                            <input
                                                ref={renameInputRef}
                                                type="text"
                                                value={renameDraft}
                                                onChange={(e) => setRenameDraft(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") commitRename();
                                                    if (e.key === "Escape") cancelRename();
                                                }}
                                                onBlur={commitRename}
                                                className="min-w-0 w-full max-w-xs bg-[#0a0e27] border border-[#00d9ff] rounded px-2 py-1 text-sm focus:outline-none"
                                            />
                                        ) : (
                                            <button
                                                onClick={() => startRename(m)}
                                                title="Click to rename"
                                                className="min-w-0 truncate font-medium text-left hover:text-[#00d9ff] transition-colors"
                                            >
                                                {m.name}
                                            </button>
                                        )}
                                        {m.source === "community" && (
                                            <span
                                                title="Imported from the Community Library — reviewed this before importing? Playing it simulates real input on your machine."
                                                className="shrink-0 text-xs bg-[#ff3366]/10 text-[#ff3366] border border-[#ff3366]/30 rounded px-1.5 py-0.5"
                                            >
                                                community
                                            </span>
                                        )}
                                        {m.source === "starter" && (
                                            <span
                                                title="Imported from FragDesk's bundled starter pack"
                                                className="shrink-0 text-xs bg-white/5 text-gray-400 rounded px-1.5 py-0.5"
                                            >
                                                starter
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {m.event_count} events · {formatDuration(m.duration_ms)} ·{" "}
                                        {formatDate(m.created_at)}
                                    </p>
                                    <div className="mt-1.5">
                                        {capturingHotkeyId === m.id ? (
                                            <span className="text-xs text-[#b026ff] animate-pulse">
                                                Press a key combo... (Esc to cancel)
                                            </span>
                                        ) : m.hotkey ? (
                                            <span className="inline-flex items-center gap-1.5">
                                                    <span className="break-words text-xs font-mono bg-[#b026ff]/15 text-[#b026ff] border border-[#b026ff]/30 rounded px-1.5 py-0.5">
                                                    {m.hotkey.replace("CommandOrControl", "Ctrl")}
                                                </span>
                                                <button
                                                    onClick={() => handleClearHotkey(m.id)}
                                                    className="text-xs text-gray-500 hover:text-[#ff3366]"
                                                >
                                                    clear
                                                </button>
                                            </span>
                                        ) : (
                                            <button
                                                onClick={() => setCapturingHotkeyId(m.id)}
                                                className="text-xs text-gray-500 hover:text-[#00d9ff]"
                                            >
                                                + set hotkey
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                        {m.tags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="inline-flex items-center gap-1 text-xs bg-white/5 text-gray-300 rounded-full px-2 py-0.5"
                                            >
                                                <span className="max-w-xs truncate">{tag}</span>
                                                <button
                                                    onClick={() => handleRemoveTag(m, tag)}
                                                    className="text-gray-500 hover:text-[#ff3366]"
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                        {addingTagToId === m.id ? (
                                            <input
                                                autoFocus
                                                type="text"
                                                value={tagDraft}
                                                onChange={(e) => setTagDraft(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") handleAddTag(m);
                                                    if (e.key === "Escape") {
                                                        setAddingTagToId(null);
                                                        setTagDraft("");
                                                    }
                                                }}
                                                onBlur={() => handleAddTag(m)}
                                                placeholder="tag name"
                                                className="text-xs bg-[#0a0e27] border border-white/10 rounded-full px-2 py-0.5 w-24 focus:outline-none focus:border-[#00d9ff]"
                                            />
                                        ) : (
                                            <button
                                                onClick={() => setAddingTagToId(m.id)}
                                                className="text-xs text-gray-500 hover:text-[#00d9ff]"
                                            >
                                                + tag
                                            </button>
                                        )}
                                    </div>
                                    {isThisPlaying && progress && (
                                        <div className="mt-2 w-full max-w-64">
                                            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-[#b026ff] transition-all"
                                                    style={{
                                                        width: `${(progress.current_index / progress.total) * 100}%`,
                                                    }}
                                                />
                                            </div>
                                            {progress.repeat_total > 1 && (
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Repeat {progress.repeat_index + 1} of {progress.repeat_total}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 shrink-0 ml-4">
                                    {isThisPlaying ? (
                                        <button
                                            onClick={handleStopPlayback}
                                            className="px-3 py-1.5 rounded-lg bg-[#ff3366] hover:bg-[#ff3366]/80 text-white text-sm font-medium"
                                        >
                                            Stop
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handlePlay(m.id)}
                                            disabled={playingId !== null}
                                            className="px-3 py-1.5 rounded-lg bg-[#00d9ff] hover:bg-[#00d9ff]/80 text-[#0a0e27] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            Play
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleExport(m)}
                                        disabled={isThisPlaying}
                                        className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        Export
                                    </button>
                                    {sharedIds.has(m.id) ? (
                                        <span className="px-3 py-1.5 rounded-lg bg-[#00ff88]/15 text-[#00ff88] border border-[#00ff88]/30 text-sm font-medium">
                                            Shared ✓
                                        </span>
                                    ) : (
                                        <button
                                            onClick={() => handleShareClick(m.id)}
                                            disabled={isThisPlaying || sharingId === m.id}
                                            title="Publishes this macro to the public Community Library"
                                            className={`px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
                                                confirmShareId === m.id
                                                    ? "bg-[#b026ff] text-white"
                                                    : "bg-white/5 hover:bg-white/10 text-gray-300"
                                            }`}
                                        >
                                            {sharingId === m.id
                                                ? "Sharing..."
                                                : confirmShareId === m.id
                                                ? "Confirm public share?"
                                                : "Share"}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleDeleteClick(m.id)}
                                        disabled={isThisPlaying}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
                                            isConfirmingDelete
                                                ? "bg-[#ff3366] text-white"
                                                : "bg-white/5 hover:bg-white/10 text-gray-300"
                                        }`}
                                    >
                                        {isConfirmingDelete ? "Confirm?" : "Delete"}
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}