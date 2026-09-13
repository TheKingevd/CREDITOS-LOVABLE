import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Método não permitido" }, 405);
  const expectedToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN"); const receivedToken = request.headers.get("asaas-access-token");
  if (!expectedToken || !receivedToken || receivedToken !== expectedToken) return json({ error: "Webhook não autorizado" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL"); const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Integração segura não configurada" }, 500);
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: settings } = await adminClient.from("platform_settings").select("asaas_environment").eq("id", true).maybeSingle();
  const environment = settings?.asaas_environment === "production" ? "production" : "sandbox";
  const asaasKey = Deno.env.get(environment === "production" ? "ASAAS_API_KEY_PRODUCTION" : "ASAAS_API_KEY_SANDBOX") || Deno.env.get("ASAAS_API_KEY");
  const asaasBaseUrl = environment === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
  if (!asaasKey) return json({ error: "Credencial Asaas não configurada" }, 500);

  let body: Record<string, any>; try { body = await request.json(); } catch { return json({ error: "Payload inválido" }, 400); }
  const eventId = String(body.id || ""); const event = String(body.event || ""); const paymentId = String(body.payment?.id || "");
  if (!eventId || eventId.length > 255 || !paymentId || paymentId.length > 100) return json({ received: true });

  const { error: eventError } = await adminClient.from("asaas_webhook_events").insert({ id: eventId, event, payload: body });
  if (eventError?.code === "23505") return json({ received: true, duplicate: true });
  if (eventError) return json({ error: "Não foi possível registrar o evento" }, 500);

  const { data: integration } = await adminClient.from("asaas_payments").select("id, sale_id, status").eq("asaas_payment_id", paymentId).maybeSingle();
  if (!integration) { await adminClient.from("asaas_webhook_events").update({ processed_at: new Date().toISOString() }).eq("id", eventId); return json({ received: true, ignored: true }); }

  const remoteResponse = await fetch(`${asaasBaseUrl}/payments/${encodeURIComponent(paymentId)}`, { headers: { accept: "application/json", access_token: asaasKey }, redirect: "error" });
  if (!remoteResponse.ok) { await adminClient.from("asaas_webhook_events").update({ processed_at: new Date().toISOString() }).eq("id", eventId); return json({ received: true, ignored: true }); }
  const remotePayment = await remoteResponse.json();
  const { data: sale } = await adminClient.from("sales").select("id, amount_cents, status").eq("id", integration.sale_id).maybeSingle();
  if (!sale) { await adminClient.from("asaas_webhook_events").update({ processed_at: new Date().toISOString() }).eq("id", eventId); return json({ received: true, ignored: true }); }
  const remoteValueCents = Math.round(Number(remotePayment.value) * 100);
  if (!Number.isFinite(remoteValueCents) || remoteValueCents !== sale.amount_cents) { await adminClient.from("asaas_webhook_events").update({ processed_at: new Date().toISOString() }).eq("id", eventId); return json({ received: true, ignored: true }); }

  const paymentStatus = String(remotePayment.status || body.payment?.status || ""); let internalStatus = paymentStatus; let saleStatus: string | null = null;
  switch (event) { case "PAYMENT_RECEIVED": internalStatus = "RECEIVED"; saleStatus = "pago"; break; case "PAYMENT_CONFIRMED": internalStatus = "CONFIRMED"; break; case "PAYMENT_OVERDUE": internalStatus = "OVERDUE"; saleStatus = "vencido"; break; case "PAYMENT_DELETED": internalStatus = "DELETED"; saleStatus = "cancelado"; break; case "PAYMENT_REFUNDED": internalStatus = "REFUNDED"; saleStatus = "estornado"; break; default: internalStatus = paymentStatus || event; }
  if (sale.status === "pago" && saleStatus && saleStatus !== "estornado") saleStatus = null;

  const now = new Date().toISOString(); const paymentUpdate: Record<string, unknown> = { status: internalStatus, updated_at: now }; if (event === "PAYMENT_RECEIVED") paymentUpdate.paid_at = now;
  const { error: paymentError } = await adminClient.from("asaas_payments").update(paymentUpdate).eq("id", integration.id); if (paymentError) return json({ error: "Falha ao atualizar pagamento" }, 500);
  if (saleStatus) { const { error: saleError } = await adminClient.from("sales").update({ status: saleStatus }).eq("id", integration.sale_id); if (saleError) return json({ error: "Falha ao atualizar venda" }, 500); }
  await adminClient.from("asaas_webhook_events").update({ processed_at: now }).eq("id", eventId);
  return json({ received: true });
});
