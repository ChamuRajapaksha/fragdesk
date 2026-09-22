import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FEATURES, GROUP_LABELS, type NavId } from "../../../features/registry";

interface MacroSummary {
    id: string;
    name: string;
    event_count: number;
    duration_ms: number;
}

interface CommandPaletteProps {
    setActiveTab: (tab: NavId) => void;
}

type PaletteCommand =
    | { kind: "nav"; id: NavId; label: string; hint: string; keywords: string[] }
    | { kind: "play-macro"; id: string; label: string; hint: string; keywords: string[] };

export default function CommandPalette({ setActiveTab }: CommandPaletteProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [macros, setMacros] = useState<MacroSummary[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    // Global open/close shortcut. Scoped to when the app window has focus
    // -- this is a UI quick-switcher, not a background hotkey like the
    // macro F9 toggle, so it only needs to work while someone's actually
    // looking at FragDesk.
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            const isToggleCombo = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
            if (isToggleCombo) {
                e.preventDefault();
                setIsOpen((prev) => !prev);
                return;
            }
            if (e.key === "Escape" && isOpen) {
                setIsOpen(false);
            }
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        setQuery("");
        setSelectedIndex(0);
        invoke<MacroSummary[]>("get_macros")
            .then(setMacros)
            .catch(() => setMacros([]));
        setTimeout(() => inputRef.current?.focus(), 30);
    }, [isOpen]);

    if (!isOpen) return null;

    const navCommands: PaletteCommand[] = FEATURES.map((f) => ({
        kind: "nav",
        id: f.id,
        label: `Go to ${f.label}`,
        hint: GROUP_LABELS[f.group],
        keywords: [f.label.toLowerCase(), ...f.keywords],
    }));

    const macroCommands: PaletteCommand[] = macros.map((m) => ({
        kind: "play-macro",
        id: m.id,
        label: `Play "${m.name}"`,
        hint: `${m.event_count} events`,
        keywords: ["play", "macro", m.name.toLowerCase()],
    }));

    const allCommands = [...navCommands, ...macroCommands];
    const q = query.trim().toLowerCase();
    const filtered = q
        ? allCommands.filter((c) =>
            c.label.toLowerCase().includes(q) || c.keywords.some((k) => k.includes(q))
          )
        : allCommands;

    function runCommand(cmd: PaletteCommand) {
        if (cmd.kind === "nav") {
            setActiveTab(cmd.id);
        } else {
            invoke("play_macro", { id: cmd.id, speed: 1, repeat: 1 }).catch((err) => {
                console.error("Failed to play macro from command palette:", err);
            });
        }
        setIsOpen(false);
    }

    function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter" && filtered[selectedIndex]) {
            e.preventDefault();
            runCommand(filtered[selectedIndex]);
        }
    }

    return (
        <div
            className="fixed inset-0 bg-black/60 flex items-start justify-center pt-[15vh] z-50"
            onClick={() => setIsOpen(false)}
        >
            <div
                className="bg-frag-surface border border-frag-border rounded-xl w-full max-w-lg shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setSelectedIndex(0);
                    }}
                    onKeyDown={onInputKeyDown}
                    placeholder="Jump to a tab or play a macro..."
                    className="w-full bg-transparent px-4 py-3 text-frag-text placeholder-frag-muted border-b border-frag-border focus:outline-none"
                />
                <div className="max-h-80 overflow-y-auto py-1">
                    {filtered.length === 0 ? (
                        <p className="text-sm text-frag-muted px-4 py-3">No matches.</p>
                    ) : (
                        filtered.map((cmd, i) => (
                            <button
                                key={`${cmd.kind}-${cmd.id}`}
                                onClick={() => runCommand(cmd)}
                                onMouseEnter={() => setSelectedIndex(i)}
                                className={`w-full flex items-center justify-between px-4 py-2 text-sm text-left transition-colors ${
                                    i === selectedIndex
                                        ? "bg-frag-primary/10 text-frag-primary"
                                        : "text-frag-text"
                                }`}
                            >
                                <span>{cmd.label}</span>
                                <span className="text-xs text-frag-muted">{cmd.hint}</span>
                            </button>
                        ))
                    )}
                </div>
                <div className="px-4 py-2 border-t border-frag-border text-xs text-frag-muted flex gap-3">
                    <span>↑↓ navigate</span>
                    <span>↵ select</span>
                    <span>esc close</span>
                </div>
            </div>
        </div>
    );
}