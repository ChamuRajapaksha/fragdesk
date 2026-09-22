import { memo } from "react";
import PreviewPanel from "./PreviewPanel";
import ReportPanel from "./ReportPanel";
import { TYPE_LABELS, type CommunityFragmentRow } from "./communityTypes";

interface CommunityCardProps {
    row: CommunityFragmentRow;
    isOwner: boolean;
    canReport: boolean;
    isImported: boolean;
    isImporting: boolean;
    isPreviewOpen: boolean;
    isDeleting: boolean;
    isConfirmingDelete: boolean;
    isAddingTag: boolean;
    tagDraft: string;
    isReportOpen: boolean;
    hasReported: boolean;
    isSubmittingReport: boolean;
    onTogglePreview: () => void;
    onDeleteClick: () => void;
    onAddTag: () => void;
    onRemoveTag: (tag: string) => void;
    onTagDraftChange: (value: string) => void;
    onOpenTagInput: () => void;
    onCloseTagInput: () => void;
    onToggleReport: () => void;
    onSubmitReport: (reason: string) => void;
    onCancelReport: () => void;
    onImport: () => void;
    onCancelPreview: () => void;
}

function CommunityCard({
    row,
    isOwner,
    canReport,
    isImported,
    isImporting,
    isPreviewOpen,
    isDeleting,
    isConfirmingDelete,
    isAddingTag,
    tagDraft,
    isReportOpen,
    hasReported,
    isSubmittingReport,
    onTogglePreview,
    onDeleteClick,
    onAddTag,
    onRemoveTag,
    onTagDraftChange,
    onOpenTagInput,
    onCloseTagInput,
    onToggleReport,
    onSubmitReport,
    onCancelReport,
    onImport,
    onCancelPreview,
}: CommunityCardProps) {
    return (
        <div className="bg-frag-surface rounded-xl p-3 md:p-4 border border-frag-border">
            <div className="flex flex-wrap items-center justify-between gap-y-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <p className="font-medium">{row.name}</p>
                        <span className="text-xs bg-frag-accent/15 text-frag-accent border border-frag-accent/30 rounded px-1.5 py-0.5">
                            {TYPE_LABELS[row.fragment_type] ?? row.fragment_type}
                        </span>
                        {isOwner && (
                            <span className="text-xs bg-frag-border/40 text-frag-muted rounded px-1.5 py-0.5">
                                yours
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-frag-muted mt-0.5">
                        {row.download_count} downloads
                    </p>

                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                        {row.tags.map((tag) =>
                            isOwner ? (
                                <span
                                    key={tag}
                                    className="inline-flex items-center gap-1 text-xs bg-frag-border/40 text-frag-text rounded-full px-2 py-0.5"
                                >
                                    {tag}
                                    <button
                                        onClick={() => onRemoveTag(tag)}
                                        aria-label={`Remove tag ${tag}`}
                                        className="text-frag-muted hover:text-frag-danger"
                                    >
                                        ×
                                    </button>
                                </span>
                            ) : (
                                <span
                                    key={tag}
                                    className="text-xs bg-frag-border/40 text-frag-muted rounded-full px-2 py-0.5"
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
                                    onChange={(e) => onTagDraftChange(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") onAddTag();
                                        if (e.key === "Escape") onCloseTagInput();
                                    }}
                                    onBlur={onAddTag}
                                    placeholder="tag name"
                                    className="text-xs bg-frag-bg border border-frag-border rounded-full px-2 py-0.5 w-24 focus:outline-none focus:border-frag-primary"
                                />
                            ) : (
                                <button
                                    onClick={onOpenTagInput}
                                    className="text-xs text-frag-muted hover:text-frag-primary"
                                >
                                    + tag
                                </button>
                            ))}
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-4">
                    {isOwner && (
                        <button
                            onClick={onDeleteClick}
                            disabled={isDeleting}
                            aria-live="polite"
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-40 transition-colors ${
                                isConfirmingDelete
                                    ? "bg-frag-danger text-frag-bg"
                                    : "bg-frag-border/40 hover:bg-frag-border/70 text-frag-text"
                            }`}
                        >
                            {isDeleting
                                ? "Deleting..."
                                : isConfirmingDelete
                                ? "Confirm?"
                                : "Delete"}
                        </button>
                    )}
                    {canReport && (
                        <button
                            onClick={onToggleReport}
                            disabled={hasReported}
                            title={hasReported ? "You've already reported this" : "Report this fragment"}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium bg-frag-border/40 hover:bg-frag-border/70 disabled:opacity-40 transition-colors ${
                                hasReported ? "text-frag-success" : "text-frag-muted hover:text-frag-danger"
                            }`}
                        >
                            {hasReported ? "Reported" : "Report"}
                        </button>
                    )}
                    {isImported ? (
                        <span className="px-4 py-2 rounded-lg text-sm font-medium bg-frag-success/15 text-frag-success border border-frag-success/30">
                            Imported ✓
                        </span>
                    ) : (
                        <button
                            onClick={onTogglePreview}
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-frag-border/40 hover:bg-frag-border/70 text-frag-text"
                        >
                            {isPreviewOpen ? "Hide preview" : "Preview"}
                        </button>
                    )}
                </div>
            </div>

            {isReportOpen && (
                <ReportPanel
                    isSubmitting={isSubmittingReport}
                    onSelect={onSubmitReport}
                    onCancel={onCancelReport}
                />
            )}

            {isPreviewOpen && (
                <PreviewPanel
                    row={row}
                    isImporting={isImporting}
                    onImport={onImport}
                    onCancel={onCancelPreview}
                />
            )}
        </div>
    );
}

export default memo(CommunityCard);