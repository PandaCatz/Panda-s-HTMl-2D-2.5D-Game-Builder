import { launchInstalledBrowser } from "./looplab-platform-harness.mjs";

function loopbackUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:") throw new Error("LoopLab MCP browser mode requires a loopback http:// app URL.");
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) throw new Error("LoopLab MCP browser mode refuses non-loopback app URLs.");
  url.username = "";
  url.password = "";
  return url.href;
}

export class LooplabBrowserAgentSession {
  constructor({ appUrl = "http://127.0.0.1:3000/", protocolVersion, browserChannel, executablePath, timeoutMs = 30_000 } = {}) {
    this.appUrl = loopbackUrl(appUrl);
    this.protocolVersion = protocolVersion;
    this.browserChannel = browserChannel;
    this.executablePath = executablePath;
    this.timeoutMs = Math.max(1_000, Math.min(120_000, Number(timeoutMs) || 30_000));
    this.browser = null;
    this.context = null;
    this.page = null;
    this.launchTarget = null;
    this.launchAttempts = [];
  }

  async connect() {
    if (this.page && !this.page.isClosed()) return this.describe();
    const launched = await launchInstalledBrowser({
      headless: true,
      browserChannel: this.browserChannel,
      executablePath: this.executablePath,
    });
    this.browser = launched.browser;
    this.launchTarget = launched.launchTarget;
    this.launchAttempts = launched.attempts;
    this.context = await this.browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    this.page = await this.context.newPage();
    this.browser.once("disconnected", () => {
      this.browser = null;
      this.context = null;
      this.page = null;
    });
    try {
      await this.page.goto(this.appUrl, { waitUntil: "domcontentloaded", timeout: this.timeoutMs });
      await this.page.waitForSelector('#looplab-agent-bridge[data-ready="true"]', { state: "attached", timeout: this.timeoutMs });
      const observedProtocol = await this.page.locator("#looplab-agent-bridge").getAttribute("data-protocol-version");
      if (this.protocolVersion && observedProtocol !== this.protocolVersion) {
        throw new Error(`LoopLab browser protocol mismatch: MCP expects ${this.protocolVersion}, but the running app reports ${observedProtocol ?? "unknown"}. Restart the app before authoring.`);
      }
      return this.describe(observedProtocol);
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  describe(observedProtocol = this.protocolVersion) {
    return {
      connected: Boolean(this.page && !this.page.isClosed()),
      appUrl: this.appUrl,
      protocolVersion: observedProtocol ?? null,
      launchTarget: this.launchTarget,
      launchAttempts: this.launchAttempts,
    };
  }

  async run(command) {
    await this.connect();
    const response = await this.page.evaluate(async ({ command, timeoutMs }) => {
      const direct = globalThis.looplabAgent;
      if (direct && typeof direct.run === "function") return await direct.run(command);
      const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          document.removeEventListener("looplab:agent-response", listener);
          reject(new Error("LoopLab DOM agent bridge timed out."));
        }, timeoutMs);
        const listener = (event) => {
          if (event.detail?.id !== id) return;
          clearTimeout(timer);
          document.removeEventListener("looplab:agent-response", listener);
          resolve(event.detail.result);
        };
        document.addEventListener("looplab:agent-response", listener);
        document.dispatchEvent(new CustomEvent("looplab:agent-command", { detail: { id, command } }));
      });
    }, { command, timeoutMs: this.timeoutMs });
    if (!response || response.ok !== true) throw new Error(response?.error ?? `LoopLab browser command failed: ${command?.op ?? "unknown"}`);
    return response;
  }

  async close() {
    const context = this.context;
    const browser = this.browser;
    this.page = null;
    this.context = null;
    this.browser = null;
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}
