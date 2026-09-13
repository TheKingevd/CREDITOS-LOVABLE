import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then((m) => (m.default ?? m) as ServerEntry);
  }
  return serverEntryPromise;
}

function securityHeaders(headers: Headers): Headers {
  const next = new Headers(headers);
  next.set("X-Content-Type-Options", "nosniff");
  next.set("X-Frame-Options", "DENY");
  next.set("Referrer-Policy", "strict-origin-when-cross-origin");
  next.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)");
  next.set("Cross-Origin-Opener-Policy", "same-origin");
  next.set("Cross-Origin-Resource-Policy", "same-origin");
  next.set("X-DNS-Prefetch-Control", "off");
  return next;
}

function withSecurityHeaders(response: Response): Response {
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: securityHeaders(response.headers) });
}

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return withSecurityHeaders(response);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return withSecurityHeaders(response);
  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return withSecurityHeaders(response);
  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return withSecurityHeaders(new Response(renderErrorPage(), { status: 500, headers: { "content-type": "text/html; charset=utf-8" } }));
}

function isH3SwallowedErrorBody(body: string): boolean {
  try { const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown }; return payload.unhandled === true && payload.message === "HTTPError"; } catch { return false; }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(new Response(renderErrorPage(), { status: 500, headers: { "content-type": "text/html; charset=utf-8" } }));
    }
  },
};
