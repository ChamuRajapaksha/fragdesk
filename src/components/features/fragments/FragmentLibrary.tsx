import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

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
        } catch (err) {
            setError(String(err));
        } finally {
            setImportingFilename(null);
        }
    }

    return (
        <div className="min-h-full bg-[#0a0e27] text-white p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-[#00d9ff]">Fragment Library</h1>
                <p className="text-sm text-gray-400 mt-1">
                    Curated fragments bundled with FragDesk — import one to try it out. This is a
                    local starter pack for now; community-submitted fragments are coming later.
                </p>
            </div>

            {error && (
                <div className="bg-[#ff3366]/10 border border-[#ff3366]/40 text-[#ff3366] text-sm rounded-lg px-4 py-2 break-words">
                    {error}
                </div>
            )}

            {loading ? (
                <p className="text-gray-500 text-sm">Loading...</p>
            ) : fragments.length === 0 ? (
                <p className="text-gray-500 text-sm">No bundled fragments found.</p>
            ) : (
                <div className="space-y-2">
                    {fragments.map((f) => {
                        const isImported = importedFilenames.has(f.filename);
                        const isImporting = importingFilename === f.filename;

                        return (
                            <div
                                key={f.filename}
                                className="bg-[#141933] rounded-xl p-4 border border-white/5 flex items-center justify-between"
                            >
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium">{f.name}</p>
                                        <span className="text-xs bg-[#b026ff]/15 text-[#b026ff] border border-[#b026ff]/30 rounded px-1.5 py-0.5">
                                            {TYPE_LABELS[f.fragment_type] ?? f.fragment_type}
                                        </span>
                                    </div>
                                    {f.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                            {f.tags.map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="text-xs bg-white/5 text-gray-400 rounded-full px-2 py-0.5 break-words"
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