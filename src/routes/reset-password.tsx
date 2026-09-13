import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nova senha — Kredon" },
      { name: "description", content: "Defina uma nova senha para sua conta Kredon." },
      { property: "og:title", content: "Nova senha — Kredon" },
      { property: "og:description", content: "Defina uma nova senha para sua conta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [validRecovery, setValidRecovery] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    setValidRecovery(hash.get("type") === "recovery" || hash.has("access_token"));
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setValidRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit() {
    const parsed = z.string().min(8, "Use ao menos 8 caracteres").max(72).safeParse(password);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message);
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não são iguais");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: parsed.data });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Senha atualizada");
    navigate({ to: "/painel" });
  }

  return (
    <div className="hero-bg flex min-h-screen items-center justify-center px-5">
      <div className="panel w-full max-w-md p-6">
        <h1 className="text-2xl font-bold">Defina sua nova senha</h1>
        {!validRecovery ? (
          <p className="mt-3 text-sm text-muted-foreground">Abra esta página pelo link enviado ao seu e-mail.</p>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="space-y-2"><Label>Nova senha</Label><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
            <div className="space-y-2"><Label>Confirmar senha</Label><Input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></div>
            <Button className="w-full" onClick={submit}>Salvar nova senha</Button>
          </div>
        )}
      </div>
    </div>
  );
}