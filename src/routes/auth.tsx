import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Kredon" },
      { name: "description", content: "Acesse o painel de revenda ou o painel administrativo." },
      { property: "og:title", content: "Entrar — Kredon" },
      { property: "og:description", content: "Acesso ao painel de revendas e administração." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "A senha precisa ter ao menos 6 caracteres").max(72),
  name: z.string().trim().max(100).optional(),
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/painel" });
    });
  }, [navigate]);

  const validate = (withName: boolean) => {
    const parsed = schema.safeParse({ email, password, name: withName ? name : undefined });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return false;
    }
    return true;
  };

  async function signIn() {
    if (!validate(false)) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/painel" });
  }

  async function signUp() {
    if (!validate(true)) return;
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      toast.success("Conta criada. Confirme o e-mail para entrar.");
      return;
    }
    navigate({ to: "/painel" });
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Não foi possível entrar com o Google");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/painel" });
  }

  return (
    <div className="hero-bg flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="font-display text-lg font-bold">
          <span className="brand-text">Kredon</span>
        </Link>
        <div className="panel mt-4 p-6">
          <Tabs defaultValue="entrar">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="entrar">Entrar</TabsTrigger>
              <TabsTrigger value="criar">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="entrar" className="space-y-4 pt-5">
              <Field label="E-mail" value={email} onChange={setEmail} type="email" />
              <Field label="Senha" value={password} onChange={setPassword} type="password" />
              <Button className="w-full" disabled={loading} onClick={signIn}>
                Entrar
              </Button>
              <Button asChild variant="link" className="h-auto w-full p-0 text-xs">
                <Link to="/esqueci-senha">Esqueci minha senha</Link>
              </Button>
            </TabsContent>

            <TabsContent value="criar" className="space-y-4 pt-5">
              <Field label="Nome" value={name} onChange={setName} />
              <Field label="E-mail" value={email} onChange={setEmail} type="email" />
              <Field label="Senha" value={password} onChange={setPassword} type="password" />
              <Button className="w-full" disabled={loading} onClick={signUp}>
                Criar conta
              </Button>
              <p className="text-xs text-muted-foreground">
                Use o mesmo e-mail cadastrado pelo administrador para acessar sua revenda.
              </p>
            </TabsContent>
          </Tabs>

          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" className="w-full" onClick={google}>
            Continuar com Google
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
