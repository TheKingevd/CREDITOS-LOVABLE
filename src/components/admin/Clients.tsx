import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, UserRound } from "lucide-react";

import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { brl, formatDate } from "@/lib/format";

type Sale = Tables<"sales"> & { resellers: { name: string } | null };

type ClientGroup = {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  sales: Sale[];
};

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

function clientKey(sale: Sale) {
  const email = normalize(sale.customer_email);
  if (email) return `email:${email}`;
  const phone = sale.customer_phone?.replace(/\D/g, "") || "";
  if (phone) return `phone:${phone}`;
  return `name:${normalize(sale.customer_name)}`;
}

export function Clients() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ClientGroup | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*, resellers(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Sale[];
    },
  });

  const clients = useMemo(() => {
    const map = new Map<string, ClientGroup>();
    for (const sale of data ?? []) {
      const key = clientKey(sale);
      const current = map.get(key);
      if (current) {
        current.sales.push(sale);
      } else {
        map.set(key, {
          key,
          name: sale.customer_name,
          email: sale.customer_email,
          phone: sale.customer_phone,
          sales: [sale],
        });
      }
    }
    return [...map.values()];
  }, [data]);

  const filtered = useMemo(() => {
    const term = normalize(search);
    if (!term) return clients;
    const digits = term.replace(/\D/g, "");
    return clients.filter((client) => {
      const haystack = [
        client.name,
        client.email,
        client.phone,
        ...client.sales.map((sale) => sale.resellers?.name),
      ].map(normalize);
      const digitMatch = digits.length > 0 && [client.phone, ...client.sales.map((sale) => sale.customer_phone)].some((value) => (value || "").replace(/\D/g, "").includes(digits));
      return haystack.some((value) => value.includes(term)) || digitMatch;
    });
  }, [clients, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Clientes</h2>
          <p className="mt-1 text-sm text-muted-foreground">Clientes formados a partir das vendas existentes, sem criar cadastros duplicados.</p>
        </div>
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, e-mail, telefone ou revenda" className="pl-9" />
        </div>
      </div>

      {isLoading && <div className="panel p-6 text-sm text-muted-foreground">Carregando clientes…</div>}
      {error && <div className="panel border-destructive/40 p-6 text-sm text-destructive">Não foi possível carregar os clientes.</div>}

      {!isLoading && !error && (
        <div className="panel divide-y divide-border/60 overflow-hidden">
          {filtered.map((client) => {
            const paidSales = client.sales.filter((sale) => sale.status === "pago");
            const purchases = paidSales.reduce((sum, sale) => sum + sale.amount_cents, 0);
            const credits = paidSales.reduce((sum, sale) => sum + sale.credits, 0);
            const commissions = paidSales.reduce((sum, sale) => sum + sale.commission_cents, 0);
            return (
              <button key={client.key} type="button" onClick={() => setSelected(client)} className="block w-full p-4 text-left transition-colors hover:bg-muted/40">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 rounded-full border p-2"><UserRound className="size-4" /></div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{client.name}</p>
                      <p className="truncate text-sm text-muted-foreground">{client.email || "Sem e-mail"}{client.phone ? ` · ${client.phone}` : ""}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{client.sales.length} venda(s) registrada(s)</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-right text-sm">
                    <div><p className="text-muted-foreground">Compras</p><p className="font-semibold">{brl(purchases)}</p></div>
                    <div><p className="text-muted-foreground">Créditos</p><p className="font-semibold">{credits}</p></div>
                    <div><p className="text-muted-foreground">Comissões</p><p className="font-semibold">{brl(commissions)}</p></div>
                  </div>
                </div>
              </button>
            );
          })}
          {!filtered.length && <p className="p-6 text-sm text-muted-foreground">{clients.length ? "Nenhum cliente corresponde à busca." : "Nenhuma venda registrada para formar a lista de clientes."}</p>}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>{selected?.email || "Sem e-mail"}{selected?.phone ? ` · ${selected.phone}` : ""}</DialogDescription>
          </DialogHeader>
          {selected && <ClientDetails client={selected} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClientDetails({ client }: { client: ClientGroup }) {
  const paidSales = client.sales.filter((sale) => sale.status === "pago");
  const purchases = paidSales.reduce((sum, sale) => sum + sale.amount_cents, 0);
  const credits = paidSales.reduce((sum, sale) => sum + sale.credits, 0);
  const commissions = paidSales.reduce((sum, sale) => sum + sale.commission_cents, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Total de compras" value={brl(purchases)} />
        <Metric label="Créditos" value={String(credits)} />
        <Metric label="Comissões" value={brl(commissions)} />
      </div>
      <div className="space-y-3">
        <h3 className="font-semibold">Histórico de vendas</h3>
        <div className="divide-y divide-border/60 rounded-lg border">
          {client.sales.map((sale) => (
            <div key={sale.id} className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{sale.plan_name}</p>
                <p className="text-muted-foreground">{sale.resellers?.name || "Revenda"} · {formatDate(sale.created_at)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{sale.payment_method} · {sale.credits} créditos</p>
              </div>
              <div className="text-left sm:text-right">
                <p className="font-semibold">{brl(sale.amount_cents)}</p>
                <div className="mt-1 flex flex-wrap gap-2 sm:justify-end"><Badge variant={sale.status === "pago" ? "default" : "secondary"}>{sale.status}</Badge><span className="text-xs text-muted-foreground">comissão {brl(sale.commission_cents)}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>;
}
