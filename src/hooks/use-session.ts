import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = { id: string; phone: string; display_name: string | null; balance: number };

export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (uid: string) => {
    const [{ data: p }, { data: admin }] = await Promise.all([
      supabase.from("profiles").select("id, phone, display_name, balance").eq("id", uid).maybeSingle(),
      supabase.rpc("has_role", { _user_id: uid, _role: "admin" }),
    ]);
    setProfile(p ? { ...p, balance: Number(p.balance) } : null);
    setIsAdmin(Boolean(admin));
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) setTimeout(() => void loadProfile(session.user.id), 0);
      else {
        setProfile(null);
        setIsAdmin(false);
      }
    });
    supabase.auth.getSession().then(async ({ data }) => {
      setUser(data.session?.user ?? null);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const refresh = useCallback(() => (user ? loadProfile(user.id) : Promise.resolve()), [user, loadProfile]);
  const signOut = useCallback(() => supabase.auth.signOut(), []);

  return { user, profile, isAdmin, loading, refresh, signOut };
}
