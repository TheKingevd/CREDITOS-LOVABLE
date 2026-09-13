import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/esqueci-senha")({
  head: () => ({
    meta: [
      { title: "Recuperar senha — Kredon" },
      { name: "description", content: "Receba por e-mail o link para recuperar seu acesso." },
      { property: "og:title", content: "Recuperar senha — Kredon" },
      { property: "og:description", content: "Recupere seu acesso à plataforma Kredon." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    const parsed = z.string().trim().email("Informe um e-mail válido").max(255).safeParse(email);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Enviamos o link de recuperação para seu e-mail.");
  }

  return (
    <div className="hero-bg flex min-h-screen items-center justify-center px-5">
      <div className="panel w-full max-w-md p-6">
        <h1 className="text-2xl font-bold">Recuperar senha</h1>
        <p className="mt-2 text-sm text-muted-foreground">Informe o e-mail usado no seu acesso.</p>
        <div className="mt-5 space-y-2">
          <Label>E-mail</Label>
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <Button className="mt-4 w-full" disabled={loading} onClick={submit}>
          Enviar link
        </Button>
        <Button asChild variant="link" className="mt-2 w-full">
          <Link to="/auth">Voltar para entrar</Link>
        </Button>
      </div>
    </div>
  );
}