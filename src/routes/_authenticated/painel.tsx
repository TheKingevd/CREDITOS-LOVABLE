import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/hooks/useAccount";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brl, effectivePriceCents, formatDate, parseBrlToCents } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel da revenda — Kredon" },
      { name: "description", content: "PDV, saldo de créditos, vendas e comissões da revenda." },
      { property: "og:title", content: "Painel da revenda — Kredon" },
      { property: "og:description", content: "PDV e controle de créditos da revenda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PainelPage,
});

const saleSchema = z.object({
  customer_name: z.string().trim().min(2, "Informe o nome do cliente").max(100),
  customer_email: z.string().trim().email("E-mail inválido").max(255).or(z.literal("")),
  customer_phone: z.string().trim().max(30),
  note: z.string().trim().max(300),
});

function PainelPage() {
  const { data: account, isLoading } = useAccount();
  const reseller = account?.reseller ?? null;

  if (isLoading) {
    return (
      <AppShell title="Painel da revenda">
        <p className="text-muted-foreground">Carregando…</p>
      </AppShell>
    );
  }

  if (!reseller) {
    return (
      <AppShell title="Painel da revenda">
        <NoReseller isAdmin={!!account?.isAdmin} />
      </AppShell>
    );
  }

  return (
    <AppShell title={`Revenda ${reseller.name}`}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Saldo de créditos" value={String(reseller.credits_balance)} highlight />
        <Stat label="Comissão" value={`${reseller.commission_pct}%`} />
        <Stat label="Situação" value={reseller.active ? "Ativa" : "Inativa"} />
      </div>

      {!reseller.active && (
        <div className="panel mt-6 border-destructive/40 p-5">
          <h2 className="font-semibold">Revenda inativa</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            O registro de vendas está bloqueado. Fale com o administrador para reativar seu acesso.
          </p>
        </div>
      )}

      <Tabs defaultValue={reseller.active ? "pdv" : "vendas"} className="mt-8">
        <TabsList>
          <TabsTrigger value="pdv">PDV</TabsTrigger>
          <TabsTrigger value="vendas">Minhas vendas</TabsTrigger>
          <TabsTrigger value="creditos">Créditos</TabsTrigger>
        </TabsList>
        <TabsContent value="pdv" className="pt-6">
          <Pdv resellerId={reseller.id} commission={reseller.commission_pct} active={reseller.active} />
        </TabsContent>
        <TabsContent value="vendas" className="pt-6">
          <MySales resellerId={reseller.id} />
        </TabsContent>
        <TabsContent value="creditos" className="pt-6">
          <MyCredits resellerId={reseller.id} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function NoReseller({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const claim = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("claim_admin");
      if (error) throw error;
      return data;
    },
    onSuccess: (ok) => {
      if (ok) {
        toast.success("Você agora é o administrador.");
        queryClient.invalidateQueries();
      } else {
        toast.error("Já existe um administrador nesta plataforma.");
      }
    },
    onError: () => toast.error("Não foi possível concluir"),
  });

  return (
    <div className="panel max-w-xl p-6">
      <h2 className="text-lg font-semibold">Nenhuma revenda vinculada a este e-mail</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Peça ao administrador para cadastrar sua revenda com este mesmo e-mail. Assim que o cadastro
        existir, o painel é liberado automaticamente.
      </p>
      {!isAdmin && (
        <Button className="mt-5" variant="outline" onClick={() => claim.mutate()}>
          Sou o dono da plataforma
        </Button>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`panel p-5 ${highlight ? "glow" : ""}`}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold">{value}</p>
    </div>
  );
}

function Pdv({ resellerId, commission, active }: { resellerId: string; commission: number; active: boolean }) {
  const queryClient = useQueryClient();
  const [planId, setPlanId] = useState<string>("");
  const [price, setPrice] = useState("");
  const [credits, setCredits] = useState("0");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [method, setMethod] = useState("pix");
  const [note, setNote] = useState("");

  const { data: plans } = useQuery({
    queryKey: ["plans", "active"],
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

  const selected = useMemo(() => plans?.find((p) => p.id === planId), [plans, planId]);
  const amountCents = parseBrlToCents(price);
  const commissionCents = Math.round((amountCents * Number(commission)) / 100);

  function pickPlan(id: string) {
    setPlanId(id);
    const plan = plans?.find((p) => p.id === id);
    if (plan) {
      setPrice((effectivePriceCents(plan) / 100).toFixed(2).replace(".", ","));
      setCredits(String(plan.credits));
    }
  }

  const sell = useMutation({
    mutationFn: async () => {
      const parsed = saleSchema.safeParse({
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        note,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      if (!selected) throw new Error("Escolha um plano");

      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("sales").insert({
        reseller_id: resellerId,
        plan_id: selected.id,
        plan_name: selected.name,
        customer_name: parsed.data.customer_name,
        customer_email: parsed.data.customer_email || null,
        customer_phone: parsed.data.customer_phone || null,
        credits: Number(credits) || 0,
        amount_cents: amountCents,
        commission_cents: commissionCents,
        payment_method: method,
        note: parsed.data.note || null,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Venda registrada");
      setCustomerName("");
      setCustomerEmail("");
      setCustomerPhone("");
      setNote("");
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="panel space-y-4 p-6">
        <h2 className="text-lg font-semibold">Nova venda</h2>
        <div className="space-y-2">
          <Label>Plano</Label>
          <Select value={planId} onValueChange={pickPlan}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o plano" />
            </SelectTrigger>
            <SelectContent>
              {(plans ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} — {p.credits} créditos — {brl(effectivePriceCents(p))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Créditos</Label>
            <Input value={credits} readOnly aria-readonly="true" />
          </div>
          <div className="space-y-2">
            <Label>Valor cobrado (R$)</Label>
            <Input value={price} readOnly aria-readonly="true" />
          </div>
          <div className="space-y-2">
            <Label>Cliente</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>E-mail do cliente</Label>
            <Input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Forma de pagamento</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pix">Pix</SelectItem>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                <SelectItem value="cartao_credito">Cartão de crédito</SelectItem>
                <SelectItem value="cartao_debito">Cartão de débito</SelectItem>
                <SelectItem value="transferencia">Transferência</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Observação</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </div>
        <Button className="w-full" disabled={!active || !selected || sell.isPending} onClick={() => sell.mutate()}>
          {active ? "Registrar venda" : "Revenda inativa"}
        </Button>
      </div>

      <div className="panel h-fit space-y-3 p-6">
        <h2 className="text-lg font-semibold">Resumo</h2>
        <Row label="Plano" value={selected?.name ?? "—"} />
        <Row label="Créditos" value={credits || "0"} />
        <Row label="Valor" value={brl(amountCents)} />
        <Row label={`Sua comissão (${commission}%)`} value={brl(commissionCents)} />
        <p className="pt-2 text-xs text-muted-foreground">
          Os créditos são descontados do saldo da revenda assim que a venda é registrada.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 pb-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function MySales({ resellerId }: { resellerId: string }) {
  const { data } = useQuery({
    queryKey: ["sales", resellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("reseller_id", resellerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const total = (data ?? []).reduce((acc, s) => acc + s.amount_cents, 0);
  const commission = (data ?? []).reduce((acc, s) => acc + s.commission_cents, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Vendas" value={String(data?.length ?? 0)} />
        <Stat label="Faturamento" value={brl(total)} />
        <Stat label="Comissões" value={brl(commission)} />
      </div>
      <div className="panel divide-y divide-border/60">
        {(data ?? []).map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <div>
              <p className="font-medium">
                {s.customer_name} · {s.plan_name}
              </p>
              <p className="text-muted-foreground">
                {formatDate(s.created_at)} · {s.credits} créditos · {s.payment_method}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{brl(s.amount_cents)}</p>
              <p className="text-xs text-muted-foreground">
                comissão {brl(s.commission_cents)}
              </p>
            </div>
          </div>
        ))}
        {!data?.length && <p className="p-4 text-sm text-muted-foreground">Nenhuma venda ainda.</p>}
      </div>
    </div>
  );
}

function MyCredits({ resellerId }: { resellerId: string }) {
  const { data } = useQuery({
    queryKey: ["movements", resellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_movements")
        .select("*")
        .eq("reseller_id", resellerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="panel divide-y divide-border/60">
      {(data ?? []).map((m) => (
        <div key={m.id} className="flex items-center justify-between gap-3 p-4 text-sm">
          <div>
            <p className="font-medium capitalize">{m.reason}</p>
            <p className="text-muted-foreground">
              {formatDate(m.created_at)} {m.note ? `· ${m.note}` : ""}
            </p>
          </div>
          <Badge variant={m.delta >= 0 ? "default" : "secondary"}>
            {m.delta >= 0 ? "+" : ""}
            {m.delta}
          </Badge>
        </div>
      ))}
      {!data?.length && (
        <p className="p-4 text-sm text-muted-foreground">Nenhum movimento de crédito.</p>
      )}
    </div>
  );
}
