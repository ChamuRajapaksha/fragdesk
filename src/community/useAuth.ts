import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

/**
 * Tracks the current signed-in user (or null), and keeps it in sync as
 * sign-in/sign-out happens anywhere in the app -- any component using
 * this hook re-renders automatically when auth state changes, no manual
 * plumbing needed between the auth panel and whatever else cares (Share
 * button, Community Library's delete buttons, etc).
 */
export function useAuth() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!supabase) {
            setLoading(false);
            return;
        }

        supabase.auth.getSession().then(({ data }) => {
            setUser(data.session?.user ?? null);
            setLoading(false);
        });

        const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription.subscription.unsubscribe();
    }, []);

    async function signOut() {
        if (!supabase) return;
        await supabase.auth.signOut();
    }

    return { user, loading, signOut };
}