interface FilterBarProps {
    user: { id: string } | null;
    showOnlyMine: boolean;
    onToggleMine: () => void;
    allTags: string[];
    activeTagFilters: string[];
    onToggleTag: (tag: string) => void;
    onClearFilters: () => void;
    loading: boolean;
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
}: FilterBarProps) {
    return (
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
    );
}