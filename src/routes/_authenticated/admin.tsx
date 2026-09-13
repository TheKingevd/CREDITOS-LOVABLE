import { useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, Plus, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/hooks/useAccount";
import { AppShell } from "@/components/AppShell";
import { Clients } from "@/components/admin/Clients";
import { PixManagement } from "@/components/admin/PixManagement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { brl, formatDate, parseBrlToCents } from "@/lib/format";

type Plan = Tables<"plans">;
type Reseller = Tables<"resellers">;

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [
    { title: "Administração — Kredon" },
    { name: "description", content: "Gerencie planos, promoções, revendas, clientes, Pix e comissões." },
    { property: "og:title", content: "Administração — Kredon" },
    { property: "og:description", content: "Gestão completa da plataforma de créditos Kredon." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: AdminPage,
});

function AdminPage() {
  const { data: account, isLoading } = useAccount();
  if (isLoading) return <AppShell title="Administração"><p className="text-muted-foreground">Carregando…</p></AppShell>;
  if (!account?.isAdmin) return <Navigate to="/painel" replace />;

  return <AppShell title="Administração">
    <AdminSummary />
    <Tabs defaultValue="planos" className="mt-8">
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger value="revendas">Revendas</TabsTrigger>
        <TabsTrigger value="planos">Planos e promoções</TabsTrigger>
        <TabsTrigger value="vendas">Todas as vendas</TabsTrigger>
        <TabsTrigger value="clientes">Clientes</TabsTrigger>
        <TabsTrigger value="pix">Pix / Asaas</TabsTrigger>
      </TabsList>
      <TabsContent value="revendas" className="pt-6"><Resellers /></TabsContent>
      <TabsContent value="planos" className="pt-6"><Plans /></TabsContent>
      <TabsContent value="vendas" className="pt-6"><AllSales /></TabsContent>
      <TabsContent value="clientes" className="pt-6"><Clients /></TabsContent>
      <TabsContent value="pix" className="pt-6"><PixManagement /></TabsContent>
    </Tabs>
  </AppShell>;
}

function AdminSummary() {
  const { data } = useQuery({ queryKey: ["admin-summary"], queryFn: async () => {
    const [{ data: resellers }, { data: sales }] = await Promise.all([
      supabase.from("resellers").select("id, active, credits_balance"),
      supabase.from("sales").select("amount_cents, commission_cents"),
    ]);
    return { resellers: resellers ?? [], sales: sales ?? [] };
  }});
  const salesTotal = data?.sales.reduce((sum, sale) => sum + sale.amount_cents, 0) ?? 0;
  const commissions = data?.sales.reduce((sum, sale) => sum + sale.commission_cents, 0) ?? 0;
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <Metric label="Revendas ativas" value={String(data?.resellers.filter((r) => r.active).length ?? 0)} />
    <Metric label="Créditos nas revendas" value={String(data?.resellers.reduce((sum, r) => sum + r.credits_balance, 0) ?? 0)} />
    <Metric label="Vendas registradas" value={brl(salesTotal)} />
    <Metric label="Comissões" value={brl(commissions)} />
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="panel p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl font-bold">{value}</p></div>;
}

const resellerSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(100),
  email: z.string().trim().email("E-mail inválido").max(255),
  phone: z.string().trim().max(30),
  document: z.string().trim().max(30),
  commission: z.coerce.number().min(0).max(100),
});

function Resellers() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [creditTarget, setCreditTarget] = useState<Reseller | null>(null);
  const [credits, setCredits] = useState("");
  const [note, setNote] = useState("");
  const { data } = useQuery({ queryKey: ["admin-resellers"], queryFn: async () => {
    const { data, error } = await supabase.from("resellers").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }});

  const addCredits = useMutation({
    mutationFn: async () => {
      if (!creditTarget) throw new Error("Escolha a revenda");
      const delta = z.coerce.number().int().refine((value) => value !== 0, "Informe uma quantidade diferente de zero").parse(credits);
      const { error } = await supabase.rpc("admin_adjust_credits_secure", { p_reseller_id: creditTarget.id, p_delta: delta, p_reason: delta > 0 ? "carga" : "ajuste", p_note: note.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saldo atualizado"); setCreditTarget(null); setCredits(""); setNote(""); queryClient.invalidateQueries(); },
    onError: (error: Error) => toast.error(error.message),
  });

  async function toggle(reseller: Reseller) {
    const { error } = await supabase.from("resellers").update({ active: !reseller.active, updated_at: new Date().toISOString() }).eq("id", reseller.id);
    if (error) { toast.error(error.message); return; }
    queryClient.invalidateQueries();
  }

  return <div className="space-y-4">
    <div className="flex justify-end"><Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-1 size-4" />Nova revenda</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Cadastrar revenda</DialogTitle><DialogDescription>O revendedor deve criar a conta usando exatamente este e-mail.</DialogDescription></DialogHeader><ResellerForm onDone={() => { setOpen(false); queryClient.invalidateQueries(); }} /></DialogContent></Dialog></div>
    <div className="panel divide-y divide-border/60 overflow-hidden">{(data ?? []).map((reseller) => <div key={reseller.id} className="flex flex-wrap items-center justify-between gap-4 p-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium">{reseller.name}</p><Badge variant={reseller.active ? "default" : "secondary"}>{reseller.active ? "Ativa" : "Inativa"}</Badge><Badge variant="outline">{reseller.user_id ? "Conta vinculada" : "Aguardando cadastro"}</Badge></div><p className="truncate text-sm text-muted-foreground">{reseller.email} · comissão {reseller.commission_pct}%</p></div><div className="flex flex-wrap items-center gap-2"><span className="mr-2 font-display text-xl font-semibold">{reseller.credits_balance} créditos</span><Button size="sm" variant="outline" onClick={() => setCreditTarget(reseller)}><WalletCards className="mr-1 size-4" />Créditos</Button><Button size="sm" variant="outline" onClick={() => toggle(reseller)}>{reseller.active ? "Desativar" : "Ativar"}</Button></div></div>)}{!data?.length && <p className="p-4 text-sm text-muted-foreground">Nenhuma revenda cadastrada.</p>}</div>
    <Dialog open={!!creditTarget} onOpenChange={(value) => !value && setCreditTarget(null)}><DialogContent><DialogHeader><DialogTitle>Ajustar créditos</DialogTitle><DialogDescription>{creditTarget?.name} possui {creditTarget?.credits_balance} créditos. Use valor negativo para retirar.</DialogDescription></DialogHeader><div className="space-y-4"><Field label="Quantidade" value={credits} onChange={setCredits} type="number" /><div className="space-y-2"><Label>Motivo</Label><Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} /></div><Button className="w-full" disabled={addCredits.isPending} onClick={() => addCredits.mutate()}>Confirmar ajuste</Button></div></DialogContent></Dialog>
  </div>;
}

function ResellerForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [phone, setPhone] = useState(""); const [document, setDocument] = useState(""); const [commission, setCommission] = useState("10");
  const save = useMutation({ mutationFn: async () => { const input = resellerSchema.parse({ name, email, phone, document, commission }); const { error } = await supabase.from("resellers").insert({ name: input.name, email: input.email.toLowerCase(), phone: input.phone || null, document: input.document || null, commission_pct: input.commission }); if (error) throw error; }, onSuccess: () => { toast.success("Revenda cadastrada"); onDone(); }, onError: (error: Error) => toast.error(error.message) });
  return <div className="grid gap-4 sm:grid-cols-2"><Field label="Nome" value={name} onChange={setName} /><Field label="E-mail" value={email} onChange={setEmail} type="email" /><Field label="Telefone" value={phone} onChange={setPhone} /><Field label="CPF/CNPJ" value={document} onChange={setDocument} /><Field label="Comissão (%)" value={commission} onChange={setCommission} type="number" /><Button className="self-end" onClick={() => save.mutate()} disabled={save.isPending}>Cadastrar</Button></div>;
}

const planSchema = z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().max(240), credits: z.coerce.number().int().min(0), price: z.string().max(30), promoPrice: z.string().max(30), promoLabel: z.string().trim().max(40), features: z.string().max(800), sortOrder: z.coerce.number().int().min(0).max(999) });

function Plans() {
  const queryClient = useQueryClient(); const [editing, setEditing] = useState<Plan | null>(null); const [creating, setCreating] = useState(false);
  const { data } = useQuery({ queryKey: ["admin-plans"], queryFn: async () => { const { data, error } = await supabase.from("plans").select("*").order("sort_order"); if (error) throw error; return data; } });
  async function toggle(plan: Plan, field: "active" | "highlight") { const update = field === "active" ? { active: !plan.active, updated_at: new Date().toISOString() } : { highlight: !plan.highlight, updated_at: new Date().toISOString() }; const { error } = await supabase.from("plans").update(update).eq("id", plan.id); if (error) { toast.error(error.message); return; } queryClient.invalidateQueries(); }
  return <div className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">Valores dos planos</h2><p className="mt-1 text-sm text-muted-foreground">Todos os planos podem ter nome, créditos, preço, promoção e benefícios alterados.</p></div><Button onClick={() => setCreating(true)}><Plus className="mr-1 size-4" />Novo plano</Button></div><div className="grid gap-4 lg:grid-cols-2">{(data ?? []).map((plan) => <div key={plan.id} className="panel p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{plan.name}</h3><p className="text-sm text-muted-foreground">{plan.credits} créditos · {brl(plan.price_cents)}{plan.promo_price_cents != null ? ` → ${brl(plan.promo_price_cents)}` : ""}</p></div><Button size="icon" variant="outline" title={`Editar ${plan.name}`} aria-label={`Editar ${plan.name}`} onClick={() => setEditing(plan)}><Edit3 className="size-4" /></Button></div><div className="mt-4 flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><Switch checked={plan.active} onCheckedChange={() => toggle(plan, "active")} />Ativo</label><label className="flex items-center gap-2"><Switch checked={plan.highlight} onCheckedChange={() => toggle(plan, "highlight")} />Destaque</label></div></div>)}</div><Dialog open={creating || !!editing} onOpenChange={(value) => { if (!value) { setCreating(false); setEditing(null); } }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editing ? `Editar ${editing.name}` : "Novo plano"}</DialogTitle><DialogDescription>Defina os créditos, valor, promoção e recursos exibidos na loja.</DialogDescription></DialogHeader><PlanForm plan={editing} onDone={() => { setCreating(false); setEditing(null); queryClient.invalidateQueries(); }} /></DialogContent></Dialog></div>;
}

function PlanForm({ plan, onDone }: { plan: Plan | null; onDone: () => void }) {
  const [name, setName] = useState(plan?.name ?? ""); const [description, setDescription] = useState(plan?.description ?? ""); const [credits, setCredits] = useState(String(plan?.credits ?? 100)); const [price, setPrice] = useState(plan ? (plan.price_cents / 100).toFixed(2).replace(".", ",") : ""); const [promoPrice, setPromoPrice] = useState(plan?.promo_price_cents != null ? (plan.promo_price_cents / 100).toFixed(2).replace(".", ",") : ""); const [promoLabel, setPromoLabel] = useState(plan?.promo_label ?? ""); const [features, setFeatures] = useState(plan?.features.join("\n") ?? ""); const [sortOrder, setSortOrder] = useState(String(plan?.sort_order ?? 10));
  const save = useMutation({ mutationFn: async () => { const input = planSchema.parse({ name, description, credits, price, promoPrice, promoLabel, features, sortOrder }); const payload = { name: input.name, description: input.description || null, credits: input.credits, price_cents: parseBrlToCents(input.price), promo_price_cents: input.promoPrice.trim() ? parseBrlToCents(input.promoPrice) : null, promo_label: input.promoLabel || null, features: input.features.split("\n").map((feature) => feature.trim()).filter(Boolean), sort_order: input.sortOrder, updated_at: new Date().toISOString() }; const query = plan ? supabase.from("plans").update(payload).eq("id", plan.id) : supabase.from("plans").insert(payload); const { error } = await query; if (error) throw error; }, onSuccess: () => { toast.success("Plano salvo"); onDone(); }, onError: (error: Error) => toast.error(error.message) });
  return <div className="grid gap-4 sm:grid-cols-2"><Field label="Nome do plano" value={name} onChange={setName} /><Field label="Créditos" value={credits} onChange={setCredits} type="number" /><Field label="Preço (R$)" value={price} onChange={setPrice} /><Field label="Preço promocional (R$)" value={promoPrice} onChange={setPromoPrice} /><Field label="Etiqueta da promoção" value={promoLabel} onChange={setPromoLabel} /><Field label="Ordem" value={sortOrder} onChange={setSortOrder} type="number" /><div className="space-y-2 sm:col-span-2"><Label>Descrição</Label><Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={240} /></div><div className="space-y-2 sm:col-span-2"><Label>Recursos (um por linha)</Label><Textarea value={features} onChange={(event) => setFeatures(event.target.value)} rows={5} maxLength={800} /></div><Button className="sm:col-span-2" disabled={save.isPending} onClick={() => save.mutate()}>Salvar plano</Button></div>;
}

function AllSales() {
  const { data } = useQuery({ queryKey: ["admin-sales"], queryFn: async () => { const { data, error } = await supabase.from("sales").select("*, resellers(name)").order("created_at", { ascending: false }); if (error) throw error; return data; } });
  return <div className="panel divide-y divide-border/60">{(data ?? []).map((sale) => <div key={sale.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><div><p className="font-medium">{sale.customer_name} · {sale.plan_name}</p><p className="text-muted-foreground">{sale.resellers?.name ?? "Revenda"} · {formatDate(sale.created_at)} · {sale.credits} créditos · {sale.status}</p></div><div className="text-right"><p className="font-semibold">{brl(sale.amount_cents)}</p><p className="text-xs text-muted-foreground">comissão {brl(sale.commission_cents)}</p></div></div>)}{!data?.length && <p className="p-4 text-sm text-muted-foreground">Nenhuma venda registrada.</p>}</div>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <div className="space-y-2"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
