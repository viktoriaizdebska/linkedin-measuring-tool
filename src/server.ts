import "./lib/error-capture";
import { createHmac, timingSafeEqual } from "node:crypto";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Optional single password for the whole site (no accounts, password-only form).
// Set APP_PASSWORD on Railway to switch it on; leave it empty for an open site.
// The scheduled job endpoint is excluded because it checks its own secret.
const COOKIE = "app_auth";

function sign(password: string): string {
  return createHmac("sha256", password).update("linkedin-measuring-tool-auth").digest("hex");
}

function safeEqual(x: string, y: string): boolean {
  const a = Buffer.from(x),
    b = Buffer.from(y);
  return a.length === b.length && timingSafeEqual(a, b);
}

function loginPage(error: boolean): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LinkedIn Measuring Tool</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f5f5f5}form{background:#fff;padding:2rem;border-radius:12px;box-shadow:0 1px 8px #0002;display:grid;gap:1rem;width:min(320px,90vw)}input,button{font:inherit;padding:.6rem;border-radius:8px;border:1px solid #ccc}button{background:#111;color:#fff;border:0;cursor:pointer}p{color:#b00020;margin:0}</style></head><body><form method="post" action="/__login"><h1 style="margin:0;font-size:1.25rem">Password</h1>${error ? "<p>Wrong password</p>" : ""}<input type="password" name="password" autocomplete="current-password" autofocus required><button type="submit">Enter</button></form></body></html>`;
  return new Response(html, {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function passwordGate(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/healthz") return new Response("ok");
  const password = process.env["APP_PASSWORD"];
  if (!password) return null;
  if (url.pathname.startsWith("/api/public/jobs/")) return null;
  const token = sign(password);

  if (url.pathname === "/__login" && request.method === "POST") {
    const form = await request.formData().catch(() => null);
    const given = String(form?.get("password") ?? "");
    if (!safeEqual(given, password)) return loginPage(true);
    const secure = (request.headers.get("x-forwarded-proto") ?? url.protocol).startsWith("https")
      ? "; Secure"
      : "";
    return new Response(null, {
      status: 303,
      headers: {
        location: "/",
        "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`,
      },
    });
  }

  const cookies = request.headers.get("cookie") ?? "";
  const match = cookies.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (match && safeEqual(match.slice(COOKIE.length + 1), token)) return null;
  return loginPage(false);
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const gate = await passwordGate(request);
    if (gate) return gate;
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
