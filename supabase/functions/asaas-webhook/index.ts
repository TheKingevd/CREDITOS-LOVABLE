import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const expectedToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
  const receivedToken = request.headers.get("asaas-access-token");
  if (!expectedToken || !receivedToken || receivedToken !== expectedToken) {
    return json({ error: "Webhook não autorizado" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Supabase não configurado" }, 500);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const body = await request.json();
  const eventId = String(body.id || "");
  const event = String(body.event || "");
  const paymentId = String(body.payment?.id || "");

  if (!eventId || !paymentId) return json({ received: true });

  const { error: eventError } = await adminClient.from("asaas_webhook_events").insert({
    id: eventId,
    event,
    payload: body,
  });

  if (eventError?.code === "23505") return json({ received: true, duplicate: true });
  if (eventError) return json({ error: "Não foi possível registrar o evento" }, 500);

  const { data: integration } = await adminClient
    .from("asaas_payments")
    .select("id, sale_id, status")
    .eq("asaas_payment_id", paymentId)
    .maybeSingle();

  if (!integration) {
    await adminClient.from("asaas_webhook_events").update({ processed_at: new Date().toISOString() }).eq("id", eventId);
    return json({ received: true, ignored: true });
  }

  const paymentStatus = String(body.payment?.status || "");
  let internalStatus = paymentStatus;
  let saleStatus: string | null = null;

  switch (event) {
    case "PAYMENT_RECEIVED":
      internalStatus = "RECEIVED";
      saleStatus = "pago";
      break;
    case "PAYMENT_CONFIRMED":
      internalStatus = "CONFIRMED";
      // Para Pix, CONFIRMED pode ser temporário durante análise cautelar.
      break;
    case "PAYMENT_OVERDUE":
      internalStatus = "OVERDUE";
      saleStatus = "vencido";
      break;
    case "PAYMENT_DELETED":
      internalStatus = "DELETED";
      saleStatus = "cancelado";
      break;
    case "PAYMENT_REFUNDED":
      internalStatus = "REFUNDED";
      saleStatus = "estornado";
      break;
    default:
      internalStatus = paymentStatus || event;
  }

  const now = new Date().toISOString();
  const paymentUpdate: Record<string, unknown> = {
    status: internalStatus,
    updated_at: now,
  };
  if (event === "PAYMENT_RECEIVED") paymentUpdate.paid_at = now;

  const { error: paymentError } = await adminClient
    .from("asaas_payments")
    .update(paymentUpdate)
    .eq("id", integration.id);
  if (paymentError) return json({ error: "Falha ao atualizar pagamento" }, 500);

  if (saleStatus) {
    const { error: saleError } = await adminClient
      .from("sales")
      .update({ status: saleStatus })
      .eq("id", integration.sale_id);
    if (saleError) return json({ error: "Falha ao atualizar venda" }, 500);
  }

  await adminClient
    .from("asaas_webhook_events")
    .update({ processed_at: now })
    .eq("id", eventId);

  return json({ received: true });
});
