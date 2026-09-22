import { Search } from "lucide-react";

interface FilterBarProps {
    user: { id: string } | null;
    showOnlyMine: boolean;
    onToggleMine: () => void;
    allTags: string[];
    activeTagFilters: string[];
    onToggleTag: (tag: string) => void;
    onClearFilters: () => void;
    loading: boolean;
    searchQuery: string;
    onSearchChange: (value: string) => void;
}

export default function FilterBar({
    user,
    showOnlyMine,
    onToggleMine,
    allTags,
    activeTagFilters,
    onToggleTag,
    onClearFilters,
    loading,
    searchQuery,
    onSearchChange,
}: FilterBarProps) {
    return (
        <div className="space-y-3">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-frag-muted" size={18} />
                <input
                    type="text"
                    placeholder="Search fragments..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full max-w-sm bg-frag-surface border border-frag-border rounded-lg pl-10 pr-4 py-2 text-sm text-frag-text placeholder-frag-muted focus:outline-none focus:border-frag-primary transition-colors"
                />
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {user && (
                    <button
                        onClick={onToggleMine}
                        aria-pressed={showOnlyMine}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                            showOnlyMine
                                ? "bg-frag-accent/15 border-frag-accent/50 text-frag-accent"
                                : "bg-frag-border/40 border-frag-border text-frag-muted hover:text-frag-text"
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
                                onClick={() => onToggleTag(tag)}
                                aria-pressed={active}
                                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
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
                        onClick={onClearFilters}
                        className="text-xs text-frag-muted hover:text-frag-text"
                    >
                        clear tag filters
                    </button>
                )}
            </div>
        </div>
    );
}