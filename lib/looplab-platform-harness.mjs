import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import {
  LOOPLAB_PLATFORM_HARNESS_DEFAULTS,
  LOOPLAB_PLATFORM_HARNESS_CSP,
  LOOPLAB_PLATFORM_HARNESS_SCHEMA,
  LOOPLAB_PLATFORM_HARNESS_VERSION,
} from "./looplab-platform-harness-contract.mjs";

export { LOOPLAB_PLATFORM_HARNESS_CSP, LOOPLAB_PLATFORM_HARNESS_DEFAULTS, LOOPLAB_PLATFORM_HARNESS_SCHEMA, LOOPLAB_PLATFORM_HARNESS_VERSION } from "./looplab-platform-harness-contract.mjs";

const INLINE_CSP = LOOPLAB_PLATFORM_HARNESS_CSP;
const EXTERNAL_PROTOCOL = /^(?:https?|wss?):/i;
const VISUAL_TEXT_LIMIT = 8_000;
const VISUAL_CONTROL_LIMIT = 64;

function artifactSha256(html) {
  return createHash("sha256").update(html).digest("hex");
}

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function injectHarnessCsp(html) {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${INLINE_CSP}">`;
  const bootstrap = `<script data-looplab-platform-bootstrap>;(${installInstrumentation.toString()})();</script>`;
  const harnessHead = `${meta}${bootstrap}`;
  if (/<head(?:\s[^>]*)?>/i.test(html)) return html.replace(/<head(?:\s[^>]*)?>/i, (match) => `${match}${harnessHead}`);
  return html.replace(/<html(?:\s[^>]*)?>/i, (match) => `${match}<head>${harnessHead}</head>`);
}

export function buildPlatformHarnessDocument(artifactHtml) {
  const constrainedArtifact = injectHarnessCsp(String(artifactHtml));
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; frame-src about:; object-src 'none'; base-uri 'none'; form-action 'none'">
  <title>LoopLab platform harness</title>
  <style>html,body{margin:0;width:100%;height:100%;background:#d6d6d2}body{display:grid;grid-template-rows:auto 1fr;font:12px/1.4 ui-monospace,monospace}button{width:max-content;margin:6px;padding:6px 10px}iframe{width:100%;height:100%;border:0;background:#111}</style>
</head>
<body>
  <button id="looplab-platform-focus-stealer" type="button">Harness focus target</button>
  <iframe id="looplab-platform-artifact" title="LoopLab hostile platform artifact" sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="${escapeAttribute(constrainedArtifact)}"></iframe>
</body>
</html>`;
}

async function captureBrowserEvidence({ frame, iframe, phase, captureDirectory }) {
  const dom = await frame.evaluate(({ textLimit, controlLimit }) => {
    const clipped = (value, limit = 240) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
    const describeElement = (element) => element ? {
      tag: element.tagName?.toLowerCase() ?? null,
      id: element.id || null,
      role: element.getAttribute?.("role") || null,
      name: clipped(element.getAttribute?.("aria-label") || element.getAttribute?.("title") || element.textContent),
      disabled: "disabled" in element ? Boolean(element.disabled) : undefined,
    } : null;
    const controls = Array.from(document.querySelectorAll("button,input,select,textarea,[role='button'],[role='option']"))
      .slice(0, controlLimit)
      .map(describeElement);
    const dialogs = Array.from(document.querySelectorAll("dialog,[role='dialog'],[aria-modal='true']"))
      .slice(0, 16)
      .map((element) => ({ ...describeElement(element), text: clipped(element.textContent, 1_000) }));
    const canvases = Array.from(document.querySelectorAll("canvas"))
      .slice(0, 16)
      .map((canvas) => ({
        id: canvas.id || null,
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
      }));
    return {
      title: clipped(document.title, 500),
      bodyText: clipped(document.body?.innerText, textLimit),
      activeElement: describeElement(document.activeElement),
      controls,
      dialogs,
      canvases,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    };
  }, { textLimit: VISUAL_TEXT_LIMIT, controlLimit: VISUAL_CONTROL_LIMIT });
  if (!captureDirectory) return { phase, dom, screenshot: null };
  const directory = resolve(captureDirectory);
  await mkdir(directory, { recursive: true });
  const path = join(directory, `${phase}.png`);
  const png = await iframe.screenshot({ path, type: "png", animations: "disabled", caret: "hide" });
  return {
    phase,
    dom,
    screenshot: {
      path,
      sha256: artifactSha256(png),
      byteLength: png.byteLength,
    },
  };
}

function failedCheck(id, detail, data = undefined) {
  return { id, status: "failed", detail, ...(data === undefined ? {} : { data }) };
}

function passedCheck(id, detail, data = undefined) {
  return { id, status: "passed", detail, ...(data === undefined ? {} : { data }) };
}

function unavailableCheck(id, detail, data = undefined) {
  return { id, status: "not-applicable", detail, ...(data === undefined ? {} : { data }) };
}

const FINDING_DETAILS = {
  "browser-available": ["platform-browser-unavailable", "Install a supported Chrome or Edge channel, or provide --executable-path, then rerun the exact artifact."],
  "runtime-ready": ["platform-runtime-not-ready", "Fix startup errors in the exported artifact before changing the harness timeout."],
  "game-shell-lifecycle": ["platform-game-shell-lifecycle", "Repair the authored title/start/pause/settings/restart lifecycle or its exported runtime bridge, then rerun the exact artifact."],
  "sandbox-opaque-origin": ["platform-sandbox-origin", "Keep the harness iframe scripts-only; do not add allow-same-origin or depend on storage/same-origin access."],
  "source-digest": ["platform-source-digest", "Expose and verify the exact Project Doctor source digest from the exported runtime."],
  "portable-save-roundtrip": ["platform-save-roundtrip", "Repair the exported save codec or profile fallback so a source-bound portable code can round-trip without browser storage."],
  "input-action-liveness": ["platform-input-action-dead", "Connect every declared action to an enabled runtime consumer or remove the dead declaration, then regenerate the exact artifact."],
  "real-keyboard-input": ["platform-keyboard-input", "Normalize the authored binding from real keydown/keyup events after focusing the active gameplay surface."],
  "blur-clears-input": ["platform-stuck-input", "Release every held input when the artifact loses focus or visibility."],
  "semantic-input": ["platform-semantic-input", "Route semantic action IDs through the same exported input resolver used by replay and preview."],
  "audio-failure-isolated": ["platform-audio-input-coupling", "Record gameplay input before audio work and handle a rejected AudioContext resume without aborting the handler."],
  "presentation-runtime-isolated": ["platform-presentation-runtime", "Keep presentation event handling outside deterministic state and catch Web Audio failures inside the presentation controller."],
  "no-external-requests": ["platform-external-request", "Inline the requested resource or remove the runtime network dependency from the one-file artifact."],
  "no-unhandled-errors": ["platform-browser-error", "Repair the first page error or console error in the exact exported artifact."],
  "frame-soak": ["platform-frame-soak", "Reproduce the failing frame and make invalid input defensive without weakening deterministic stepping."],
  "replay-suite": ["platform-replay-failed", "Run the reported replay case in both runtimes and repair the first divergent checkpoint."],
  "acceptance-suite": ["platform-acceptance-failed", "Repair the first exported-runtime acceptance assertion before promotion."],
  "completion-witness": ["platform-completion-witness", "Regenerate a source-bound completion witness, then replay it in the exact exported artifact before promotion."],
  "terminal-state": ["platform-terminal-contract", "Author at least one executable acceptance test that asserts the intended terminal state, then rerun the platform harness."],
  "visual-capture": ["browser-harness-capture-failed", "Run the browser harness with a writable capture directory and repair the reported browser or rendering failure."],
};

function findingsFromChecks(checks) {
  return checks.filter((check) => check.status === "failed").map((check) => {
    const [code, repairAction] = FINDING_DETAILS[check.id] ?? ["platform-harness-failed", "Inspect the harness receipt and repair the exact exported artifact."];
    return {
      severity: "error",
      code,
      category: "platform-harness",
      message: check.detail,
      nextAction: {
        subsystem: "exported-runtime",
        affectedIds: [check.id],
        repairAction,
        evidenceRequired: [LOOPLAB_PLATFORM_HARNESS_SCHEMA],
      },
    };
  });
}

function standardExecutableCandidates() {
  return process.platform === "win32"
    ? [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      ]
    : process.platform === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]
      : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/microsoft-edge", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
}

export async function launchInstalledBrowser(options = {}) {
  const attempts = [];
  const launchOptions = {
    headless: options.headless !== false,
    args: ["--autoplay-policy=user-gesture-required", "--disable-background-timer-throttling"],
  };
  const candidates = [];
  if (options.executablePath) candidates.push({ label: options.executablePath, executablePath: options.executablePath });
  if (options.browserChannel) candidates.push({ label: `channel:${options.browserChannel}`, channel: options.browserChannel });
  else candidates.push({ label: "channel:chrome", channel: "chrome" }, { label: "channel:msedge", channel: "msedge" });
  for (const executablePath of standardExecutableCandidates()) {
    if (existsSync(executablePath) && !candidates.some((candidate) => candidate.executablePath === executablePath)) candidates.push({ label: executablePath, executablePath });
  }
  for (const candidate of candidates) {
    try {
      const browser = await chromium.launch({ ...launchOptions, ...(candidate.channel ? { channel: candidate.channel } : { executablePath: candidate.executablePath }) });
      return { browser, launchTarget: candidate.label, attempts };
    } catch (error) {
      attempts.push({ target: candidate.label, error: error instanceof Error ? error.message.split("\n")[0] : String(error) });
    }
  }
  const error = new Error("No supported installed Chrome or Edge browser could be launched.");
  error.attempts = attempts;
  throw error;
}

function installInstrumentation() {
  if (globalThis.__looplabPlatformInstrumentation) return;
  const state = {
    networkAttempts: [],
    audioConstructors: 0,
    audioResumeAttempts: 0,
    audioPolicyInstalled: false,
    audioPolicyError: null,
  };
  Object.defineProperty(globalThis, "__looplabPlatformInstrumentation", { value: state, configurable: false });
  const recordNetwork = (kind, value) => {
    let url = "";
    try { url = typeof value === "string" ? value : String(value?.url ?? value ?? ""); } catch { url = "[unreadable]"; }
    state.networkAttempts.push({ kind, url });
  };
  if (typeof globalThis.fetch === "function") {
    globalThis.fetch = function blockedFetch(input) {
      recordNetwork("fetch", input);
      return Promise.reject(new TypeError("LoopLab platform harness blocked a runtime fetch."));
    };
  }
  if (typeof globalThis.XMLHttpRequest === "function") {
    const NativeXhr = globalThis.XMLHttpRequest;
    globalThis.XMLHttpRequest = class HarnessXMLHttpRequest extends NativeXhr {
      open(method, url) {
        recordNetwork("xhr", url);
        throw new DOMException("LoopLab platform harness blocked XMLHttpRequest.", "NetworkError");
      }
    };
  }
  for (const name of ["WebSocket", "EventSource", "Worker", "SharedWorker"]) {
    const Native = globalThis[name];
    if (typeof Native !== "function") continue;
    globalThis[name] = new Proxy(Native, {
      construct(target, args) {
        recordNetwork(name, args[0]);
        throw new DOMException(`LoopLab platform harness blocked ${name}.`, "SecurityError");
      },
    });
  }
  try {
    if (typeof navigator?.sendBeacon === "function") {
      navigator.sendBeacon = function blockedBeacon(url) {
        recordNetwork("sendBeacon", url);
        return false;
      };
    }
  } catch {
    // Some browsers expose sendBeacon as a non-writable host method; request collectors remain active.
  }
  for (const name of ["AudioContext", "webkitAudioContext"]) {
    const Native = globalThis[name];
    if (typeof Native !== "function" || !Native.prototype) continue;
    try {
      const nativeResume = Native.prototype.resume;
      if (typeof nativeResume !== "function") continue;
      Object.defineProperty(Native.prototype, "resume", {
        configurable: true,
        value: function rejectedHarnessResume() {
          state.audioResumeAttempts += 1;
          return Promise.reject(new DOMException("LoopLab platform harness rejected AudioContext.resume().", "NotAllowedError"));
        },
      });
      const Wrapped = new Proxy(Native, {
        construct(target, args, newTarget) {
          state.audioConstructors += 1;
          return Reflect.construct(target, args, newTarget === Wrapped ? target : newTarget);
        },
      });
      globalThis[name] = Wrapped;
      state.audioPolicyInstalled = true;
    } catch (error) {
      state.audioPolicyError = error instanceof Error ? error.message : String(error);
    }
  }
}

function selectKeyboardAction(actions) {
  const candidates = ["move-right", "move-left", "move-up", "move-down", "jump", "interact"];
  const action = candidates.map((id) => actions.find((candidate) => candidate?.id === id)).find(Boolean)
    ?? actions.find((candidate) => Array.isArray(candidate?.bindings) && candidate.bindings.some((binding) => typeof binding === "string" && binding.trim()));
  if (!action) return null;
  const binding = action.bindings.find((candidate) => typeof candidate === "string" && candidate.trim());
  return binding ? { actionId: action.id, binding } : null;
}

function terminalAcceptanceId(tests) {
  const finalAssertions = (test) => (test.assertions ?? []).filter((assertion) => assertion.atTick === undefined || assertion.atTick === test.driver?.tickCount);
  const wonTest = tests.find((test) => finalAssertions(test).some((assertion) => assertion.target === "runtime-state" && assertion.property === "won" && assertion.operator === "equals" && assertion.expected === true));
  if (wonTest) return wonTest.id;
  return tests.find((test) => finalAssertions(test).some((assertion) => ["gameplay-variable", "completed-rule", "event-emitted", "object-property", "runtime-state", "traversal-path"].includes(assertion.target)))?.id ?? null;
}

export async function runPlatformHarness(options = {}) {
  const artifactHtml = String(options.html ?? "");
  if (!/^\s*<!doctype html>/i.test(artifactHtml)) throw new Error("Platform harness requires a complete standalone HTML artifact.");
  const frameCount = Math.max(1, Math.min(100_000, Math.trunc(Number(options.frameCount ?? LOOPLAB_PLATFORM_HARNESS_DEFAULTS.frameCount))));
  const frameMs = Math.max(1, Math.min(1_000, Number(options.frameMs ?? LOOPLAB_PLATFORM_HARNESS_DEFAULTS.frameMs)));
  const captureDirectory = options.captureDirectory ? resolve(String(options.captureDirectory)) : null;
  const checks = [];
  const pageErrors = [];
  const consoleErrors = [];
  const observedRequests = [];
  const artifactHash = artifactSha256(artifactHtml);
  const startedAt = new Date().toISOString();
  let browser = null;
  let browserInfo = null;
  let sourceDigest = null;
  let runtimeVersion = null;
  let runtime = null;
  let instrumentation = null;
  let aborted = false;
  const abortSignal = options.signal;
  const abortError = () => Object.assign(new Error("Platform harness cancelled."), { name: "AbortError" });
  const closeBrowserOnAbort = () => {
    aborted = true;
    void browser?.close().catch(() => {});
  };
  const visualEvidence = { requested: Boolean(captureDirectory), captureDirectory, initial: null, final: null };
  const visualCaptureErrors = [];
  try {
    if (abortSignal?.aborted) throw abortError();
    abortSignal?.addEventListener("abort", closeBrowserOnAbort, { once: true });
    const launched = await launchInstalledBrowser(options);
    browser = launched.browser;
    if (abortSignal?.aborted) throw abortError();
    browserInfo = { name: "chromium", version: browser.version(), launchTarget: launched.launchTarget, failedLaunchAttempts: launched.attempts };
    checks.push(passedCheck("browser-available", `Launched ${launched.launchTarget} (${browserInfo.version}).`));
    const context = await browser.newContext({ viewport: options.viewport ?? { width: 1_280, height: 800 }, serviceWorkers: "block" });
    await context.addInitScript(installInstrumentation);
    context.on("request", (request) => {
      if (EXTERNAL_PROTOCOL.test(request.url())) observedRequests.push({ method: request.method(), url: request.url(), resourceType: request.resourceType() });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.setContent(buildPlatformHarnessDocument(artifactHtml), { waitUntil: "load" });
    const iframe = page.locator("#looplab-platform-artifact");
    const iframeHandle = await iframe.elementHandle();
    const frame = await iframeHandle?.contentFrame();
    if (!frame) throw new Error("The scripts-only artifact frame was not created.");
    await frame.waitForFunction(() => document.querySelector("#looplab-runtime-bridge")?.dataset.ready === "true" && globalThis.looplabRuntime, undefined, { timeout: Number(options.readyTimeoutMs ?? 15_000) });
    checks.push(passedCheck("runtime-ready", "The exported runtime became ready inside the scripts-only frame."));
    const sandboxState = await frame.evaluate(() => {
      let storageBlocked = false;
      try { localStorage.setItem("looplab-platform-probe", "1"); localStorage.removeItem("looplab-platform-probe"); } catch { storageBlocked = true; }
      return { origin: location.origin, storageBlocked, hasFocus: document.hasFocus() };
    });
    const opaque = sandboxState.origin === "null" && sandboxState.storageBlocked;
    checks.push(opaque
      ? passedCheck("sandbox-opaque-origin", "The child has an opaque origin and cannot use localStorage.", sandboxState)
      : failedCheck("sandbox-opaque-origin", "The child did not retain the required opaque scripts-only sandbox.", sandboxState));
    runtime = await frame.evaluate(() => {
      const api = globalThis.looplabRuntime;
      return {
        version: api.version,
        sourceDigest: typeof api.getSourceDigest === "function" ? api.getSourceDigest() : null,
        runtimeAdapter: typeof api.getRuntimeAdapterInfo === "function" ? api.getRuntimeAdapterInfo() : null,
        inputActionLiveness: typeof api.getInputActionLiveness === "function" ? api.getInputActionLiveness() : null,
        completionReport: typeof api.getCompletionReport === "function" ? api.getCompletionReport() : null,
        presentationProgram: typeof api.getPresentationProgram === "function" ? api.getPresentationProgram() : null,
        presentationReport: typeof api.getPresentationReport === "function" ? api.getPresentationReport() : null,
        initialPresentationStatus: typeof api.getPresentationStatus === "function" ? api.getPresentationStatus() : null,
        gameShell: typeof api.getGameShell === "function" ? api.getGameShell() : null,
        gameShellReport: typeof api.getGameShellReport === "function" ? api.getGameShellReport() : null,
        initialGameShellState: typeof api.getGameShellState === "function" ? api.getGameShellState() : null,
        initialState: api.getState(),
        actions: JSON.parse(document.getElementById("looplab-project-data")?.textContent ?? "{}").inputActions ?? [],
        acceptanceTests: api.getAcceptanceTests(),
        replayCases: api.getReplayCases(),
      };
    });
    runtimeVersion = runtime.version;
    sourceDigest = runtime.sourceDigest;
    try {
      visualEvidence.initial = await captureBrowserEvidence({ frame, iframe, phase: "initial", captureDirectory });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      visualEvidence.initial = { phase: "initial", dom: null, screenshot: null, error: message };
      visualCaptureErrors.push({ phase: "initial", error: message });
    }
    const digestMatches = typeof sourceDigest === "string" && sourceDigest.length > 0 && (!options.expectedSourceDigest || sourceDigest === options.expectedSourceDigest);
    checks.push(digestMatches
      ? passedCheck("source-digest", `The artifact reports source digest ${sourceDigest}.`)
      : failedCheck("source-digest", options.expectedSourceDigest ? `Expected source digest ${options.expectedSourceDigest}, received ${sourceDigest ?? "none"}.` : "The exported runtime does not expose its Project Doctor source digest."));
    const shellStart = await frame.evaluate(() => {
      const api = globalThis.looplabRuntime;
      const required = ["getGameShell", "getGameShellReport", "getGameShellState", "startGame", "pause", "resume", "restart", "openGameSettings", "closeGameSettings"];
      const missingMethods = required.filter((name) => typeof api?.[name] !== "function");
      if (missingMethods.length) return { available: false, missingMethods };
      const source = api.getGameShell();
      const report = api.getGameShellReport();
      const initial = api.getGameShellState();
      if (initial?.enabled !== true) return { available: true, enabled: false, source, report, initial };
      if (initial.state === "title") api.startGame();
      const started = api.getGameShellState();
      api.pause();
      const paused = api.getGameShellState();
      const performanceBeforePause = api.getPerformance();
      return { available: true, enabled: true, source, report, initial, started, paused, performanceBeforePause };
    });
    let shellLifecycle = shellStart;
    if (shellStart.available && shellStart.enabled) {
      await new Promise((resolve) => setTimeout(resolve, 80));
      shellLifecycle = await frame.evaluate((startedLifecycle) => {
        const api = globalThis.looplabRuntime;
        const performanceAfterPause = api.getPerformance();
        const settingsExpected = startedLifecycle.source?.settings?.enabled !== false;
        api.openGameSettings();
        const settingsOpened = api.getGameShellState();
        const dialogOpened = document.getElementById("game-shell-settings-dialog")?.open === true;
        api.closeGameSettings();
        const settingsClosed = api.getGameShellState();
        const dialogClosed = document.getElementById("game-shell-settings-dialog")?.open !== true;
        api.resume();
        const resumed = api.getGameShellState();
        api.restart();
        const restarted = api.getGameShellState();
        const expectedRestartState = startedLifecycle.source?.restartMode === "title" ? "title" : "playing";
        if (restarted.state === "title") api.startGame();
        const final = api.getGameShellState();
        return {
          ...startedLifecycle,
          performanceAfterPause,
          settingsExpected,
          settingsOpened,
          dialogOpened,
          settingsClosed,
          dialogClosed,
          resumed,
          restarted,
          expectedRestartState,
          final,
        };
      }, shellStart);
    }
    if (!shellLifecycle.available) {
      checks.push(failedCheck("game-shell-lifecycle", "The exported runtime does not expose the complete standard game-shell API.", shellLifecycle));
    } else if (!shellLifecycle.enabled) {
      const waived = shellLifecycle.report?.status === "waived" && shellLifecycle.report?.shipReady === true;
      checks.push(waived
        ? unavailableCheck("game-shell-lifecycle", "The standard game shell is deliberately disabled by a valid authored waiver.", shellLifecycle)
        : failedCheck("game-shell-lifecycle", "The standard game shell is disabled without a valid ship-ready waiver.", shellLifecycle));
    } else {
      const pauseHeld = shellLifecycle.paused?.state === "paused"
        && shellLifecycle.paused?.simulationBlocked === true
        && shellLifecycle.performanceAfterPause?.fixedStepCount === shellLifecycle.performanceBeforePause?.fixedStepCount;
      const settingsPassed = shellLifecycle.settingsExpected === false
        || (shellLifecycle.settingsOpened?.settingsOpen === true && shellLifecycle.dialogOpened === true && shellLifecycle.settingsClosed?.settingsOpen === false && shellLifecycle.dialogClosed === true);
      const lifecyclePassed = shellLifecycle.report?.shipReady === true
        && shellLifecycle.started?.state === "playing"
        && pauseHeld
        && settingsPassed
        && shellLifecycle.resumed?.state === "playing"
        && shellLifecycle.restarted?.state === shellLifecycle.expectedRestartState
        && shellLifecycle.final?.state === "playing";
      checks.push(lifecyclePassed
        ? passedCheck("game-shell-lifecycle", "The exact artifact proved title/start, blocked pause, native settings open/close, resume, restart, and a playable final state.", shellLifecycle)
        : failedCheck("game-shell-lifecycle", "The exact artifact did not prove the complete authored title/start/pause/settings/resume/restart lifecycle.", shellLifecycle));
    }
    const saveRoundTrip = await frame.evaluate(() => {
      const api = globalThis.looplabRuntime;
      if (typeof api?.getSaveStatus !== "function" || typeof api?.exportSaveCode !== "function" || typeof api?.inspectSaveCode !== "function" || typeof api?.importSaveCode !== "function") {
        return { available: false, enabled: false, error: "The exported runtime does not expose the portable-save API." };
      }
      const status = api.getSaveStatus();
      if (status?.enabled !== true) return { available: true, enabled: false, status };
      const hostedAttempt = status.profile === "hosted" && typeof api.persistHostedSave === "function" ? api.persistHostedSave() : null;
      const first = api.exportSaveCode();
      const inspection = first?.ok ? api.inspectSaveCode(first.code) : null;
      const imported = first?.ok ? api.importSaveCode(first.code) : null;
      const second = imported?.ok ? api.exportSaveCode() : null;
      return {
        available: true,
        enabled: true,
        status,
        hostedAttempt: hostedAttempt ? { ok: hostedAttempt.ok === true, state: hostedAttempt.state ?? null, error: hostedAttempt.error ?? null } : null,
        first: { ok: first?.ok === true, codeCharacters: typeof first?.code === "string" ? first.code.length : 0, error: first?.error ?? null },
        inspection: inspection ? { valid: inspection.valid === true, sourceDigest: inspection.sourceDigest ?? null, integrity: inspection.integrity ?? null, errors: inspection.errors ?? [] } : null,
        imported: imported ? { ok: imported.ok === true, error: imported.error ?? null } : null,
        second: second ? { ok: second.ok === true, codeCharacters: typeof second.code === "string" ? second.code.length : 0, error: second.error ?? null } : null,
        identicalCode: Boolean(first?.ok && second?.ok && first.code === second.code),
        finalStatus: api.getSaveStatus(),
      };
    });
    if (!saveRoundTrip.available) {
      checks.push(failedCheck("portable-save-roundtrip", saveRoundTrip.error, saveRoundTrip));
    } else if (!saveRoundTrip.enabled) {
      checks.push(unavailableCheck("portable-save-roundtrip", "Portable saves are explicitly disabled for this project.", saveRoundTrip));
    } else {
      const hostedFallbackPassed = saveRoundTrip.status?.profile !== "hosted"
        || (saveRoundTrip.hostedAttempt?.ok === false && saveRoundTrip.hostedAttempt?.state === "unavailable");
      const roundTripPassed = saveRoundTrip.status?.sourceDigest === sourceDigest
        && saveRoundTrip.first?.ok === true
        && saveRoundTrip.inspection?.valid === true
        && saveRoundTrip.inspection?.sourceDigest === sourceDigest
        && saveRoundTrip.imported?.ok === true
        && saveRoundTrip.second?.ok === true
        && saveRoundTrip.identicalCode === true
        && hostedFallbackPassed;
      checks.push(roundTripPassed
        ? passedCheck("portable-save-roundtrip", saveRoundTrip.status.profile === "hosted" ? "Portable save state round-tripped and the opaque-origin hosted-storage failure degraded safely." : "Portable save state round-tripped without invoking persistent browser storage.", saveRoundTrip)
        : failedCheck("portable-save-roundtrip", "The exported portable save did not round-trip exactly or the hosted profile failed to degrade safely in the opaque sandbox.", saveRoundTrip));
    }
    const liveness = runtime.inputActionLiveness;
    const livenessDigestMatches = liveness?.sourceDigest === sourceDigest;
    checks.push(liveness?.passed === true && livenessDigestMatches
      ? passedCheck("input-action-liveness", `${liveness.liveCount}/${liveness.actionCount} declared actions have executable consumers in this exact source.`, liveness)
      : failedCheck(
          "input-action-liveness",
          !liveness ? "The exported runtime does not expose an input-action liveness report."
            : !livenessDigestMatches ? "The input-action liveness report is not bound to the artifact source digest."
              : `${liveness.deadCount ?? "Unknown"}/${liveness.actionCount ?? "unknown"} declared actions have no executable consumer.`,
          liveness ?? undefined,
        ));
    await new Promise((resolve) => setTimeout(resolve, 100));
    const startupPerformance = await frame.evaluate(() => globalThis.looplabRuntime.getPerformance());
    const selectedInput = selectKeyboardAction(runtime.actions);
    if (selectedInput) {
      const focusGameplaySurface = () => frame.evaluate((actionId) => {
        const options = Array.from(document.querySelectorAll("#choice-options button:not(:disabled)"));
        const choice = options.find((button) => button.dataset.actionId === actionId) ?? options[0] ?? null;
        const target = choice ?? document.getElementById("game");
        target?.focus();
        return { kind: choice ? "choice" : "canvas", choiceId: choice?.dataset.choiceId ?? null, actionId: choice?.dataset.actionId ?? null };
      }, selectedInput.actionId);
      const initialInputState = runtime.initialState;
      const focusTarget = await focusGameplaySurface();
      await page.keyboard.down(selectedInput.binding);
      await frame.waitForFunction(({ actionId, initialChoicePageId, initialRevision }) => {
        const state = globalThis.looplabRuntime.getState();
        const deterministic = state.deterministicState ?? {};
        return (deterministic.activeActionIds ?? []).includes(actionId)
          || (deterministic.activeInputCodes ?? []).length > 0
          || state.activeChoicePageId !== initialChoicePageId
          || state.gameplayRevision !== initialRevision;
      }, { actionId: selectedInput.actionId, initialChoicePageId: initialInputState.activeChoicePageId ?? null, initialRevision: initialInputState.gameplayRevision ?? 0 }, { timeout: 1_000 }).catch(() => {});
      const pressedSnapshot = await frame.evaluate(() => globalThis.looplabRuntime.getState());
      const pressedState = pressedSnapshot.deterministicState ?? {};
      await page.keyboard.up(selectedInput.binding);
      await frame.waitForFunction((actionId) => {
        const state = globalThis.looplabRuntime.getState().deterministicState ?? {};
        return !(state.activeActionIds ?? []).includes(actionId) && (state.activeInputCodes ?? []).length === 0;
      }, selectedInput.actionId, { timeout: 1_000 }).catch(() => {});
      const releasedState = await frame.evaluate(() => globalThis.looplabRuntime.getState().deterministicState ?? {});
      const browserPressed = (pressedState.activeActionIds ?? []).includes(selectedInput.actionId)
        || (pressedState.activeInputCodes ?? []).length > 0
        || pressedSnapshot.activeChoicePageId !== (initialInputState.activeChoicePageId ?? null)
        || pressedSnapshot.gameplayRevision !== (initialInputState.gameplayRevision ?? 0);
      const browserReleased = !(releasedState.activeActionIds ?? []).includes(selectedInput.actionId) && (releasedState.activeInputCodes ?? []).length === 0;
      checks.push(browserPressed && browserReleased
        ? passedCheck("real-keyboard-input", `Focused ${selectedInput.binding} activated and released ${selectedInput.actionId}.`, { selectedInput, focusTarget, pressedState, releasedState })
        : failedCheck("real-keyboard-input", `Focused ${selectedInput.binding} did not produce a complete ${selectedInput.actionId} press/release.`, { selectedInput, focusTarget, pressedState, releasedState }));
      await focusGameplaySurface();
      await page.keyboard.down(selectedInput.binding);
      const focusStealer = page.locator("#looplab-platform-focus-stealer");
      await focusStealer.click();
      await focusStealer.focus();
      await frame.waitForFunction(() => {
        const state = globalThis.looplabRuntime.getState().deterministicState ?? {};
        return (state.activeInputCodes ?? []).length === 0 && (state.activeActionIds ?? []).length === 0;
      }, undefined, { timeout: 1_000 }).catch(() => {});
      const blurredState = await frame.evaluate(() => {
        globalThis.looplabRuntime.step(16);
        return globalThis.looplabRuntime.getState().deterministicState ?? {};
      });
      await page.keyboard.up(selectedInput.binding);
      const blurReleased = (blurredState.activeInputCodes ?? []).length === 0 && (blurredState.activeActionIds ?? []).length === 0;
      checks.push(blurReleased
        ? passedCheck("blur-clears-input", "Losing iframe focus cleared every held input.", blurredState)
        : failedCheck("blur-clears-input", "The artifact retained held input after losing iframe focus.", blurredState));
      const semanticActions = await frame.evaluate((actions) => {
        const api = globalThis.looplabRuntime;
        const snapshot = () => {
          const state = api.getState();
          return {
            activeMapId: state.activeMapId,
            activeChoicePageId: state.activeChoicePageId ?? null,
            gameplayRevision: state.gameplayRevision ?? 0,
            variables: state.variables ?? {},
            completedRuleIds: state.completedRuleIds ?? [],
            won: Boolean(state.won),
            player: state.player ? { x: state.player.x, y: state.player.y, vx: state.player.vx, vy: state.player.vy } : null,
            deterministicState: state.deterministicState ?? {},
          };
        };
        const same = (first, second) => JSON.stringify(first) === JSON.stringify(second);
        const results = [];
        for (const action of actions) {
          if (typeof api.reset === "function") api.reset();
          const before = snapshot();
          api.setInput(action.id, true);
          const pressResult = api.step(17);
          const pressed = snapshot();
          api.setInput(action.id, false);
          const releaseResult = api.step(17);
          const released = snapshot();
          const pressedDeterministic = pressed.deterministicState ?? {};
          const releasedDeterministic = released.deterministicState ?? {};
          const inputEvents = (pressResult.events ?? []).filter((event) => event?.type === "input.action" && event.actionId === action.id);
          const gameplayEvents = [...(pressResult.events ?? []), ...(releaseResult.events ?? [])].filter((event) => event?.type !== "input.action").map((event) => event?.type).filter(Boolean);
          const transportActivated = (pressedDeterministic.activeActionIds ?? []).includes(action.id) || inputEvents.length > 0;
          const releasedCleanly = !(releasedDeterministic.activeActionIds ?? []).includes(action.id)
            && (releasedDeterministic.activeInputCodes ?? []).length === 0;
          const effects = [];
          if (!same(before.player, pressed.player)) effects.push("player-state");
          if (before.gameplayRevision !== pressed.gameplayRevision) effects.push("gameplay-revision");
          if (!same(before.variables, pressed.variables)) effects.push("variables");
          if (!same(before.completedRuleIds, pressed.completedRuleIds)) effects.push("completed-rules");
          if (before.activeChoicePageId !== pressed.activeChoicePageId) effects.push("choice-page");
          if (before.activeMapId !== pressed.activeMapId) effects.push("map-transition");
          if (before.won !== pressed.won) effects.push("terminal-state");
          if (gameplayEvents.length > 0) effects.push("semantic-event");
          results.push({
            actionId: action.id,
            binding: (action.bindings ?? []).find((binding) => typeof binding === "string" && binding.trim()) ?? null,
            passed: transportActivated && releasedCleanly,
            transportActivated,
            releasedCleanly,
            observedEffects: [...new Set(effects)],
            emittedEvents: [...new Set(gameplayEvents)],
            pressed: pressedDeterministic,
            released: releasedDeterministic,
          });
        }
        if (typeof api.reset === "function") api.reset();
        return results;
      }, runtime.actions);
      const semanticPassed = semanticActions.length === runtime.actions.length && semanticActions.length > 0 && semanticActions.every((action) => action.passed);
      checks.push(semanticPassed
        ? passedCheck("semantic-input", `All ${semanticActions.length} declared semantic actions activated and released through the exported API.`, { actions: semanticActions })
        : failedCheck("semantic-input", `${semanticActions.filter((action) => !action.passed).length}/${runtime.actions.length} declared semantic actions failed exported press/release routing.`, { actions: semanticActions }));
    } else {
      checks.push(failedCheck("real-keyboard-input", "The artifact has no authored action with a concrete browser binding."));
      checks.push(failedCheck("blur-clears-input", "Blur release could not be tested without an authored browser binding."));
      checks.push(failedCheck("semantic-input", "The artifact has no semantic input action to drive."));
    }
    if (runtime.presentationProgram && typeof runtime.initialPresentationStatus === "object") {
      await frame.evaluate(() => globalThis.looplabRuntime.resume());
      await frame.waitForFunction(() => {
        const status = globalThis.looplabRuntime.getPresentationStatus?.();
        return ["failed", "running", "unavailable", "disabled"].includes(status?.audio?.state);
      }, undefined, { timeout: 1_000 }).catch(() => {});
    }
    instrumentation = await frame.evaluate(() => JSON.parse(JSON.stringify(globalThis.__looplabPlatformInstrumentation ?? {})));
    const inputChecksPassed = checks.filter((check) => ["input-action-liveness", "real-keyboard-input", "semantic-input"].includes(check.id)).every((check) => check.status === "passed");
    checks.push(instrumentation.audioPolicyInstalled && inputChecksPassed
      ? passedCheck("audio-failure-isolated", `A rejecting AudioContext.resume policy was installed; input remained operational (${instrumentation.audioResumeAttempts ?? 0} resume attempt(s)).`, instrumentation)
      : failedCheck("audio-failure-isolated", "The hostile audio policy was unavailable or gameplay input failed while it was active.", instrumentation));
    const presentationStatus = await frame.evaluate(() => typeof globalThis.looplabRuntime.getPresentationStatus === "function" ? globalThis.looplabRuntime.getPresentationStatus() : null);
    if (!runtime.presentationProgram) {
      checks.push(unavailableCheck("presentation-runtime-isolated", "The artifact has no authored presentation program."));
    } else {
      const presentationIsolated = presentationStatus?.simulationIndependent === true
        && Number(presentationStatus.handledEventCount ?? 0) > 0
        && presentationStatus.audio?.state === "failed"
        && typeof presentationStatus.audio?.error === "string"
        && inputChecksPassed;
      checks.push(presentationIsolated
        ? passedCheck("presentation-runtime-isolated", "The authored presentation controller consumed events, contained the hostile Web Audio failure, and left input operational.", presentationStatus)
        : failedCheck("presentation-runtime-isolated", "The presentation controller did not prove event handling and Web Audio failure isolation under the hostile policy.", presentationStatus ?? undefined));
    }
    const soak = await frame.evaluate(({ count, milliseconds }) => {
      const api = globalThis.looplabRuntime;
      api.pause();
      let eventCount = 0;
      for (let index = 0; index < count; index += 1) {
        if (index % 8 === 7) api.setInput("__looplab_invalid_input__", true);
        const result = api.step(milliseconds);
        eventCount += result.events?.length ?? 0;
        if (index % 8 === 7) api.setInput("__looplab_invalid_input__", false);
      }
      return { frameCount: count, frameMs: milliseconds, eventCount, state: api.getState(), performance: api.getPerformance() };
    }, { count: frameCount, milliseconds: frameMs });
    const soakFinite = [soak.state?.player?.x, soak.state?.player?.y, soak.performance?.fixedStepCount].filter((value) => value !== undefined).every(Number.isFinite);
    checks.push(soakFinite && soak.performance.fixedStepCount >= frameCount
      ? passedCheck("frame-soak", `${frameCount} exact ${frameMs} ms frames completed with invalid-input noise every eighth frame.`, soak)
      : failedCheck("frame-soak", "The exact-step soak produced non-finite state or fewer simulation steps than requested.", soak));
    const replay = await frame.evaluate(() => globalThis.looplabRuntime.runReplaySuite());
    checks.push(replay.status === "no-fixtures"
      ? unavailableCheck("replay-suite", "The artifact has no replay fixtures.", replay)
      : replay.passed
        ? passedCheck("replay-suite", `${replay.passedCount}/${replay.caseCount} exported replay cases passed.`, replay)
        : failedCheck("replay-suite", `The exported replay suite failed first at ${replay.firstDivergence?.caseId ?? "an unknown case"}.`, replay));
    const acceptance = await frame.evaluate(() => globalThis.looplabRuntime.runAcceptanceSuite());
    const executableAcceptancePassed = acceptance.executableCount > 0
      && acceptance.failedCount === 0
      && acceptance.invalidCount === 0
      && acceptance.passedCount === acceptance.executableCount;
    checks.push(acceptance.status === "no-specs" || acceptance.executableCount === 0
      ? failedCheck("acceptance-suite", "The artifact has no executable acceptance specifications.", acceptance)
      : executableAcceptancePassed
        ? passedCheck("acceptance-suite", `${acceptance.passedCount}/${acceptance.executableCount} executable acceptance tests passed; ${acceptance.specifiedCount ?? 0} prose-only specification(s) were not counted as evidence.`, acceptance)
        : failedCheck("acceptance-suite", `The exported executable acceptance suite has ${acceptance.failedCount ?? 0} failure(s) and ${acceptance.invalidCount ?? 0} invalid test(s).`, acceptance));
    const completion = runtime.completionReport;
    let completionWitness = null;
    if (completion?.status === "not-applicable") {
      checks.push(unavailableCheck("completion-witness", "This project explicitly has no required terminal target.", completion));
    } else if (completion?.status === "passed" && completion.sourceDigest === sourceDigest && completion.reproTape) {
      completionWitness = await frame.evaluate((report) => {
        const api = globalThis.looplabRuntime;
        const tape = report.reproTape;
        const tickRate = Number(tape.tickRate ?? 60);
        const inputsByTick = new Map();
        for (const input of tape.inputs ?? []) {
          const values = inputsByTick.get(input.tick) ?? [];
          values.push(input);
          inputsByTick.set(input.tick, values);
        }
        api.pause();
        api.reset();
        const startLoaded = tape.startMapId ? api.loadMap(tape.startMapId, tape.startSpawnId ?? null) : true;
        for (let tick = 0; tick < Number(tape.tickCount ?? 0); tick += 1) {
          for (const input of inputsByTick.get(tick) ?? []) api.setInput(input.actionId, input.pressed !== false);
          api.step(1_000 / tickRate);
        }
        const state = api.getState();
        const result = {
          witnessId: report.witnessId,
          proof: report.proof,
          startMapId: tape.startMapId ?? null,
          startSpawnId: tape.startSpawnId ?? null,
          startLoaded,
          tickRate,
          tickCount: Number(tape.tickCount ?? 0),
          transitionCount: (tape.inputs ?? []).length,
          reachedTerminal: state.won === true,
          state,
        };
        api.reset();
        return result;
      }, completion);
      checks.push(completionWitness.startLoaded !== false && completionWitness.reachedTerminal
        ? passedCheck("completion-witness", `Source-bound witness ${completion.witnessId} reached runtime.won in the exact exported artifact.`, { report: completion, replay: completionWitness })
        : failedCheck("completion-witness", `Source-bound witness ${completion.witnessId} did not reach runtime.won in the exact exported artifact.`, { report: completion, replay: completionWitness }));
    } else {
      const detail = !completion
        ? "The exported runtime does not expose a completion report."
        : completion.sourceDigest !== sourceDigest
          ? "The completion report is not bound to the exported source digest."
          : `The completion report status is ${completion.status}; no replayable terminal witness exists.`;
      checks.push(failedCheck("completion-witness", detail, completion ?? undefined));
    }
    const terminalTestId = terminalAcceptanceId(runtime.acceptanceTests);
    const terminalResult = terminalTestId ? acceptance.tests.find((test) => test.testId === terminalTestId) : null;
    checks.push(terminalResult?.passed
      ? passedCheck("terminal-state", `Acceptance test ${terminalTestId} reached the authored final outcome.`, terminalResult)
      : completionWitness?.reachedTerminal
        ? passedCheck("terminal-state", `Completion witness ${completion.witnessId} reached the final outcome in the exported runtime.`, completionWitness)
        : failedCheck("terminal-state", terminalTestId ? `Final-outcome acceptance test ${terminalTestId} failed in the exported runtime.` : "No executable acceptance test or source-bound completion witness reached an authored final outcome.", terminalResult ?? completion ?? undefined));
    instrumentation = await frame.evaluate(() => JSON.parse(JSON.stringify(globalThis.__looplabPlatformInstrumentation ?? {})));
    const resourceEntries = await frame.evaluate(() => performance.getEntriesByType("resource").map((entry) => ({ name: entry.name, initiatorType: entry.initiatorType })));
    const attemptedExternal = [...observedRequests, ...(instrumentation.networkAttempts ?? []).filter((entry) => EXTERNAL_PROTOCOL.test(entry.url)), ...resourceEntries.filter((entry) => EXTERNAL_PROTOCOL.test(entry.name))];
    checks.push(attemptedExternal.length === 0
      ? passedCheck("no-external-requests", "No external runtime request was attempted.")
      : failedCheck("no-external-requests", `${attemptedExternal.length} external runtime request(s) were attempted.`, attemptedExternal));
    const relevantConsoleErrors = consoleErrors.filter((message) => !/favicon/i.test(message));
    checks.push(pageErrors.length === 0 && relevantConsoleErrors.length === 0
      ? passedCheck("no-unhandled-errors", "No unhandled page or console errors were observed.")
      : failedCheck("no-unhandled-errors", `${pageErrors.length} page error(s) and ${relevantConsoleErrors.length} console error(s) were observed.`, { pageErrors, consoleErrors: relevantConsoleErrors }));
    try {
      visualEvidence.final = await captureBrowserEvidence({ frame, iframe, phase: "final", captureDirectory });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      visualEvidence.final = { phase: "final", dom: null, screenshot: null, error: message };
      visualCaptureErrors.push({ phase: "final", error: message });
    }
    if (captureDirectory) {
      const screenshots = [visualEvidence.initial?.screenshot, visualEvidence.final?.screenshot].filter(Boolean);
      checks.push(visualCaptureErrors.length === 0 && screenshots.length === 2
        ? passedCheck("visual-capture", `Captured initial and final browser frames in ${captureDirectory}.`, screenshots)
        : failedCheck("visual-capture", "The browser harness could not capture both visual checkpoints.", visualCaptureErrors));
    }
    runtime = { ...runtime, save: saveRoundTrip, presentationStatus, startupPerformance, soak, replay, acceptance, completion, completionWitness };
    await context.close();
  } catch (error) {
    if (abortSignal?.aborted || error?.name === "AbortError") {
      aborted = true;
    } else if (!checks.some((check) => check.id === "browser-available")) {
      checks.push(failedCheck("browser-available", error instanceof Error ? error.message : String(error), error?.attempts));
    } else if (!checks.some((check) => check.id === "runtime-ready")) {
      checks.push(failedCheck("runtime-ready", error instanceof Error ? error.message : String(error), { pageErrors, consoleErrors, observedRequests }));
    } else {
      checks.push(failedCheck("no-unhandled-errors", error instanceof Error ? error.message : String(error)));
    }
  } finally {
    abortSignal?.removeEventListener("abort", closeBrowserOnAbort);
    await browser?.close().catch(() => {});
  }
  if (aborted) throw abortError();
  const findings = findingsFromChecks(checks);
  const passed = findings.length === 0;
  return {
    schemaVersion: LOOPLAB_PLATFORM_HARNESS_SCHEMA,
    runner: "playwright-core",
    runnerVersion: LOOPLAB_PLATFORM_HARNESS_VERSION,
    status: passed ? "passed" : "failed",
    passed,
    sourceDigest,
    expectedSourceDigest: options.expectedSourceDigest ?? null,
    artifactSha256: artifactHash,
    startedAt,
    completedAt: new Date().toISOString(),
    environment: {
      sandbox: ["allow-scripts"],
      opaqueOriginRequired: true,
      csp: INLINE_CSP,
      frameCount,
      frameMs,
      malformedInputInterval: LOOPLAB_PLATFORM_HARNESS_DEFAULTS.malformedInputInterval,
      hostileAudioResume: true,
      browser: browserInfo,
      viewport: options.viewport ?? { width: 1_280, height: 800 },
    },
    runtimeVersion,
    checks,
    findings,
    runtime,
    instrumentation,
    visualEvidence,
  };
}
