import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Reseller = {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  document: string | null;
  commission_pct: number;
  credits_balance: number;
  active: boolean;
  created_at: string;
};

export function useAccount() {
  return useQuery({
    queryKey: ["account"],
    queryFn: async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const user = userData.user;
      if (!user) return { user: null, isAdmin: false, reseller: null as Reseller | null };

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: user.id,
        email: user.email ?? null,
        full_name: (user.user_metadata?.["full_name"] as string) ?? null,
      });
      if (profileError) throw profileError;

      const { error: linkError } = await supabase.rpc("link_reseller_account");
      if (linkError) throw linkError;

      const [{ data: roles, error: rolesError }, { data: reseller, error: resellerError }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("resellers").select("*").eq("user_id", user.id).maybeSingle(),
      ]);
      if (rolesError) throw rolesError;
      if (resellerError) throw resellerError;

      return {
        user,
        isAdmin: (roles ?? []).some((r) => r.role === "admin"),
        reseller: (reseller as Reseller | null) ?? null,
      };
    },
  });
}
