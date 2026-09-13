import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/hooks/useAccount";

export function AppShell({ title, children }: { title: string; children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: account } = useAccount();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-card/40">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-4">
            <Link to="/" className="font-display text-lg font-bold">
              <span className="brand-text">Kredon</span>
            </Link>
            <nav className="flex gap-1">
              <Link
                to="/painel"
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: "rounded-md px-3 py-1.5 text-sm text-foreground bg-secondary" }}
              >
                Revenda
              </Link>
              {account?.isAdmin && (
                <Link
                  to="/admin"
                  className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  activeProps={{ className: "rounded-md px-3 py-1.5 text-sm text-foreground bg-secondary" }}
                >
                  Administração
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:block">
              {account?.user?.email}
            </span>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="mr-1 size-4" /> Sair
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
