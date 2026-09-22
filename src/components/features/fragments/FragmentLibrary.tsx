import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Layers } from "lucide-react";
import {
    Badge,
    EmptyState,
    ErrorBanner,
    LoadingState,
    PageHeader,
    useToast,
} from "../../ui";

interface BundledFragmentSummary {
    filename: string;
    fragment_type: string;
    name: string;
    tags: string[];
    format_version: number;
}

const TYPE_LABELS: Record<string, string> = {
    macro: "Macro",
};

export default function FragmentLibrary() {
    const { toast } = useToast();
    const [fragments, setFragments] = useState<BundledFragmentSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [importedFilenames, setImportedFilenames] = useState<Set<string>>(new Set());
    const [importingFilename, setImportingFilename] = useState<string | null>(null);

    useEffect(() => {
        refreshFragments();
    }, []);

    async function refreshFragments() {
        setLoading(true);
        try {
            const result = await invoke<BundledFragmentSummary[]>("list_bundled_fragments");
            setFragments(result);
        } catch (err) {
            setError(String(err));
        } finally {
            setLoading(false);
        }
    }

    async function handleImport(f: BundledFragmentSummary) {
        setError(null);
        setImportingFilename(f.filename);
        try {
            await invoke("import_bundled_fragment", { filename: f.filename });
            setImportedFilenames((prev) => new Set(prev).add(f.filename));
            toast(`Imported "${f.name}".`, "success");
        } catch (err) {
            setError(String(err));
        } finally {
            setImportingFilename(null);
        }
    }

    return (
        <div className="min-h-full bg-frag-bg text-frag-text p-4 md:p-6 space-y-6">
            <PageHeader
                title="Fragment Library"
                subtitle="Curated fragments bundled with FragDesk — import one to try it out. This is a local starter pack for now; community-submitted fragments arrive there shortly."
                accent={<Layers size={22} />}
                actions={
                    <>
                        {!loading && fragments.length > 0 && (
                            <Badge variant="muted">
                                {fragments.length} fragment{fragments.length === 1 ? "" : "s"}
                            </Badge>
                        )}
                    </>
                }
            />

            {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

            {loading ? (
                <LoadingState rows={4} label="Loading bundled fragments" />
            ) : fragments.length === 0 ? (
                <EmptyState
                    icon={Layers}
                    title="No bundled fragments found"
                    description="The starter pack shipped with FragDesk couldn't be found. Reinstall the app or check the bundled assets folder."
                />
            ) : (
                <div className="space-y-2">
                    {fragments.map((f) => {
                        const isImported = importedFilenames.has(f.filename);
                        const isImporting = importingFilename === f.filename;

                        return (
                            <div
                                key={f.filename}
                                className="bg-frag-surface rounded-xl p-3 md:p-4 border border-frag-border flex flex-wrap items-center justify-between gap-y-3"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <p className="font-medium truncate">{f.name}</p>
                                        <span className="text-xs bg-frag-accent/15 text-frag-accent border border-frag-accent/30 rounded px-1.5 py-0.5 shrink-0">
                                            {TYPE_LABELS[f.fragment_type] ?? f.fragment_type}
                                        </span>
                                    </div>
                                    {f.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                            {f.tags.map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="text-xs bg-frag-border/40 text-frag-muted rounded-full px-2 py-0.5 break-words"
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => handleImport(f)}
                                    disabled={isImporting || isImported}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                                        isImported
                                            ? "bg-frag-success/15 text-frag-success border border-frag-success/30"
                                            : "bg-frag-primary hover:bg-frag-primary/80 text-frag-bg disabled:opacity-40"
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