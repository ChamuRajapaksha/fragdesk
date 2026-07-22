import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface MacroSummary {
    id: string;
    name: string;
    created_at: number; // unix seconds (chrono::Utc::now().timestamp())
    event_count: number;
    duration_ms: number;
}

export default function MacroManager() {
    const [macros, setMacros] = useState<MacroSummary[]>([]);

    useEffect(() => {
        loadMacros();
    }, []);

    async function loadMacros() {
        const result = await invoke<MacroSummary[]>("get_macros");
        console.log("macros loaded:", result);
        setMacros(result);
    }

    return (
        <div style={{ padding: 24 }}>
            <h1>Macro Manager</h1>

            {macros.length === 0 ? (
                <p>No macros yet.</p>
            ) : (
                <ul>
                    {macros.map((m) => (
                        <li key={m.id}>
                            {m.name} — {m.event_count} events, {(m.duration_ms / 1000).toFixed(1)}s
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}