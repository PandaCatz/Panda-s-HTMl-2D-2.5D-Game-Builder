import { spawn } from "node:child_process";

export const DEFAULT_LOOPLAB_WEB_HOST = "127.0.0.1";
export const DEFAULT_LOOPLAB_WEB_URL = `http://${DEFAULT_LOOPLAB_WEB_HOST}:3000/`;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function normalizeLoopLabWebUrl(value = DEFAULT_LOOPLAB_WEB_URL) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error("LoopLab can auto-open only an HTTP loopback URL.");
  }
  url.hash = "";
  url.search = "";
  url.pathname = "/";
  return url.href;
}

export function loopLabWebServerArguments(mode = "dev", value = DEFAULT_LOOPLAB_WEB_URL) {
  if (mode !== "dev" && mode !== "start") throw new Error("LoopLab web mode must be dev or start.");
  const url = new URL(normalizeLoopLabWebUrl(value));
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const port = url.port || "80";
  return [mode, "--hostname", hostname, "--port", port];
}

export function localBrowserLaunchSpec(value, platform = process.platform) {
  const url = normalizeLoopLabWebUrl(value);
  if (platform === "win32") {
    return { command: "cmd.exe", args: ["/d", "/s", "/c", "start", "", url], url };
  }
  if (platform === "darwin") return { command: "open", args: [url], url };
  return { command: "xdg-open", args: [url], url };
}

export async function waitForLoopLabWeb({
  url = DEFAULT_LOOPLAB_WEB_URL,
  protocolVersion,
  attempts = 120,
  intervalMs = 250,
  fetchImpl = fetch,
  stopped = () => false,
} = {}) {
  const normalizedUrl = normalizeLoopLabWebUrl(url);
  const manifestUrl = new URL("agent-manifest.json", normalizedUrl).href;
  let lastProtocolVersion = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (stopped()) throw new Error("The LoopLab web process stopped before the editor became ready.");
    try {
      const response = await fetchImpl(manifestUrl, { signal: AbortSignal.timeout(900) });
      if (response.ok) {
        const manifest = await response.json();
        lastProtocolVersion = manifest?.protocolVersion ?? null;
        if (!protocolVersion || lastProtocolVersion === protocolVersion) {
          return { url: normalizedUrl, manifestUrl, protocolVersion: lastProtocolVersion };
        }
      }
    } catch {
      // Startup races are expected. The bounded loop retains the same process.
    }
    if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const detail = lastProtocolVersion
    ? ` It reported protocol ${lastProtocolVersion}, expected ${protocolVersion}.`
    : "";
  throw new Error(`LoopLab did not become ready at ${normalizedUrl}.${detail}`);
}

export async function openLoopLabWeb(value = DEFAULT_LOOPLAB_WEB_URL, {
  platform = process.platform,
  spawnImpl = spawn,
} = {}) {
  const spec = localBrowserLaunchSpec(value, platform);
  const child = spawnImpl(spec.command, spec.args, {
    detached: true,
    shell: false,
    stdio: "ignore",
    windowsHide: true,
  });
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("spawn", resolve);
  });
  child.unref?.();
  return { url: spec.url, platform, command: spec.command };
}
