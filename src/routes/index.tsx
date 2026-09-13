import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, Sparkles, Store, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { brl, effectivePriceCents } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kredon — Compre e revenda créditos" },
      {
        name: "description",
        content:
          "Planos de créditos com preços e promoções gerenciados pelo administrador, PDV para revendas e controle de comissões.",
      },
      { property: "og:title", content: "Kredon — Compre e revenda créditos" },
      {
        property: "og:description",
        content: "Planos de créditos, painel de revendas com PDV e comissões.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const { data: plans } = useQuery({
    queryKey: ["public-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <span className="font-display text-lg font-bold">
            <span className="brand-text">Kredon</span>
          </span>
          <nav className="flex items-center gap-2">
            <a
              href="#planos"
              className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Planos
            </a>
            <Button asChild size="sm">
              <Link to="/auth">Entrar</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero-bg">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
            <Badge variant="secondary" className="mb-5">
              <Sparkles className="mr-1 size-3" /> Rede de revendas de créditos
            </Badge>
            <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">
              Venda créditos com <span className="brand-text">preço, promoção e comissão</span> sob
              seu controle
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
              O administrador cadastra revendas, define os planos e libera créditos. A revenda vende
              pelo PDV e acompanha comissões em tempo real.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth">Acessar painel</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#planos">Ver planos</a>
              </Button>
            </div>

            <div className="mt-14 grid gap-4 sm:grid-cols-3">
              {[
                { icon: Store, title: "PDV da revenda", text: "Registre a venda em segundos e desconte os créditos automaticamente." },
                { icon: ShieldCheck, title: "Painel do administrador", text: "Cadastre revendas, ajuste comissões e adicione créditos." },
                { icon: Sparkles, title: "Planos flexíveis", text: "Preço, promoção e destaque definidos manualmente por você." },
              ].map((f) => (
                <div key={f.title} className="panel p-5">
                  <f.icon className="size-5 text-primary" />
                  <h3 className="mt-3 text-base font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="planos" className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-3xl font-bold sm:text-4xl">Planos de créditos</h2>
          <p className="mt-2 text-muted-foreground">
            Valores e promoções gerenciados no painel do administrador.
          </p>

          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {(plans ?? []).map((plan) => {
              const price = effectivePriceCents(plan);
              const hasPromo = plan.promo_price_cents != null;
              return (
                <div
                  key={plan.id}
                  className={`panel flex flex-col p-6 ${plan.highlight ? "glow" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <img
                        src="/lovable-color.svg"
                        alt="Lovable"
                        className="size-5 shrink-0"
                      />
                      <h3 className="truncate text-xl font-semibold">{plan.name}</h3>
                    </div>
                    {hasPromo && (
                      <Badge className="bg-accent text-accent-foreground">
                        {plan.promo_label || "Promoção"}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                  <div className="mt-5 flex items-end gap-2">
                    <span className="font-display text-3xl font-bold">{brl(price)}</span>
                    {hasPromo && (
                      <span className="pb-1 text-sm text-muted-foreground line-through">
                        {brl(plan.price_cents)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-primary">{plan.credits} créditos</p>
                  <ul className="mt-5 space-y-2 text-sm">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span className="text-muted-foreground">{feat}</span>
                      </li>
                    ))}
                  </ul>
                  <Button asChild className="mt-6" variant={plan.highlight ? "default" : "outline"}>
                    <Link to="/auth">Comprar com uma revenda</Link>
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto max-w-6xl px-5 text-sm text-muted-foreground">
          Kredon — plataforma independente de venda de créditos. Não possui vínculo oficial com
          outras marcas.
        </div>
      </footer>
    </div>
  );
}
