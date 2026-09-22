import { memo, useEffect, useRef } from 'react';
import type {
    MacroSummary,
    PlaybackProgress,
} from './macroTypes';
import { formatDate, formatDuration, formatHotkey } from './macroTypes';

export interface MacroCardProps {
    macro: MacroSummary;
    isPlaying: boolean;
    progress: PlaybackProgress | null;
    isRenaming: boolean;
    renameDraft: string;
    isConfirmingDelete: boolean;
    isCapturingHotkey: boolean;
    isConfirmingShare: boolean;
    isSharing: boolean;
    isShared: boolean;
    isAddingTag: boolean;
    tagDraft: string;
    hasActivePlayback: boolean;
    onStartRename: (macro: MacroSummary) => void;
    onRenameChange: (value: string) => void;
    onCommitRename: () => void;
    onCancelRename: () => void;
    onClearHotkey: (id: string) => void;
    onCaptureHotkey: (id: string) => void;
    onAddTag: (macro: MacroSummary) => void;
    onRemoveTag: (macro: MacroSummary, tag: string) => void;
    onTagDraftChange: (value: string) => void;
    onOpenTagInput: (id: string) => void;
    onCloseTagInput: () => void;
    onPlay: (id: string) => void;
    onStopPlayback: () => void;
    onExport: (macro: MacroSummary) => void;
    onShareClick: (id: string) => void;
    onDeleteClick: (id: string) => void;
}

function MacroCard({
    macro: m,
    isPlaying,
    progress,
    isRenaming,
    renameDraft,
    isConfirmingDelete,
    isCapturingHotkey,
    isConfirmingShare,
    isSharing,
    isShared,
    isAddingTag,
    tagDraft,
    hasActivePlayback,
    onStartRename,
    onRenameChange,
    onCommitRename,
    onCancelRename,
    onClearHotkey,
    onCaptureHotkey,
    onAddTag,
    onRemoveTag,
    onTagDraftChange,
    onOpenTagInput,
    onCloseTagInput,
    onPlay,
    onStopPlayback,
    onExport,
    onShareClick,
    onDeleteClick,
}: MacroCardProps) {
    const renameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isRenaming) {
            setTimeout(() => renameInputRef.current?.focus(), 50);
        }
    }, [isRenaming]);

    return (
        <div className="bg-frag-surface rounded-xl p-4 border border-frag-border flex items-center justify-between">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    {isRenaming ? (
                        <input
                            ref={renameInputRef}
                            type="text"
                            value={renameDraft}
                            onChange={(e) => onRenameChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") onCommitRename();
                                if (e.key === "Escape") onCancelRename();
                            }}
                            onBlur={onCommitRename}
                            className="min-w-0 w-full max-w-xs bg-frag-bg border border-frag-primary rounded px-2 py-1 text-sm focus:outline-none"
                        />
                    ) : (
                        <button
                            onClick={() => onStartRename(m)}
                            title="Click to rename"
                            className="min-w-0 truncate font-medium text-left hover:text-frag-primary transition-colors"
                        >
                            {m.name}
                        </button>
                    )}
                    {m.source === "community" && (
                        <span
                            title="Imported from the Community Library — reviewed this before importing? Playing it simulates real input on your machine."
                            className="shrink-0 text-xs bg-frag-danger/10 text-frag-danger border border-frag-danger/30 rounded px-1.5 py-0.5"
                        >
                            community
                        </span>
                    )}
                    {m.source === "starter" && (
                        <span
                            title="Imported from FragDesk's bundled starter pack"
                            className="shrink-0 text-xs bg-frag-border/40 text-frag-muted rounded px-1.5 py-0.5"
                        >
                            starter
                        </span>
                    )}
                </div>
                <p className="text-xs text-frag-muted mt-0.5">
                    {m.event_count} events · {formatDuration(m.duration_ms)} ·{" "}
                    {formatDate(m.created_at)}
                </p>
                <div className="mt-1.5">
                    {isCapturingHotkey ? (
                        <span className="text-xs text-frag-accent animate-pulse">
                            Press a key combo... (Esc to cancel)
                        </span>
                    ) : m.hotkey ? (
                        <span className="inline-flex items-center gap-1.5">
                            <span className="break-words text-xs font-mono bg-frag-accent/15 text-frag-accent border border-frag-accent/30 rounded px-1.5 py-0.5">
                                {formatHotkey(m.hotkey)}
                            </span>
                            <button
                                onClick={() => onClearHotkey(m.id)}
                                className="text-xs text-frag-muted hover:text-frag-danger"
                            >
                                clear
                            </button>
                        </span>
                    ) : (
                        <button
                            onClick={() => onCaptureHotkey(m.id)}
                            className="text-xs text-frag-muted hover:text-frag-primary"
                        >
                            + set hotkey
                        </button>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    {m.tags.map((tag) => (
                        <span
                            key={tag}
                            className="inline-flex items-center gap-1 text-xs bg-frag-border/40 text-frag-text rounded-full px-2 py-0.5"
                        >
                            <span className="max-w-xs truncate">{tag}</span>
                            <button
                                onClick={() => onRemoveTag(m, tag)}
                                aria-label={`Remove tag ${tag}`}
                                className="text-frag-muted hover:text-frag-danger"
                            >
                                ×
                            </button>
                        </span>
                    ))}
                    {isAddingTag ? (
                        <input
                            autoFocus
                            type="text"
                            value={tagDraft}
                            onChange={(e) => onTagDraftChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") onAddTag(m);
                                if (e.key === "Escape") onCloseTagInput();
                            }}
                            onBlur={() => onAddTag(m)}
                            placeholder="tag name"
                            className="text-xs bg-frag-bg border border-frag-border rounded-full px-2 py-0.5 w-24 focus:outline-none focus:border-frag-primary"
                        />
                    ) : (
                        <button
                            onClick={() => onOpenTagInput(m.id)}
                            className="text-xs text-frag-muted hover:text-frag-primary"
                        >
                            + tag
                        </button>
                    )}
                </div>
                {isPlaying && progress && (
                    <div className="mt-2 w-full max-w-64">
                        <div className="h-1.5 bg-frag-border/40 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-frag-accent transition-all"
                                style={{
                                    width: `${(progress.current_index / progress.total) * 100}%`,
                                }}
                            />
                        </div>
                        {progress.repeat_total > 1 && (
                            <p className="text-xs text-frag-muted mt-1">
                                Repeat {progress.repeat_index + 1} of {progress.repeat_total}
                            </p>
                        )}
                    </div>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0 ml-4">
                {isPlaying ? (
                    <button
                        onClick={onStopPlayback}
                        className="px-3 py-1.5 rounded-lg bg-frag-danger hover:bg-frag-danger/80 text-frag-bg text-sm font-medium"
                    >
                        Stop
                    </button>
                ) : (
                    <button
                        onClick={() => onPlay(m.id)}
                        disabled={hasActivePlayback}
                        className="px-3 py-1.5 rounded-lg bg-frag-primary hover:bg-frag-primary/80 text-frag-bg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Play
                    </button>
                )}
                <button
                    onClick={() => onExport(m)}
                    disabled={isPlaying}
                    className="px-3 py-1.5 rounded-lg bg-frag-border/40 hover:bg-frag-border/70 text-frag-text text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    Export
                </button>
                {isShared ? (
                    <span className="px-3 py-1.5 rounded-lg bg-frag-success/15 text-frag-success border border-frag-success/30 text-sm font-medium">
                        Shared ✓
                    </span>
                ) : (
                    <button
                        onClick={() => onShareClick(m.id)}
                        disabled={isPlaying || isSharing}
                        title="Publishes this macro to the public Community Library"
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
                            isConfirmingShare
                                ? "bg-frag-accent text-frag-bg"
                                : "bg-frag-border/40 hover:bg-frag-border/70 text-frag-text"
                        }`}
                    >
                        {isSharing
                            ? "Sharing..."
                            : isConfirmingShare
                            ? "Confirm public share?"
                            : "Share"}
                    </button>
                )}
                <button
                    onClick={() => onDeleteClick(m.id)}
                    disabled={isPlaying}
                    aria-live="polite"
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
                        isConfirmingDelete
                            ? "bg-frag-danger text-frag-bg"
                            : "bg-frag-border/40 hover:bg-frag-border/70 text-frag-text"
                    }`}
                >
                    {isConfirmingDelete ? "Confirm?" : "Delete"}
                </button>
            </div>
        </div>
    );
}

export default memo(MacroCard);