import type { Metadata } from "next";
import "./globals.css";
import "./visual-identity.css";
import "./presentation-authoring.css";

export const metadata: Metadata = {
  title: "Looplab — 2D Game Workshop",
  description: "Build, preview, and export playable 2D HTML games from one visual workspace.",
  icons: { icon: "/looplab-icon.svg" },
};

export const dynamic = "force-dynamic";

async function resolveCompanionToken(companionUrl: string) {
  const configured = String(process.env.LOOPLAB_COMPANION_TOKEN ?? "").trim();
  if (configured) return configured;
  try {
    const response = await fetch(`${companionUrl}/lifecycle/browser-bootstrap`, {
      cache: "no-store",
      headers: { "x-looplab-bootstrap": "server-layout" },
      signal: AbortSignal.timeout(900),
    });
    if (!response.ok) return "";
    const value = await response.json() as { token?: string };
    return String(value.token ?? "").trim();
  } catch {
    return "";
  }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const companionUrl = process.env.LOOPLAB_COMPANION_URL ?? process.env.NEXT_PUBLIC_LOOPLAB_COMPANION_URL
    ?? `http://127.0.0.1:${Number(process.env.LOOPLAB_COMPANION_PORT ?? 4317)}`;
  const companionToken = await resolveCompanionToken(companionUrl);
  const companionBootstrap = [
    `globalThis.__LOOPLAB_COMPANION_TOKEN__=${JSON.stringify(companionToken).replace(/</g, "\\u003c")};`,
    `globalThis.__LOOPLAB_COMPANION_URL__=${JSON.stringify(companionUrl).replace(/</g, "\\u003c")};`,
  ].join("");
  return (
    <html lang="en">
      <body>
        <script id="looplab-companion-session" dangerouslySetInnerHTML={{ __html: companionBootstrap }} />
        {children}
      </body>
    </html>
  );
}
