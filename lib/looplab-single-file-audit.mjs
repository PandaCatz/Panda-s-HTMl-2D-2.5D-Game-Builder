import { extractProjectFromHtml } from "./looplab-html-project.mjs";
import { sha256Hex } from "./looplab-canonical-digest.mjs";
import { LOOPLAB_PHASER_BROWSER_SHA256, LOOPLAB_PHASER_BROWSER_VERSION } from "./generated/looplab-phaser-browser-bundle.mjs";
import {
  exportProfileId,
  inspectSaveProgram,
  LOOPLAB_HOSTED_STORAGE_WRAPPER_SCHEMA,
  LOOPLAB_HOSTED_STORAGE_WRAPPER_SHA256,
  LOOPLAB_HOSTED_STORAGE_WRAPPER_VERSION,
} from "./looplab-save-state.mjs";

const EXECUTABLE_SCRIPT_TYPES = new Set(["", "text/javascript", "application/javascript"]);
const FORBIDDEN_DATA_SCRIPT_TYPES = new Set(["importmap", "application/importmap+json", "speculationrules"]);

function byteLength(value) {
  if (typeof TextEncoder === "function") return new TextEncoder().encode(value).byteLength;
  return unescape(encodeURIComponent(value)).length;
}

function countMatches(value, expression) {
  return [...value.matchAll(expression)].length;
}

function attributeValue(attributes, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attributes);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function maskJavaScript(source, { maskLiterals }) {
  let output = "";
  const stack = [{ type: "code", templateExpressionDepth: null }];
  const masked = (character) => (character === "\n" || character === "\r" ? character : " ");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    const state = stack.at(-1);
    if (state.type === "line-comment") {
      if (character === "\n" || character === "\r") {
        stack.pop();
        output += character;
      } else output += " ";
      continue;
    }
    if (state.type === "block-comment") {
      if (character === "*" && next === "/") {
        output += "  ";
        index += 1;
        stack.pop();
      } else output += masked(character);
      continue;
    }
    if (state.type === "string") {
      output += maskLiterals ? masked(character) : character;
      if (state.escaped) state.escaped = false;
      else if (character === "\\") state.escaped = true;
      else if (character === state.quote) stack.pop();
      continue;
    }
    if (state.type === "template") {
      if (!state.escaped && character === "$" && next === "{") {
        output += maskLiterals ? "  " : "${";
        index += 1;
        stack.push({ type: "code", templateExpressionDepth: 1 });
        continue;
      }
      output += maskLiterals ? masked(character) : character;
      if (state.escaped) state.escaped = false;
      else if (character === "\\") state.escaped = true;
      else if (character === "`") stack.pop();
      continue;
    }
    if (character === "/" && next === "/") {
      output += "  ";
      index += 1;
      stack.push({ type: "line-comment" });
      continue;
    }
    if (character === "/" && next === "*") {
      output += "  ";
      index += 1;
      stack.push({ type: "block-comment" });
      continue;
    }
    if (character === "'" || character === '"') {
      output += maskLiterals ? " " : character;
      stack.push({ type: "string", quote: character, escaped: false });
      continue;
    }
    if (character === "`") {
      output += maskLiterals ? " " : character;
      stack.push({ type: "template", escaped: false });
      continue;
    }
    if (state.templateExpressionDepth !== null) {
      if (character === "{") state.templateExpressionDepth += 1;
      else if (character === "}") {
        state.templateExpressionDepth -= 1;
        output += character;
        if (state.templateExpressionDepth === 0) stack.pop();
        continue;
      }
    }
    output += character;
  }
  return output;
}

function maskJavaScriptComments(source) {
  return maskJavaScript(source, { maskLiterals: false });
}

function maskJavaScriptLiterals(source) {
  return maskJavaScript(source, { maskLiterals: true });
}

function decodeSimpleJavaScriptString(literal) {
  const quote = literal[0];
  const body = literal.slice(1, -1);
  if (quote === "`" && body.includes("${")) return null;
  let value = "";
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character !== "\\") {
      value += character;
      continue;
    }
    const escaped = body[index + 1];
    if (escaped === undefined) return null;
    index += 1;
    const simpleEscapes = { b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", 0: "\0" };
    if (Object.prototype.hasOwnProperty.call(simpleEscapes, escaped)) value += simpleEscapes[escaped];
    else if (escaped === "\n") continue;
    else if (escaped === "\r") {
      if (body[index + 1] === "\n") index += 1;
    } else if (escaped === "x") {
      const digits = body.slice(index + 1, index + 3);
      if (!/^[0-9a-f]{2}$/i.test(digits)) return null;
      value += String.fromCharCode(Number.parseInt(digits, 16));
      index += 2;
    } else if (escaped === "u") {
      const braced = /^\{([0-9a-f]{1,6})\}/i.exec(body.slice(index + 1));
      if (braced) {
        const codePoint = Number.parseInt(braced[1], 16);
        if (codePoint > 0x10ffff) return null;
        value += String.fromCodePoint(codePoint);
        index += braced[0].length;
      } else {
        const digits = body.slice(index + 1, index + 5);
        if (!/^[0-9a-f]{4}$/i.test(digits)) return null;
        value += String.fromCharCode(Number.parseInt(digits, 16));
        index += 4;
      }
    } else value += escaped;
  }
  return value;
}

function foldSimpleStringExpression(expression) {
  const parts = [];
  let index = 0;
  while (index < expression.length) {
    while (/\s/.test(expression[index] ?? "")) index += 1;
    const quote = expression[index];
    if (quote !== "'" && quote !== '"' && quote !== "`") return null;
    const start = index;
    index += 1;
    let escaped = false;
    while (index < expression.length) {
      const character = expression[index];
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) break;
      index += 1;
    }
    if (expression[index] !== quote) return null;
    const value = decodeSimpleJavaScriptString(expression.slice(start, index + 1));
    if (value === null) return null;
    parts.push(value);
    index += 1;
    while (/\s/.test(expression[index] ?? "")) index += 1;
    if (index === expression.length) return parts.join("");
    if (expression[index] !== "+") return null;
    index += 1;
  }
  return null;
}

function computedGlobalMembers(source) {
  const members = [];
  const pattern = /\b(globalThis|window|self|navigator|document|caches)\s*(?:\?\.)?\s*\[([^\]\r\n]{1,256})\]/g;
  for (const match of source.matchAll(pattern)) {
    const name = foldSimpleStringExpression(match[2]);
    if (name !== null) members.push({ base: match[1], name });
  }
  return members;
}
function estimateDataUrlBytes(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return 0;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const metadata = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (/;base64(?:;|$)/i.test(metadata)) {
    const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor(payload.length * 3 / 4) - padding);
  }
  try {
    return byteLength(decodeURIComponent(payload));
  } catch {
    return byteLength(payload);
  }
}

function credentialFindings(html, project) {
  const findings = [];
  let scannableHtml = html;
  for (const record of [...(project?.assets ?? []), ...(project?.resources ?? [])]) {
    if (typeof record?.dataUrl === "string" && record.dataUrl.startsWith("data:")) scannableHtml = scannableHtml.replaceAll(record.dataUrl, "data:[embedded-payload]");
  }
  const credentialPatterns = [
    ["OpenAI-style secret key", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/],
    ["Anthropic-style secret key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
    ["Google-style API key", /\bAIza[0-9A-Za-z_-]{30,}/],
    ["GitHub-style access token", /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ];
  for (const [label, pattern] of credentialPatterns) if (pattern.test(scannableHtml)) findings.push(label);

  const visit = (value, path = "project") => {
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      const nestedPath = `${path}.${key}`;
      if (/^(?:api[_-]?key|secret|password|passphrase|token|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|private[_-]?key|authorization)$/i.test(key) && typeof nested === "string" && nested.trim() && !/^\[?(?:redacted|removed)\]?$/i.test(nested.trim())) findings.push(`credential-shaped field at ${nestedPath}`);
      else if (nested && typeof nested === "object") visit(nested, nestedPath);
    }
  };
  visit(project);
  return [...new Set(findings)];
}

export function auditStandaloneHtml(html, options = {}) {
  const errors = [];
  const warnings = [];
  const checks = [];
  const add = (severity, code, message) => (severity === "error" ? errors : warnings).push({ severity, code, message });
  const check = (id, passed, detail) => checks.push({ id, passed, detail });
  if (typeof html !== "string" || !html.trim()) {
    add("error", "empty-html", "The artifact is empty.");
    return { valid: false, uploadFileCount: 0, byteLength: 0, embeddedPayloadBytes: 0, decodedImageMemoryBytes: 0, scriptCount: 0, errors, warnings, checks };
  }

  const doctypeCount = countMatches(html, /<!doctype\s+html\s*>/gi);
  const htmlOpenCount = countMatches(html, /<html\b[^>]*>/gi);
  const htmlCloseCount = countMatches(html, /<\/html\s*>/gi);
  const completeDocument = doctypeCount === 1 && htmlOpenCount === 1 && htmlCloseCount === 1 && /<\/html\s*>\s*$/i.test(html);
  check("one-complete-document", completeDocument, `${doctypeCount} doctype, ${htmlOpenCount} opening html tag, ${htmlCloseCount} closing html tag`);
  if (!completeDocument) add("error", "document-shell", "Export must contain exactly one complete HTML document and end after its closing </html> tag.");

  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  let executableScriptCount = 0;
  const embeddedRuntimeVendors = [];
  const embeddedRuntimeCapabilities = [];
  for (const script of scripts) {
    const attributes = script[1] ?? "";
    const source = script[2] ?? "";
    const src = attributeValue(attributes, "src");
    const href = attributeValue(attributes, "href") ?? attributeValue(attributes, "xlink:href");
    const type = (attributeValue(attributes, "type") ?? "").trim().toLowerCase();
    const vendor = (attributeValue(attributes, "data-looplab-vendor") ?? "").trim().toLowerCase();
    const capability = (attributeValue(attributes, "data-looplab-capability") ?? "").trim().toLowerCase();
    let trustedVendor = false;
    let trustedCapability = false;
    if (src !== null) add("error", "external-script", `Script source ${src || "(empty)"} is not inline.`);
    if (href !== null) add("error", "external-script", `Script href ${href || "(empty)"} is not inline.`);
    if (type === "module") add("error", "module-script", "Module scripts are not allowed in the uploadable one-file artifact.");
    if (FORBIDDEN_DATA_SCRIPT_TYPES.has(type)) add("error", "active-data-script", `${type} scripts can trigger loading or execution outside the audited runtime and are not allowed.`);
    if (!EXECUTABLE_SCRIPT_TYPES.has(type)) continue;
    executableScriptCount += 1;
    try {
      // Compilation verifies syntax without executing the game runtime.
      new Function(source);
    } catch (error) {
      add("error", "script-parse", `Inline runtime script does not parse: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (vendor) {
      const declaredVersion = attributeValue(attributes, "data-version");
      const declaredSha256 = attributeValue(attributes, "data-sha256");
      const actualSha256 = sha256Hex(source);
      if (vendor !== "phaser") add("error", "unknown-runtime-vendor", `Embedded runtime vendor ${vendor} is not allowlisted.`);
      else if (declaredVersion !== LOOPLAB_PHASER_BROWSER_VERSION) add("error", "runtime-vendor-version", `Embedded Phaser version ${declaredVersion ?? "(missing)"} does not match pinned version ${LOOPLAB_PHASER_BROWSER_VERSION}.`);
      else if (declaredSha256 !== LOOPLAB_PHASER_BROWSER_SHA256 || actualSha256 !== LOOPLAB_PHASER_BROWSER_SHA256) add("error", "runtime-vendor-integrity", "The embedded Phaser browser bundle does not match LoopLab's pinned SHA-256.");
      else trustedVendor = true;
      embeddedRuntimeVendors.push({ vendor, version: declaredVersion, declaredSha256, actualSha256, trusted: trustedVendor });
    }
    if (vendor && capability) add("error", "runtime-script-role-conflict", "One inline script cannot be both a runtime vendor and a privileged LoopLab capability.");
    if (capability) {
      const declaredVersion = attributeValue(attributes, "data-version");
      const declaredSha256 = attributeValue(attributes, "data-sha256");
      const actualSha256 = sha256Hex(source);
      if (capability !== LOOPLAB_HOSTED_STORAGE_WRAPPER_SCHEMA) add("error", "unknown-runtime-capability", `Embedded runtime capability ${capability} is not allowlisted.`);
      else if (declaredVersion !== LOOPLAB_HOSTED_STORAGE_WRAPPER_VERSION) add("error", "runtime-capability-version", `Hosted storage wrapper version ${declaredVersion ?? "(missing)"} does not match ${LOOPLAB_HOSTED_STORAGE_WRAPPER_VERSION}.`);
      else if (declaredSha256 !== LOOPLAB_HOSTED_STORAGE_WRAPPER_SHA256 || actualSha256 !== LOOPLAB_HOSTED_STORAGE_WRAPPER_SHA256) add("error", "runtime-capability-integrity", "The hosted storage wrapper does not match LoopLab's exact SHA-256-authenticated source.");
      else trustedCapability = true;
      embeddedRuntimeCapabilities.push({ capability, version: declaredVersion, declaredSha256, actualSha256, trusted: trustedCapability });
    }
    const syntaxCode = maskJavaScriptLiterals(source);
    const commentsOnlyCode = maskJavaScriptComments(source);
    const forbiddenRuntimeCalls = [
      ["network-fetch", /\bfetch\s*\(/, "fetch()"],
      ["network-xhr", /\bXMLHttpRequest\b/, "XMLHttpRequest"],
      ["network-websocket", /\bWebSocket\s*\(/, "WebSocket"],
      ["network-eventsource", /\bEventSource\s*\(/, "EventSource"],
      ["network-beacon", /\bsendBeacon\s*\(/, "sendBeacon()"],
      ["persistent-storage", /\b(?:localStorage|sessionStorage|indexedDB|document\s*\.\s*cookie)\b/, "browser storage"],
      ["service-worker", /\b(?:navigator\s*\.\s*)?serviceWorker\b|\bimportScripts\s*\(/, "service worker"],
      ["cache-api", /\bcaches\s*\.\s*(?:open|match|keys|delete)\s*\(|\bCacheStorage\b/, "Cache API"],
      ["worker-runtime", /\b(?:new\s+)?(?:Worker|SharedWorker)\s*\(|\b(?:audioWorklet|paintWorklet)\s*\.\s*addModule\s*\(/, "worker or worklet runtime"],
      ["network-webrtc", /\bRTCPeerConnection\s*\(/, "RTCPeerConnection"],
      ["network-webtransport", /\bWebTransport\s*\(/, "WebTransport"],
      ["dynamic-code", /\b(?:eval\s*\(|(?:new\s+)?Function\s*\()/, "eval() or Function()"],
      ["dynamic-import", /\bimport\s*\(/, "dynamic import()"],
      ["static-import", /(^|[;{}\n])\s*import\s+(?!\()/m, "static module import"],
    ];
    const computedRuntimeKinds = new Map([
      ["fetch", ["network-fetch", "computed fetch"]],
      ["XMLHttpRequest", ["network-xhr", "computed XMLHttpRequest"]],
      ["WebSocket", ["network-websocket", "computed WebSocket"]],
      ["EventSource", ["network-eventsource", "computed EventSource"]],
      ["sendBeacon", ["network-beacon", "computed sendBeacon"]],
      ["localStorage", ["persistent-storage", "computed localStorage"]],
      ["sessionStorage", ["persistent-storage", "computed sessionStorage"]],
      ["indexedDB", ["persistent-storage", "computed indexedDB"]],
      ["cookie", ["persistent-storage", "computed document.cookie"]],
      ["serviceWorker", ["service-worker", "computed serviceWorker"]],
      ["importScripts", ["service-worker", "computed importScripts"]],
      ["caches", ["cache-api", "computed Cache API"]],
      ["Worker", ["worker-runtime", "computed Worker"]],
      ["SharedWorker", ["worker-runtime", "computed SharedWorker"]],
      ["audioWorklet", ["worker-runtime", "computed audioWorklet"]],
      ["paintWorklet", ["worker-runtime", "computed paintWorklet"]],
      ["RTCPeerConnection", ["network-webrtc", "computed RTCPeerConnection"]],
      ["WebTransport", ["network-webtransport", "computed WebTransport"]],
      ["eval", ["dynamic-code", "computed eval"]],
      ["Function", ["dynamic-code", "computed Function"]],
    ]);
    // A byte-identical pinned engine may contain dormant loader/storage APIs. The browser
    // harness still rejects any actual request; authored runtime scripts never receive this exemption.
    if (!trustedVendor) {
      for (const [codeId, pattern, label] of forbiddenRuntimeCalls) {
        if (trustedCapability && codeId === "persistent-storage") continue;
        if (pattern.test(syntaxCode)) add("error", codeId, `${label} would make the shipped game depend on runtime I/O, runtime code construction, or another module.`);
      }
      for (const { base, name } of computedGlobalMembers(commentsOnlyCode)) {
        const kind = base === "caches" && ["open", "match", "keys", "delete"].includes(name)
          ? ["cache-api", `computed caches.${name}`]
          : computedRuntimeKinds.get(name);
        if (!kind || (trustedCapability && kind[0] === "persistent-storage")) continue;
        add("error", kind[0], `${kind[1]} access would make the shipped game depend on runtime I/O or runtime code construction.`);
      }
    }
  }
  check("inline-runtime-scripts", !errors.some((issue) => ["external-script", "module-script", "script-parse", "dynamic-code", "dynamic-import", "static-import", "service-worker", "cache-api"].includes(issue.code)), `${executableScriptCount} executable inline script(s)`);

  for (const link of html.matchAll(/<link\b([^>]*)>/gi)) {
    const rel = (attributeValue(link[1] ?? "", "rel") ?? "").trim().toLowerCase();
    const href = attributeValue(link[1] ?? "", "href");
    if (href && !href.startsWith("data:") && !href.startsWith("#")) add("error", "external-link-resource", `Linked resource ${href} is external to the HTML file.`);
    if (["modulepreload", "prefetch", "prerender"].includes(rel)) add("error", "active-link-resource", `Link rel=${rel} can initiate loading outside the audited runtime and is not allowed.`);
  }
  for (const resource of html.matchAll(/<(img|audio|video|source|track|iframe|embed|object)\b([^>]*)>/gi)) {
    const tag = resource[1].toLowerCase();
    const attributes = resource[2] ?? "";
    if (["iframe", "embed", "object"].includes(tag)) add("error", "embedded-execution-context", `${tag} creates a nested execution or plugin context that this one-file audit cannot safely recurse into.`);
    if (tag === "iframe" && attributeValue(attributes, "srcdoc") !== null) add("error", "iframe-srcdoc", "iframe srcdoc is not allowed in a one-file game.");
    const srcset = attributeValue(attributes, "srcset");
    if (srcset !== null) add("error", "unsupported-srcset", `${tag} srcset is not allowed because every candidate resource must be audited independently.`);
    const url = attributeValue(attributes, tag === "object" ? "data" : "src");
    if (url && !url.startsWith("data:") && !url.startsWith("#")) add("error", "external-media-resource", `${tag} resource ${url} is not embedded.`);
    if (tag === "video") {
      const poster = attributeValue(attributes, "poster");
      if (poster && !poster.startsWith("data:") && !poster.startsWith("#")) add("error", "external-media-resource", `video poster ${poster} is not embedded.`);
    }
  }
  for (const tag of html.matchAll(/<[A-Za-z][\w:-]*\b([^>]*)>/g)) {
    const style = attributeValue(tag[1] ?? "", "style");
    if (!style) continue;
    for (const match of style.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
      const url = match[2].trim();
      if (url && !url.startsWith("data:") && !url.startsWith("#")) add("error", "external-css-resource", `Inline style resource ${url} is not embedded.`);
    }
  }
  for (const meta of html.matchAll(/<meta\b([^>]*)>/gi)) {
    if ((attributeValue(meta[1] ?? "", "http-equiv") ?? "").trim().toLowerCase() === "refresh") add("error", "navigation-refresh", "Meta refresh navigation is not allowed in a one-file game.");
  }
  for (const base of html.matchAll(/<base\b([^>]*)>/gi)) {
    if (attributeValue(base[1] ?? "", "href") !== null) add("error", "navigation-base", "A base href can rewrite audited resource URLs and is not allowed.");
  }
  for (const form of html.matchAll(/<form\b([^>]*)>/gi)) {
    const action = attributeValue(form[1] ?? "", "action");
    if (action && !action.startsWith("#")) add("error", "navigation-form", `Form action ${action} leaves the one-file artifact.`);
  }
  for (const anchor of html.matchAll(/<a\b([^>]*)>/gi)) {
    if (attributeValue(anchor[1] ?? "", "ping") !== null) add("error", "network-ping", "Anchor ping requests are not allowed in a one-file game.");
  }
  for (const svgReference of html.matchAll(/<(?:image|use|feImage)\b([^>]*)>/gi)) {
    const href = attributeValue(svgReference[1] ?? "", "href") ?? attributeValue(svgReference[1] ?? "", "xlink:href");
    if (href && !href.startsWith("data:") && !href.startsWith("#")) add("error", "external-svg-resource", `SVG resource ${href} is not embedded.`);
  }
  for (const style of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    if (/@import\b/i.test(style[1])) add("error", "css-import", "CSS @import is not allowed in a one-file game.");
    for (const match of style[1].matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
      const url = match[2].trim();
      if (url && !url.startsWith("data:") && !url.startsWith("#")) add("error", "external-css-resource", `CSS resource ${url} is not embedded.`);
    }
  }

  let project = null;
  try {
    project = extractProjectFromHtml(html).project;
  } catch (error) {
    add("error", "project-metadata", error instanceof Error ? error.message : String(error));
  }

  let embeddedPayloadBytes = 0;
  let decodedImageMemoryBytes = 0;
  let embeddedResourceCount = 0;
  if (project) {
    const embeddedRecords = [...(project.assets ?? []), ...(project.resources ?? [])];
    for (const record of embeddedRecords) {
      if (typeof record.dataUrl !== "string" || !record.dataUrl.startsWith("data:")) {
        add("error", "asset-not-embedded", `${record.name ?? record.id ?? "Project resource"} is not stored as a data URL.`);
        continue;
      }
      embeddedResourceCount += 1;
      embeddedPayloadBytes += estimateDataUrlBytes(record.dataUrl);
    }
    for (const asset of project.assets ?? []) {
      const width = Number(asset.width ?? 0);
      const height = Number(asset.height ?? 0);
      if (width > 0 && height > 0) decodedImageMemoryBytes += Math.ceil(width) * Math.ceil(height) * 4;
    }
    if (project.release?.singleFile === false) add("error", "release-not-single-file", "Embedded project metadata disables single-file release.");
    if (project.release?.runtimeBundleEmbedded === false) add("error", "runtime-not-embedded", "Embedded project metadata says the runtime bundle is external.");
    if ((project.release?.externalRequests ?? []).length) add("error", "external-release-request", "Embedded project metadata declares external release requests.");
    if (project.release?.allowNetwork === true) add("error", "release-io-enabled", "The shipped game metadata allows network access.");
    const exportProfile = exportProfileId(project);
    const saveReport = inspectSaveProgram(project, project.saveProgram);
    for (const issue of saveReport.issues) if (issue.severity === "error") add("error", issue.code, issue.message);
    const hostedCapabilities = embeddedRuntimeCapabilities.filter((entry) => entry.capability === LOOPLAB_HOSTED_STORAGE_WRAPPER_SCHEMA);
    const trustedHostedCapabilities = hostedCapabilities.filter((entry) => entry.trusted);
    if (exportProfile === "strict") {
      if (embeddedRuntimeCapabilities.length) add("error", "strict-storage-wrapper", "Strict export must not embed any privileged storage wrapper.");
      if (project.release?.allowStorage === true || project.release?.storageFree === false) add("error", "release-io-enabled", "Strict export metadata enables persistent storage.");
    } else {
      if (hostedCapabilities.length !== 1 || trustedHostedCapabilities.length !== 1) add("error", "hosted-storage-wrapper-count", "Hosted export must contain exactly one byte-verified LoopLab storage wrapper.");
      if (embeddedRuntimeCapabilities.length !== 1) add("error", "hosted-capability-count", "Hosted export cannot embed another privileged runtime capability.");
    }
    const framework = project.runtimeProfile?.framework === "standalone" ? "canvas" : project.runtimeProfile?.framework ?? "canvas";
    const trustedPhaserVendors = embeddedRuntimeVendors.filter((entry) => entry.vendor === "phaser" && entry.trusted);
    if (framework === "phaser") {
      if (trustedPhaserVendors.length !== 1) add("error", "phaser-runtime-missing", "A Phaser project must contain exactly one byte-verified pinned Phaser browser bundle.");
      if (project.release?.engineDelivery !== "inline-script-tag") add("error", "phaser-delivery-metadata", "A Phaser project must record inline-script-tag engine delivery.");
    } else if (framework === "pixi" || framework === "melon") add("error", "runtime-adapter-unavailable", `${framework} decision knowledge is installed, but its exact one-file runtime adapter is not release-ready yet.`);
    else if (embeddedRuntimeVendors.length) add("error", "unused-runtime-vendor", "The artifact embeds an engine bundle that is not selected by its runtime profile.");
    const budget = Number(options.packageBudgetBytes ?? project.packageBudgetBytes ?? 2_000_000);
    if (Number.isFinite(budget) && budget > 0 && byteLength(html) > budget) add("warning", "package-budget", `HTML size ${byteLength(html).toLocaleString()} bytes exceeds the ${budget.toLocaleString()} byte project budget.`);
  }

  for (const finding of credentialFindings(html, project)) add("error", "embedded-credential", `Possible ${finding} found in the upload artifact.`);
  const uniqueErrors = [...new Map(errors.map((issue) => [`${issue.code}:${issue.message}`, issue])).values()];
  const uniqueWarnings = [...new Map(warnings.map((issue) => [`${issue.code}:${issue.message}`, issue])).values()];
  const artifactBytes = byteLength(html);
  check("no-external-dependencies", !uniqueErrors.some((issue) => /^(?:external-|network-|css-import|asset-not-embedded|release-io|persistent-storage|service-worker|cache-api|worker-runtime|active-|embedded-execution-context|iframe-srcdoc|unsupported-srcset|navigation-)/.test(issue.code)), "No detected runtime network, unsanctioned storage, module, nested-context, navigation, or linked-file dependency");
  check("persistence-profile", !uniqueErrors.some((issue) => /^(?:strict-storage|hosted-storage|hosted-capability|runtime-capability|unknown-runtime-capability)/.test(issue.code)), project ? `${exportProfileId(project)} one-file profile` : "No valid project profile");
  check("no-embedded-credentials", !uniqueErrors.some((issue) => issue.code === "embedded-credential"), "Credential-shaped values are rejected");
  check("embedded-project", Boolean(project), project ? `${project.maps?.length ?? 1} map(s), ${embeddedResourceCount} embedded resource(s)` : "No valid Looplab metadata");

  return {
    valid: uniqueErrors.length === 0,
    uploadFileCount: 1,
    byteLength: artifactBytes,
    embeddedPayloadBytes,
    decodedImageMemoryBytes,
    embeddedResourceCount,
    scriptCount: executableScriptCount,
    errors: uniqueErrors,
    warnings: uniqueWarnings,
    checks,
    runtimeVendors: embeddedRuntimeVendors,
    runtimeCapabilities: embeddedRuntimeCapabilities,
  };
}

export function assertStandaloneHtml(html, options = {}) {
  const audit = auditStandaloneHtml(html, options);
  if (!audit.valid) {
    const summary = audit.errors.slice(0, 4).map((issue) => issue.code).join(", ");
    throw new Error(`Single-file artifact gate blocked HTML export${summary ? `: ${summary}` : "."}`);
  }
  return audit;
}
