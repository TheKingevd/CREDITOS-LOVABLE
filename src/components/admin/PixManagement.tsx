import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Search, Settings2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { brl, formatDate } from "@/lib/format";

const db = supabase as any;

export function PixManagement() {
  const [search, setSearch] = useState("");
  const { data: payments, isLoading } = useQuery({
    queryKey: ["admin-pix-payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("asaas_payments").select("*, sales(id, customer_name, customer_email, customer_phone, plan_name, amount_cents, commission_cents, reseller_id, payment_method, status, created_at, resellers(name))").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const visible = (payments ?? []).filter((p) => {
    const sale = p.sales; const haystack = [sale?.customer_name, sale?.customer_email, sale?.customer_phone, sale?.plan_name, sale?.resellers?.name, p.asaas_payment_id, p.status].join(" ").toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });

  return <div className="space-y-6">
    <AsaasSettings />
    <div className="panel overflow-hidden"><div className="flex flex-col gap-3 border-b border-border/60 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold">Movimentações Pix</h2><p className="text-sm text-muted-foreground">Cobranças, status e valores recebidos pelo Asaas.</p></div><div className="relative w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Cliente, Pix, revenda…" value={search} onChange={(e) => setSearch(e.target.value)} /></div></div>
      {isLoading ? <p className="p-5 text-sm text-muted-foreground">Carregando…</p> : !visible.length ? <p className="p-5 text-sm text-muted-foreground">Nenhuma movimentação Pix encontrada.</p> : <div className="divide-y divide-border/60">{visible.map((payment) => { const sale = payment.sales; return <div key={payment.id} className="flex flex-col gap-3 p-5 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{sale?.customer_name ?? "Cliente"}</p><Badge variant={payment.status === "RECEIVED" || sale?.status === "pago" ? "default" : "secondary"}>{payment.status}</Badge><Badge variant="outline">{sale?.resellers?.name ?? "Revenda"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{sale?.plan_name ?? "Plano"} · {formatDate(payment.created_at)} · {payment.asaas_payment_id}</p></div><div className="text-left lg:text-right"><p className="font-semibold">{brl(sale?.amount_cents ?? 0)}</p><p className="text-xs text-muted-foreground">Comissão {brl(sale?.commission_cents ?? 0)} · {sale?.payment_method ?? "pix"}</p></div></div>; })}</div>}
    </div>
    <div className="panel p-5 text-sm text-muted-foreground"><div className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0" /><p>O painel não altera status financeiro diretamente. O estado de pagamento é autoridade do Asaas + webhook validado no backend; isso impede que alguém altere a resposta do navegador para liberar créditos.</p></div></div>
  </div>;
}

function AsaasSettings() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["admin-platform-settings"], queryFn: async () => { const { data, error } = await db.from("platform_settings").select("*").eq("id", true).single(); if (error) throw error; return data as { asaas_environment: string; asaas_webhook_enabled: boolean; asaas_webhook_url: string | null; asaas_webhook_events: string[] }; } });
  const [environment, setEnvironment] = useState<string | null>(null); const [enabled, setEnabled] = useState<boolean | null>(null); const [url, setUrl] = useState<string | null>(null); const [events, setEvents] = useState("");
  const env = environment ?? settings?.asaas_environment ?? "sandbox"; const webhookEnabled = enabled ?? settings?.asaas_webhook_enabled ?? false; const webhookUrl = url ?? settings?.asaas_webhook_url ?? ""; const eventText = events || (settings?.asaas_webhook_events ?? []).join("\n");
  const save = useMutation({ mutationFn: async () => { const parsedEvents = eventText.split("\n").map((v) => v.trim().toUpperCase()).filter(Boolean).slice(0, 30); const { error } = await db.rpc("admin_update_platform_settings", { p_environment: env, p_webhook_enabled: webhookEnabled, p_webhook_url: webhookUrl || null, p_webhook_events: parsedEvents }); if (error) throw error; }, onSuccess: () => { toast.success("Configurações do Asaas salvas"); queryClient.invalidateQueries({ queryKey: ["admin-platform-settings"] }); }, onError: (error: Error) => toast.error(error.message) });
  return <div className="panel p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex items-center gap-2"><Settings2 className="size-5" /><h2 className="text-lg font-semibold">Configuração do Pix / Asaas</h2></div><p className="mt-1 text-sm text-muted-foreground">Controle ambiente e Webhook pelo painel. A API Key permanece exclusivamente no backend.</p></div><Badge variant={env === "production" ? "default" : "secondary"}>{env === "production" ? "Produção" : "Sandbox"}</Badge></div><div className="mt-5 grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Ambiente Asaas</Label><Select value={env} onValueChange={setEnvironment}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sandbox">Sandbox</SelectItem><SelectItem value="production">Produção</SelectItem></SelectContent></Select></div><div className="flex items-center gap-3 rounded-lg border border-border/60 p-3"><Switch checked={webhookEnabled} onCheckedChange={setEnabled} /><div><p className="text-sm font-medium">Webhook ativo</p><p className="text-xs text-muted-foreground">Confirma pagamentos somente pelo backend.</p></div></div><div className="space-y-2 md:col-span-2"><Label>URL do Webhook</Label><Input value={webhookUrl} onChange={(e) => setUrl(e.target.value)} placeholder="https://.../functions/v1/asaas-webhook" /></div><div className="space-y-2 md:col-span-2"><Label>Eventos do Webhook (um por linha)</Label><Textarea rows={5} value={eventText} onChange={(e) => setEvents(e.target.value)} placeholder="PAYMENT_RECEIVED\nPAYMENT_CONFIRMED" /></div></div><div className="mt-4 flex flex-col gap-3 rounded-lg border border-border/60 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"><p className="text-muted-foreground">API Key: <strong className="text-foreground">não exposta ao navegador</strong>. Configure em Supabase Edge Function Secrets como <code>ASAAS_API_KEY</code>.</p><Button disabled={save.isPending} onClick={() => save.mutate()}><RefreshCw className="mr-2 size-4" />{save.isPending ? "Salvando…" : "Salvar configuração"}</Button></div></div>;
}
