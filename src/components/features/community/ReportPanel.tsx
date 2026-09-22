import { REPORT_REASONS } from "./communityTypes";

interface ReportPanelProps {
    isSubmitting: boolean;
    onSelect: (reason: string) => void;
    onCancel: () => void;
}

export default function ReportPanel({ isSubmitting, onSelect, onCancel }: ReportPanelProps) {
    return (
        <div className="mt-3 pt-3 border-t border-frag-border space-y-2">
            <p className="text-xs text-frag-muted">Why are you reporting this?</p>
            <div className="flex flex-wrap gap-2">
                {REPORT_REASONS.map((r) => (
                    <button
                        key={r.value}
                        onClick={() => onSelect(r.value)}
                        disabled={isSubmitting}
                        className="text-xs px-3 py-1.5 rounded-lg bg-frag-border/40 hover:bg-frag-danger/10 hover:text-frag-danger text-frag-text disabled:opacity-40 transition-colors"
                    >
                        {r.label}
                    </button>
                ))}
            </div>
            <button
                onClick={onCancel}
                className="text-xs text-frag-muted hover:text-frag-text"
            >
                Cancel
            </button>
        </div>
    );
}