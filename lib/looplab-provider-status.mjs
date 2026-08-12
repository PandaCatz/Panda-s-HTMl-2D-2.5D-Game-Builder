import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { claudeHeadlessCapabilities } from "./looplab-claude-cli.mjs";
import { LOOPLAB_PROVIDER_INDEPENDENCE_POLICY } from "./looplab-provider-parity.mjs";
import { LOOPLAB_PROVIDER_FAILOVER_POLICY, resolveProviderRoute } from "./looplab-provider-routing.mjs";

export const PROVIDER_ORDER = ["codex", "claude", "openai", "anthropic"];
export const API_CREDENTIAL_NAMES = Object.freeze({ openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY" });

export const CLI_LOGIN_COMMANDS = Object.freeze({
  codex: Object.freeze({ command: "codex", args: ["login", "--device-auth"] }),
  claude: Object.freeze({ command: "claude", args: ["auth", "login"] }),
});

const PROVIDER_META = Object.freeze({
  openai: {
    label: "OpenAI API",
    kind: "api",
    envName: "OPENAI_API_KEY",
    keyUrl: "https://platform.openai.com/api-keys",
    docsUrl: "https://platform.openai.com/docs/quickstart",
  },
  anthropic: {
    label: "Anthropic API",
    kind: "api",
    envName: "ANTHROPIC_API_KEY",
    keyUrl: "https://console.anthropic.com/settings/keys",
    docsUrl: "https://docs.anthropic.com/en/api/getting-started",
  },
  codex: {
    label: "Codex CLI",
    kind: "cli",
    command: "codex",
    versionArgs: ["--version"],
    statusArgs: ["login", "status"],
    loginCommand: "codex login --device-auth",
    installCommand: "npm install -g @openai/codex",
    docsUrl: "https://developers.openai.com/codex/cli",
  },
  claude: {
    label: "Claude Code CLI",
    kind: "cli",
    command: "claude",
    versionArgs: ["--version"],
    statusArgs: ["auth", "status"],
    loginCommand: "claude auth login",
    installCommand: "npm install -g @anthropic-ai/claude-code",
    docsUrl: "https://docs.anthropic.com/en/docs/claude-code/getting-started",
  },
});

const OUTPUT_LIMIT = 32 * 1024;
const ANSI_SGR_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const PROJECT_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_CODEX_ENTRY = resolve(PROJECT_DIRECTORY, "node_modules", "@openai", "codex", "bin", "codex.js");

function packageJavascriptInvocation(args, candidates, fileExists) {
  const selected = candidates.find((candidate) => fileExists(candidate.path));
  if (!selected) return null;
  return {
    command: process.execPath,
    args: [selected.path, ...args],
    shell: false,
    source: selected.source,
  };
}

export function resolveProviderInvocation(command, args = [], { platform = process.platform, fileExists = existsSync, appData = process.env.APPDATA, env = process.env } = {}) {
  const processArgs = Array.isArray(args) ? [...args] : [];
  const configuredEntry = command === "codex" ? env.LOOPLAB_CODEX_CLI_ENTRY : command === "claude" ? env.LOOPLAB_CLAUDE_CLI_ENTRY : null;
  if (typeof configuredEntry === "string" && configuredEntry.trim()) {
    const entryPath = resolve(configuredEntry.trim());
    const javascriptEntry = new Set([".js", ".mjs", ".cjs"]).has(extname(entryPath).toLowerCase());
    return {
      command: javascriptEntry ? process.execPath : entryPath,
      args: javascriptEntry ? [entryPath, ...processArgs] : processArgs,
      shell: false,
      source: `configured-${command}-entry`,
    };
  }
  if (command === "codex") {
    const codexJavascript = packageJavascriptInvocation(processArgs, [
      { path: LOCAL_CODEX_ENTRY, source: "project-local-codex" },
      { path: resolve(dirname(process.execPath), "node_modules", "@openai", "codex", "bin", "codex.js"), source: "node-global-codex" },
      ...(appData ? [{ path: resolve(appData, "npm", "node_modules", "@openai", "codex", "bin", "codex.js"), source: "user-global-codex" }] : []),
    ], fileExists);
    if (codexJavascript) return codexJavascript;
  }
  if (command === "claude") {
    const binaryName = platform === "win32" ? "claude.exe" : "claude";
    const candidates = [
      { path: resolve(PROJECT_DIRECTORY, "node_modules", "@anthropic-ai", "claude-code", "bin", binaryName), source: "project-local-claude" },
      { path: resolve(dirname(process.execPath), "node_modules", "@anthropic-ai", "claude-code", "bin", binaryName), source: "node-adjacent-claude" },
      ...(appData ? [{ path: resolve(appData, "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", binaryName), source: "user-global-claude" }] : []),
    ];
    const selected = candidates.find((candidate) => fileExists(candidate.path));
    if (selected) {
      return {
        command: selected.path,
        args: processArgs,
        shell: false,
        source: selected.source,
      };
    }
    const javascriptCandidates = [
      { path: resolve(PROJECT_DIRECTORY, "node_modules", "@anthropic-ai", "claude-code", "cli.js"), source: "project-local-claude-js" },
      { path: resolve(dirname(process.execPath), "node_modules", "@anthropic-ai", "claude-code", "cli.js"), source: "node-adjacent-claude-js" },
      ...(appData ? [{ path: resolve(appData, "npm", "node_modules", "@anthropic-ai", "claude-code", "cli.js"), source: "user-global-claude-js" }] : []),
    ];
    const javascriptEntry = packageJavascriptInvocation(processArgs, javascriptCandidates, fileExists);
    if (javascriptEntry) return javascriptEntry;
  }
  return {
    command,
    args: processArgs,
    shell: false,
    source: "path",
  };
}

function trimOutput(value) {
  return String(value ?? "")
    .replace(ANSI_SGR_PATTERN, "")
    .replace(/\r/g, "")
    .trim()
    .slice(0, OUTPUT_LIMIT);
}

function resultErrorCode(error) {
  return typeof error?.code === "string" ? error.code.toUpperCase() : "";
}

function powershellLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function readWindowsCredential(provider, name, runner = runProviderCommand, vaultDirectory) {
  if (API_CREDENTIAL_NAMES[provider] !== name) return "";
  const vaultFile = `${provider}-api-key.dpapi`;
  const vaultAssignment = vaultDirectory
    ? `$vault=Join-Path ${powershellLiteral(vaultDirectory)} '${vaultFile}'`
    : `$vault=Join-Path $env:LOCALAPPDATA 'Looplab\\secrets\\${vaultFile}'`;
  const missingValue = vaultDirectory ? "''" : `[Environment]::GetEnvironmentVariable('${name}','User')`;
  const command = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${vaultAssignment}; if(Test-Path -LiteralPath $vault){$payload=(Get-Content -Raw -LiteralPath $vault).Trim();$prefix='looplab-dpapi-v1:';if($payload.StartsWith($prefix)){Add-Type -AssemblyName System.Security;$cipher=[Convert]::FromBase64String($payload.Substring($prefix.Length));$plainBytes=[System.Security.Cryptography.ProtectedData]::Unprotect($cipher,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);try{[Console]::Out.Write([Text.Encoding]::UTF8.GetString($plainBytes))}finally{if($plainBytes){[Array]::Clear($plainBytes,0,$plainBytes.Length)}}}else{Import-Module Microsoft.PowerShell.Security -ErrorAction Stop;$secure=ConvertTo-SecureString $payload;$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);try{[Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}}}else{[Console]::Out.Write(${missingValue})}`;
  const result = await runner("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], { timeoutMs: 4_000, shell: false });
  return result.ok ? String(result.stdout ?? "").trim() : "";
}

export async function loadProviderEnvironment({ baseEnv = process.env, platform = process.platform, runner = runProviderCommand, vaultDirectory } = {}) {
  const resolved = { ...baseEnv };
  if (platform !== "win32") return resolved;
  for (const [provider, credentialName] of Object.entries(API_CREDENTIAL_NAMES)) {
    const userCredential = await readWindowsCredential(provider, credentialName, runner, vaultDirectory);
    if (userCredential) resolved[credentialName] = userCredential;
  }
  return resolved;
}

export function runProviderCommand(command, args, { timeoutMs = 6_000 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    let child;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        timedOut: false,
        ...value,
      });
    };

    try {
      const invocation = resolveProviderInvocation(command, args, { env: process.env });
      child = spawn(invocation.command, invocation.args, {
        windowsHide: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({ ok: false, exitCode: null, stdout: "", stderr: "", errorCode: resultErrorCode(error), timedOut: false });
      return;
    }

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-OUTPUT_LIMIT); });
    child.stderr?.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-OUTPUT_LIMIT); });
    child.on("error", (error) => finish({ ok: false, exitCode: null, errorCode: resultErrorCode(error) }));
    child.on("close", (exitCode) => finish({ ok: exitCode === 0, exitCode, errorCode: "" }));

    const timer = setTimeout(() => {
      if (settled) return;
      child.kill();
      finish({ ok: false, exitCode: null, errorCode: "TIMEOUT", timedOut: true });
    }, timeoutMs);
    timer.unref?.();
  });
}

function firstLine(value) {
  return trimOutput(value).split("\n").map((line) => line.trim()).find(Boolean) ?? "";
}

function authMethodFromOutput(provider, output) {
  const normalized = output.toLowerCase();
  if (/chatgpt|claude\.ai|pro plan|max plan|subscription/.test(normalized)) return provider === "codex" ? "ChatGPT" : "Claude account";
  if (/access token/.test(normalized)) return "access token";
  if (/api[ -]?key|console account/.test(normalized)) return "API key";
  if (/bedrock/.test(normalized)) return "Amazon Bedrock";
  if (/vertex/.test(normalized)) return "Google Vertex AI";
  return "saved CLI session";
}

function unavailableState(result) {
  if (result.errorCode === "ENOENT" || result.exitCode === 127 || /not recognized|not found|is not recognized/.test(`${result.stderr} ${result.stdout}`.toLowerCase())) return "not-installed";
  return "blocked";
}

async function inspectCliProvider(id, runner) {
  const meta = PROVIDER_META[id];
  const versionResult = await runner(meta.command, meta.versionArgs);
  if (!versionResult.ok) {
    const state = unavailableState(versionResult);
    return {
      id,
      label: meta.label,
      kind: meta.kind,
      state,
      ready: false,
      installed: state !== "not-installed",
      runnable: false,
      authenticated: false,
      version: null,
      authMethod: null,
      summary: state === "not-installed" ? `${meta.label} is not installed` : `${meta.label} was found but cannot run`,
      detail: state === "not-installed"
        ? "Install the standalone CLI, then scan again."
        : versionResult.timedOut
          ? "The CLI check timed out. Close stuck processes or verify the installation."
          : "The operating system denied or failed the CLI launch. A standalone CLI install may be required.",
      action: { kind: "copy-command", label: "Copy install command", command: meta.installCommand },
      installCommand: meta.installCommand,
      loginCommand: meta.loginCommand,
      docsUrl: meta.docsUrl,
    };
  }

  const version = firstLine(versionResult.stdout || versionResult.stderr).slice(0, 120) || "installed";
  const capabilities = id === "claude"
    ? claudeHeadlessCapabilities(version)
    : {
        contract: "looplab-codex-headless/v1",
        parityReady: true,
        structuredOutput: true,
        streamJson: true,
        nonPersistentSessions: true,
        deterministicPermissions: true,
        measuredUsage: true,
        reason: "Codex CLI supports LoopLab's schema-bound, JSONL, ephemeral headless contract.",
      };
  const authResult = await runner(meta.command, meta.statusArgs);
  const authOutput = `${authResult.stdout}\n${authResult.stderr}`;
  const authenticated = authResult.ok;
  const parityReady = capabilities.parityReady !== false;
  const ready = authenticated && parityReady;
  return {
    id,
    label: meta.label,
    kind: meta.kind,
    state: ready ? "ready" : authenticated ? "blocked" : "needs-login",
    ready,
    installed: true,
    runnable: true,
    authenticated,
    version,
    capabilities,
    authMethod: authenticated ? authMethodFromOutput(id, authOutput) : null,
    summary: ready ? `${meta.label} is ready` : authenticated ? `${meta.label} needs an update` : `${meta.label} needs sign-in`,
    detail: ready
      ? `Authenticated through ${authMethodFromOutput(id, authOutput)}. ${capabilities.reason} No credential value was read.`
      : authenticated
        ? capabilities.reason
      : `Use the supported ${id === "codex" ? "device-code" : "browser"} login flow, then scan again.`,
    action: ready
      ? { kind: "none", label: "Connected" }
      : authenticated
        ? { kind: "copy-command", label: "Copy update command", command: meta.installCommand }
      : { kind: "login", label: `Sign in to ${id === "codex" ? "Codex" : "Claude"}` },
    installCommand: meta.installCommand,
    loginCommand: meta.loginCommand,
    docsUrl: meta.docsUrl,
  };
}

async function inspectApiProvider(id, env, fetcher) {
  const meta = PROVIDER_META[id];
  const configured = Boolean(env[meta.envName]);
  const model = id === "openai" ? env.LOOPLAB_OPENAI_MODEL ?? "gpt-5.2" : env.LOOPLAB_ANTHROPIC_MODEL ?? "claude-sonnet-5";
  const base = {
    id,
    label: meta.label,
    kind: meta.kind,
    installed: true,
    runnable: true,
    model,
    credentialName: meta.envName,
    keyUrl: meta.keyUrl,
    docsUrl: meta.docsUrl,
  };
  if (!configured) {
    return {
      ...base,
      state: "needs-key",
      ready: false,
      authenticated: false,
      authMethod: null,
      summary: `${meta.envName} is not configured`,
      detail: `Create a provider key, paste it into Looplab's masked field, then choose Save key securely. Looplab encrypts it for your Windows user and verifies it immediately. You can also set ${meta.envName} in your user environment.`,
      action: { kind: "native-key", label: "Paste API key securely" },
    };
  }

  try {
    const response = await fetcher(id === "openai" ? "https://api.openai.com/v1/models" : "https://api.anthropic.com/v1/models?limit=1", {
      method: "GET",
      headers: id === "openai"
        ? { Authorization: `Bearer ${env[meta.envName]}` }
        : { "x-api-key": env[meta.envName], "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return {
        ...base,
        state: "blocked",
        ready: false,
        authenticated: false,
        authMethod: null,
        summary: `${meta.label} rejected the configured credential`,
        detail: `The non-generation connection check returned HTTP ${response.status}. Replace or reauthorize ${meta.envName}, then scan again.`,
        action: { kind: "native-key", label: "Replace API key" },
      };
    }
    return {
      ...base,
      state: "ready",
      ready: true,
      authenticated: true,
      authMethod: "verified companion environment",
      verifiedAt: new Date().toISOString(),
      summary: `${meta.label} is authenticated and reachable`,
      detail: `Verified with the provider's models endpoint. ${meta.envName} stayed inside the companion and its value was not returned.`,
      action: { kind: "none", label: "Connected" },
    };
  } catch {
    return {
      ...base,
      state: "blocked",
      ready: false,
      authenticated: false,
      authMethod: null,
      summary: `${meta.label} could not be reached`,
      detail: "The credential exists, but the non-generation connection check failed or timed out. Check the network, proxy, and provider status.",
      action: { kind: "none", label: "Retry scan" },
    };
  }
}

function isolatedInspectionFailure(id) {
  const meta = PROVIDER_META[id];
  const cli = meta.kind === "cli";
  return {
    id,
    label: meta.label,
    kind: meta.kind,
    state: "blocked",
    ready: false,
    installed: cli ? false : true,
    runnable: false,
    authenticated: false,
    version: cli ? null : undefined,
    model: cli ? undefined : id === "openai" ? "gpt-5.2" : "claude-sonnet-5",
    authMethod: null,
    credentialName: meta.envName,
    summary: `${meta.label} readiness check failed`,
    detail: `Only the ${meta.label} path was blocked. Looplab still checked every other CLI and API path independently; scan again after repairing this provider.`,
    action: { kind: "none", label: "Retry scan" },
    installCommand: meta.installCommand,
    loginCommand: meta.loginCommand,
    keyUrl: meta.keyUrl,
    docsUrl: meta.docsUrl,
  };
}

async function inspectProviderIsolated(id, inspect) {
  try {
    return await inspect();
  } catch {
    return isolatedInspectionFailure(id);
  }
}

export async function inspectProviders({ env = process.env, runner = runProviderCommand, fetcher = fetch } = {}) {
  const [codex, claude, openai, anthropic] = await Promise.all([
    inspectProviderIsolated("codex", () => inspectCliProvider("codex", runner)),
    inspectProviderIsolated("claude", () => inspectCliProvider("claude", runner)),
    inspectProviderIsolated("openai", () => inspectApiProvider("openai", env, fetcher)),
    inspectProviderIsolated("anthropic", () => inspectApiProvider("anthropic", env, fetcher)),
  ]);
  const providers = {
    codex,
    claude,
    openai,
    anthropic,
  };
  return {
    checkedAt: new Date().toISOString(),
    readyCount: Object.values(providers).filter((provider) => provider.ready).length,
    readyProviders: PROVIDER_ORDER.filter((id) => providers[id].ready),
    independencePolicy: LOOPLAB_PROVIDER_INDEPENDENCE_POLICY,
    failoverPolicy: LOOPLAB_PROVIDER_FAILOVER_POLICY,
    routes: Object.fromEntries(PROVIDER_ORDER.map((id) => [id, resolveProviderRoute({ providers }, { requestedProvider: id })])),
    providers,
  };
}

export async function verifyProviderCredentialCandidate(provider, key, { baseEnv = process.env, inspector = inspectProviders } = {}) {
  const credentialName = API_CREDENTIAL_NAMES[provider];
  if (!credentialName) throw new Error("Only OpenAI and Anthropic API credentials can be verified this way.");
  const candidate = String(key ?? "").trim();
  if (candidate.length < 20 || /\s/.test(candidate)) throw new Error("Paste the complete API key without spaces.");
  const scan = await inspector({ env: { ...baseEnv, [credentialName]: candidate } });
  const status = scan?.providers?.[provider];
  if (!status?.ready) throw new Error(`The ${status?.label ?? provider} key did not verify. The existing saved key was not changed: ${status?.summary ?? "provider authentication failed"}.`);
  return { provider, credentialName, status };
}

export function providerStatusDigest(scan) {
  return PROVIDER_ORDER.map((id) => `${id}:${scan.providers[id]?.state ?? "unknown"}`).join("|");
}
