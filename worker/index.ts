/** Cloudflare Worker entry point for the vinext-starter template. */
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // LoopLab serves only authored local assets and does not use next/image.
    // Deny the vinext optimizer explicitly: its parser surface is unnecessary,
    // and public deployments must not turn arbitrary image bytes into work.
    if (url.pathname === "/_vinext/image") {
      return new Response("Not found", {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
