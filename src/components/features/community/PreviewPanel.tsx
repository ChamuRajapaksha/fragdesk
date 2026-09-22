import { summarizeMacroPayload, type CommunityFragmentRow } from "./communityTypes";

interface PreviewPanelProps {
    row: CommunityFragmentRow;
    isImporting: boolean;
    onImport: () => void;
    onCancel: () => void;
}

export default function PreviewPanel({
    row,
    isImporting,
    onImport,
    onCancel,
}: PreviewPanelProps) {
    const stats = summarizeMacroPayload(row.payload);

    return (
        <div className="mt-3 pt-3 border-t border-frag-border space-y-3">
            {row.fragment_type === "macro" ? (
                stats ? (
                    <div className="text-sm text-frag-text space-y-1">
                        <p>
                            <span className="text-frag-muted">This macro will simulate:</span>
                        </p>
                        <ul className="text-xs text-frag-muted space-y-0.5 pl-4 list-disc">
                            <li>{stats.keyPresses} key press(es)</li>
                            <li>{stats.mouseClicks} mouse click(s)</li>
                            <li>{stats.mouseMoves} mouse movement(s)</li>
                            <li>{stats.wheelScrolls} scroll event(s)</li>
                        </ul>
                        {stats.distinctKeys.length > 0 && (
                            <p className="text-xs text-frag-muted">
                                Keys involved: {stats.distinctKeys.join(", ")}
                            </p>
                        )}
                    </div>
                ) : (
                    <p className="text-xs text-frag-muted">
                        Couldn't parse this fragment's contents to preview.
                    </p>
                )
            ) : row.fragment_type === "clipboard_snippet" ? (
                <div className="text-sm text-frag-text">
                    <p className="text-xs text-frag-muted mb-1">Snippet content:</p>
                    <p className="bg-frag-bg border border-frag-border rounded-lg px-3 py-2 text-sm break-words whitespace-pre-wrap max-h-32 overflow-y-auto">
                        {typeof row.payload === "object" &&
                        row.payload !== null &&
                        "content" in row.payload
                            ? String((row.payload as { content: unknown }).content)
                            : "(couldn't read content)"}
                    </p>
                </div>
            ) : row.fragment_type === "monitor_alert_rule" ? (
                <div className="text-sm text-frag-text">
                    <p className="text-xs text-frag-muted mb-1">This alert rule:</p>
                    {(() => {
                        const p = row.payload as {
                            metric?: string;
                            comparison?: string;
                            threshold?: number;
                        };
                        if (
                            typeof p !== "object" ||
                            p === null ||
                            !p.metric ||
                            !p.comparison ||
                            p.threshold === undefined
                        ) {
                            return (
                                <p className="text-xs text-frag-muted">
                                    (couldn't read rule details)
                                </p>
                            );
                        }
                        return (
                            <p className="bg-frag-bg border border-frag-border rounded-lg px-3 py-2 text-sm">
                                Notifies when{" "}
                                <span className="text-frag-primary">
                                    {p.metric.toUpperCase()}
                                </span>{" "}
                                is {p.comparison}{" "}
                                <span className="text-frag-primary">
                                    {p.threshold}%
                                </span>
                            </p>
                        );
                    })()}
                </div>
            ) : row.fragment_type === "monitor_layout" ? (
                <div className="text-sm text-frag-text">
                    <p className="text-xs text-frag-muted mb-1">
                        This layout arranges Monitor as:
                    </p>
                    {(() => {
                        const p = row.payload as {
                            widgets?: { id: string; visible: boolean }[];
                        };
                        if (!p?.widgets || !Array.isArray(p.widgets)) {
                            return (
                                <p className="text-xs text-frag-muted">
                                    (couldn't read layout details)
                                </p>
                            );
                        }
                        const labels: Record<string, string> = {
                            stats: "Stats Cards",
                            alerts: "Alert Rules Panel",
                            cpu_graph: "CPU Graph",
                            ram_graph: "RAM Graph",
                        };
                        return (
                            <ol className="bg-frag-bg border border-frag-border rounded-lg px-3 py-2 text-xs space-y-1 list-decimal pl-6">
                                {p.widgets.map((w) => (
                                    <li
                                        key={w.id}
                                        className={w.visible ? "" : "text-frag-muted/60 line-through"}
                                    >
                                        {labels[w.id] ?? w.id}
                                        {!w.visible && " (hidden)"}
                                    </li>
                                ))}
                            </ol>
                        );
                    })()}
                    <p className="text-xs text-frag-muted mt-1">
                        Importing replaces your current Monitor layout.
                    </p>
                </div>
            ) : (
                <p className="text-xs text-frag-muted">
                    No preview available for this fragment type.
                </p>
            )}

            {row.fragment_type === "macro" && (
                <p className="text-xs text-frag-danger">
                    Once imported, playing this macro will actually perform these actions on your
                    computer.
                </p>
            )}

            <div className="flex gap-2">
                <button
                    onClick={onImport}
                    disabled={isImporting || (row.fragment_type === "macro" && !stats)}
                    className="px-3 py-1.5 rounded-lg bg-frag-primary hover:bg-frag-primary/80 text-frag-bg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {isImporting ? "Importing..." : "Import"}
                </button>
                <button
                    onClick={onCancel}
                    className="px-3 py-1.5 rounded-lg bg-frag-border/40 hover:bg-frag-border/70 text-frag-text text-sm font-medium"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}