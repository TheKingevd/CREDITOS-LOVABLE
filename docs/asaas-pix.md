# Pix Asaas

O PDV usa o fluxo de cobrança Pix do Asaas: cadastra/localiza o pagador, cria uma cobrança com `billingType=PIX`, recupera o QR Code dinâmico e aguarda o webhook para confirmar o recebimento. Esse fluxo segue a documentação oficial do Asaas.

## Variáveis do Supabase

Configure como secrets das Edge Functions:

- `ASAAS_API_KEY` — chave da conta Asaas.
- `ASAAS_BASE_URL` — `https://api-sandbox.asaas.com/v3` para Sandbox ou `https://api.asaas.com/v3` para Produção.
- `ASAAS_WEBHOOK_TOKEN` — token exclusivo do webhook, com pelo menos 32 caracteres. Não use a API Key como token do webhook.

As variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são usadas pelas Edge Functions do Supabase.

## Webhook no Asaas

Cadastre um webhook para:

`https://liheviquedqnrcsuzvjs.supabase.co/functions/v1/asaas-webhook`

Use o mesmo valor de `ASAAS_WEBHOOK_TOKEN` no campo `authToken` do webhook.

Para este fluxo, o evento essencial é `PAYMENT_RECEIVED`. Também são tratados `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED` e `PAYMENT_REFUNDED` para manter o status local sincronizado.

O endpoint valida o header `asaas-access-token` e usa o ID do evento para impedir processamento duplicado.

## Fluxo da venda Pix

1. A revenda seleciona um plano e informa os dados do cliente.
2. A venda é criada como `aguardando_pagamento`.
3. A Edge Function cria/localiza o cliente no Asaas e cria a cobrança Pix.
4. O QR Code e Pix Copia e Cola são exibidos no PDV.
5. O Asaas envia `PAYMENT_RECEIVED` para o webhook.
6. A venda passa para `pago`.
7. O trigger do banco desconta os créditos da revenda somente nesse momento.

O projeto não grava API Keys no código-fonte. O Sandbox deve ser usado durante a validação inicial; para Produção, troque `ASAAS_BASE_URL` e utilize uma chave de Produção.
