export function brl(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function parseBrlToCents(input: string): number {
  const clean = input.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(clean);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

export type PlanLike = {
  price_cents: number;
  promo_price_cents: number | null;
};

export function effectivePriceCents(plan: PlanLike): number {
  return plan.promo_price_cents != null && plan.promo_price_cents >= 0
    ? plan.promo_price_cents
    : plan.price_cents;
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
