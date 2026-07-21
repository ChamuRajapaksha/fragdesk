import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export default function MacroManager() {

    useEffect(() => {
        async function loadMacros() {
            const macros = await invoke<string[]>("get_macros");

            console.log(macros);
        }

        loadMacros();
    }, []);

    return (
        <div style={{ padding: 24 }}>
            <h1>Macro Manager</h1>

            <p>No macros yet.</p>
        </div>
    );
}