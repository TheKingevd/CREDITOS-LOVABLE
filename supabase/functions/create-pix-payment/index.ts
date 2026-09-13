import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const asaasKey = Deno.env.get("ASAAS_API_KEY");
  const asaasBaseUrl = (Deno.env.get("ASAAS_BASE_URL") || "https://api-sandbox.asaas.com/v3").replace(/\/$/, "");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !asaasKey) return json({ error: "Integração Asaas não configurada. Defina ASAAS_API_KEY e as variáveis do Supabase." }, 500);

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Não autenticado" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Sessão inválida" }, 401);

  const body = await request.json();
  const saleId = String(body.saleId || "");
  if (!saleId) return json({ error: "saleId é obrigatório" }, 400);

  const { data: reseller } = await adminClient.from("resellers").select("id, name, active").eq("user_id", userData.user.id).maybeSingle();
  if (!reseller?.active) return json({ error: "Revenda não encontrada ou inativa" }, 403);

  const { data: sale, error: saleError } = await adminClient.from("sales").select("*").eq("id", saleId).eq("reseller_id", reseller.id).maybeSingle();
  if (saleError || !sale) return json({ error: "Venda não encontrada" }, 404);
  if (!["aguardando_pagamento", "pago"].includes(sale.status)) return json({ error: "Esta venda não está disponível para pagamento Pix" }, 409);

  const { data: existing } = await adminClient.from("asaas_payments").select("asaas_payment_id, pix_payload, pix_encoded_image, pix_expiration_date, status").eq("sale_id", sale.id).maybeSingle();
  if (existing?.pix_payload && existing.pix_encoded_image) return json({ paymentId: existing.asaas_payment_id, payload: existing.pix_payload, encodedImage: existing.pix_encoded_image, expirationDate: existing.pix_expiration_date, status: existing.status });
  if (!sale.customer_document) return json({ error: "Informe o CPF/CNPJ do cliente para gerar o Pix Asaas." }, 400);

  const customerLookupUrl = new URL(`${asaasBaseUrl}/customers`);
  customerLookupUrl.searchParams.set("cpfCnpj", String(sale.customer_document).replace(/\D/g, ""));
  customerLookupUrl.searchParams.set("limit", "1");
  const customerLookup = await fetch(customerLookupUrl, { headers: { accept: "application/json", access_token: asaasKey } });
  if (!customerLookup.ok) return json({ error: `Asaas recusou a consulta do cliente (${customerLookup.status}).` }, 502);
  const customerList = await customerLookup.json();
  let customer = customerList.data?.[0];

  if (!customer) {
    const customerResponse = await fetch(`${asaasBaseUrl}/customers`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", access_token: asaasKey },
      body: JSON.stringify({ name: sale.customer_name, cpfCnpj: String(sale.customer_document).replace(/\D/g, ""), email: sale.customer_email || undefined, mobilePhone: sale.customer_phone || undefined, externalReference: sale.id }),
    });
    if (!customerResponse.ok) return json({ error: `Não foi possível cadastrar o cliente no Asaas: ${await customerResponse.text()}` }, 502);
    customer = await customerResponse.json();
  }

  const dueDate = new Date().toISOString().slice(0, 10);
  const paymentResponse = await fetch(`${asaasBaseUrl}/payments`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", access_token: asaasKey },
    body: JSON.stringify({ customer: customer.id, billingType: "PIX", value: Number(sale.amount_cents) / 100, dueDate, description: `${sale.plan_name} — ${sale.customer_name}`.slice(0, 500), externalReference: sale.id }),
  });
  if (!paymentResponse.ok) return json({ error: `Não foi possível criar a cobrança Pix: ${await paymentResponse.text()}` }, 502);

  const payment = await paymentResponse.json();

  // Persiste o vínculo antes de buscar o QR Code para que um webhook rápido do Asaas
  // nunca encontre a cobrança externa sem um registro local correspondente.
  const { error: initialSaveError } = await adminClient.from("asaas_payments").upsert({
    sale_id: sale.id,
    asaas_customer_id: customer.id,
    asaas_payment_id: payment.id,
    status: payment.status || "PENDING",
    updated_at: new Date().toISOString(),
  }, { onConflict: "sale_id" });
  if (initialSaveError) return json({ error: "Cobrança criada, mas não foi possível registrar a integração local." }, 500);

  const qrResponse = await fetch(`${asaasBaseUrl}/payments/${payment.id}/pixQrCode`, { headers: { accept: "application/json", access_token: asaasKey } });
  if (!qrResponse.ok) return json({ error: `Cobrança criada, mas não foi possível obter o QR Code: ${await qrResponse.text()}` }, 502);
  const qr = await qrResponse.json();

  const { error: saveError } = await adminClient.from("asaas_payments").update({ pix_payload: qr.payload, pix_encoded_image: qr.encodedImage, pix_expiration_date: qr.expirationDate, updated_at: new Date().toISOString() }).eq("sale_id", sale.id);
  if (saveError) return json({ error: "Cobrança criada, mas não foi possível salvar os dados do QR Code." }, 500);

  return json({ paymentId: payment.id, payload: qr.payload, encodedImage: qr.encodedImage, expirationDate: qr.expirationDate, status: payment.status });
});
