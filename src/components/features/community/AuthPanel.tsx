import { useState } from "react";
import { extractErrorMessage, supabase } from "../../../community/supabaseClient";

interface AuthPanelProps {
    onAuthed?: () => void;
}

export default function AuthPanel({ onAuthed }: AuthPanelProps) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!supabase) return;
        setError(null);
        setInfo(null);
        setLoading(true);

        try {
            if (mode === "sign-up") {
                const { error: signUpError } = await supabase.auth.signUp({ email, password });
                if (signUpError) throw signUpError;
                setInfo("Account created — check your email to confirm, then sign in.");
                setMode("sign-in");
            } else {
                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (signInError) throw signInError;
                onAuthed?.();
            }
        } catch (err) {
            setError(extractErrorMessage(err));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="bg-[#141933] rounded-xl p-5 border border-white/5 space-y-3 max-w-sm">
            <div className="flex gap-2 text-sm">
                <button
                    type="button"
                    onClick={() => {
                        setMode("sign-in");
                        setError(null);
                        setInfo(null);
                    }}
                    className={`px-3 py-1 rounded-lg transition-colors ${
                        mode === "sign-in"
                            ? "bg-[#00d9ff]/15 text-[#00d9ff]"
                            : "text-gray-400 hover:text-gray-200"
                    }`}
                >
                    Sign In
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setMode("sign-up");
                        setError(null);
                        setInfo(null);
                    }}
                    className={`px-3 py-1 rounded-lg transition-colors ${
                        mode === "sign-up"
                            ? "bg-[#00d9ff]/15 text-[#00d9ff]"
                            : "text-gray-400 hover:text-gray-200"
                    }`}
                >
                    Sign Up
                </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-2">
                <input
                    type="email"
                    required
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-[#0a0e27] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00d9ff]"
                />
                <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="Password (min 6 characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-[#0a0e27] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00d9ff]"
                />

                {error && <p className="text-xs text-[#ff3366]">{error}</p>}
                {info && <p className="text-xs text-[#00ff88]">{info}</p>}

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full px-3 py-2 rounded-lg bg-[#00d9ff] hover:bg-[#00d9ff]/80 text-[#0a0e27] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {loading ? "..." : mode === "sign-up" ? "Create account" : "Sign in"}
                </button>
            </form>
        </div>
    );
}