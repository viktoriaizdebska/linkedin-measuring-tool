import "./lib/error-capture";
import { timingSafeEqual } from "node:crypto";

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

// Optional single password for the whole site (no accounts, no login page).
// Set APP_PASSWORD on Railway to switch it on; leave it empty for an open site.
// The scheduled job endpoint is excluded because it checks its own secret.
function passwordGate(request: Request): Response | null {
  if (new URL(request.url).pathname === "/healthz") return new Response("ok");
  const password = process.env["APP_PASSWORD"];
  if (!password) return null;
  if (new URL(request.url).pathname.startsWith("/api/public/jobs/")) return null;
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const given = decoded.slice(decoded.indexOf(":") + 1);
    const a = Buffer.from(given),
      b = Buffer.from(password);
    if (a.length === b.length && timingSafeEqual(a, b)) return null;
  }
  return new Response("Password required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="LinkedIn Measuring Tool", charset="UTF-8"' },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const gate = passwordGate(request);
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
