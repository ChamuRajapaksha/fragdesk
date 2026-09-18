import { useState } from "react";
import { extractErrorMessage, supabase } from "../../../community/supabaseClient";

interface AuthPanelProps {
    onAuthed?: () => void;
}

export default function AuthPanel({ onAuthed }: AuthPanelProps) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const passwordTooShort = mode === "sign-up" && password.length > 0 && password.length < 6;

    function switchMode(next: "sign-in" | "sign-up") {
        setMode(next);
        setError(null);
        setInfo(null);
    }

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
        <div className="bg-frag-surface rounded-2xl p-6 border border-white/5 shadow-[0_0_0_1px_rgb(var(--frag-primary)_/_0.04)] focus-within:border-frag-primary/30 transition-colors max-w-sm w-full">
            {/* Eyebrow + heading */}
            <div className="mb-5">
                <p className="text-[10px] tracking-[0.2em] text-frag-primary/60 font-medium uppercase mb-1">
                    Account access
                </p>
                <h2 className="text-lg font-semibold text-white flex items-center gap-1.5">
                    <span className="text-frag-primary">&gt;</span>
                    {mode === "sign-in" ? "Sign in" : "Create your account"}
                </h2>
                <p className="text-xs text-frag-muted mt-1">
                    {mode === "sign-in"
                        ? "Sign in to share macros and manage what you've shared."
                        : "Sign up to share macros to the community library."}
                </p>
            </div>

            {/* Segmented tab control with sliding indicator */}
            <div className="relative grid grid-cols-2 gap-1 bg-frag-bg rounded-lg p-1 mb-4 text-sm">
                <div
                    className="absolute inset-y-1 w-[calc(50%-4px)] bg-frag-primary/15 rounded-md transition-transform duration-200 ease-out"
                    style={{ transform: mode === "sign-up" ? "translateX(calc(100% + 8px))" : "translateX(0)" }}
                    aria-hidden="true"
                />
                <button
                    type="button"
                    onClick={() => switchMode("sign-in")}
                    aria-pressed={mode === "sign-in"}
                    className={`relative z-10 px-3 py-1.5 rounded-md font-medium transition-colors ${
                        mode === "sign-in" ? "text-frag-primary" : "text-frag-muted hover:text-frag-text"
                    }`}
                >
                    Sign In
                </button>
                <button
                    type="button"
                    onClick={() => switchMode("sign-up")}
                    aria-pressed={mode === "sign-up"}
                    className={`relative z-10 px-3 py-1.5 rounded-md font-medium transition-colors ${
                        mode === "sign-up" ? "text-frag-primary" : "text-frag-muted hover:text-frag-text"
                    }`}
                >
                    Sign Up
                </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                    <label htmlFor="auth-email" className="sr-only">
                        Email
                    </label>
                    <input
                        id="auth-email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-frag-bg border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-frag-muted focus:outline-none focus:border-frag-primary focus:ring-1 focus:ring-frag-primary/30 transition-colors"
                    />
                </div>

                <div>
                    <label htmlFor="auth-password" className="sr-only">
                        Password
                    </label>
                    <div className="relative">
                        <input
                            id="auth-password"
                            type={showPassword ? "text" : "password"}
                            required
                            minLength={6}
                            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                            placeholder={mode === "sign-up" ? "Password (min 6 characters)" : "Password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-frag-bg border border-white/10 rounded-lg pl-3 pr-10 py-2.5 text-sm text-white placeholder:text-frag-muted focus:outline-none focus:border-frag-primary focus:ring-1 focus:ring-frag-primary/30 transition-colors"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-frag-muted hover:text-frag-text p-1 rounded-md transition-colors"
                        >
                            {showPassword ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.6 18.6 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" strokeLinecap="round" strokeLinejoin="round" />
                                    <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" />
                                </svg>
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" strokeLinecap="round" strokeLinejoin="round" />
                                    <circle cx="12" cy="12" r="3" />
                                </svg>
                            )}
                        </button>
                    </div>
                    {passwordTooShort && (
                        <p className="text-[11px] text-frag-muted mt-1">
                            {6 - password.length} more character{6 - password.length === 1 ? "" : "s"} needed
                        </p>
                    )}
                </div>

                {error && (
                    <div className="flex items-start gap-2 bg-frag-danger/10 border-l-2 border-frag-danger rounded-r-lg px-3 py-2">
                        <span className="text-frag-danger text-xs mt-0.5">✕</span>
                        <p className="text-xs text-frag-danger">{error}</p>
                    </div>
                )}
                {info && (
                    <div className="flex items-start gap-2 bg-frag-success/10 border-l-2 border-frag-success rounded-r-lg px-3 py-2">
                        <span className="text-frag-success text-xs mt-0.5">✓</span>
                        <p className="text-xs text-frag-success">{info}</p>
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-frag-primary hover:bg-frag-primary/80 active:scale-[0.99] text-frag-bg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                    {loading && (
                        <svg
                            className="animate-spin"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                        >
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                    )}
                    {loading ? "Please wait" : mode === "sign-up" ? "Create account" : "Sign in"}
                </button>
            </form>

            <p className="text-xs text-frag-muted text-center mt-4">
                {mode === "sign-in" ? (
                    <>
                        Don&apos;t have an account?{" "}
                        <button
                            type="button"
                            onClick={() => switchMode("sign-up")}
                            className="text-frag-primary hover:underline"
                        >
                            Sign up
                        </button>
                    </>
                ) : (
                    <>
                        Already have an account?{" "}
                        <button
                            type="button"
                            onClick={() => switchMode("sign-in")}
                            className="text-frag-primary hover:underline"
                        >
                            Sign in
                        </button>
                    </>
                )}
            </p>
        </div>
    );
}