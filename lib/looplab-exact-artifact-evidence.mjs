import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { launchInstalledBrowser } from "./looplab-platform-harness.mjs";
import { analyzeRuntimeJoinPixels, buildRuntimeJoinPlan } from "./looplab-runtime-join.mjs";
import {
  createReplayEvidence,
  createRuntimePlaytestEvidence,
  validateVerificationEvidence,
  verificationCoverageRequirements,
} from "./looplab-verification.mjs";

export const LOOPLAB_EXACT_ARTIFACT_EVIDENCE_SCHEMA = "looplab-exact-artifact-evidence/v1";

const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const safeSegment = (value) => String(value ?? "capture").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "capture";
const clone = (value) => JSON.parse(JSON.stringify(value));
const absoluteLocalPath = (value) => /^(?:[A-Za-z]:[\\/]|\\\\|\/(?!\/))/.test(String(value ?? ""));
const portablePathLeaf = (value) => String(value ?? "").split(/[\\/]+/).filter(Boolean).at(-1) ?? "";

function portableEvidenceValue(value, { pathContext = false, trail = "evidenceRefs" } = {}) {
  if (Array.isArray(value)) return value.map((entry, index) => portableEvidenceValue(entry, { pathContext, trail: `${trail}[${index}]` }));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      portableEvidenceValue(entry, { pathContext: pathContext || /path/i.test(key), trail: `${trail}.${key}` }),
    ]));
  }
  if (typeof value !== "string" || !absoluteLocalPath(value)) return value;
  if (!pathContext) throw new Error(`${trail} contains an absolute local path outside a declared path field.`);
  return portablePathLeaf(value);
}

export function preparePersistentVerificationEvidence(evidenceRefs) {
  if (!Array.isArray(evidenceRefs)) throw new Error("Exact artifact evidence must be an array before it can be persisted.");
  const portable = portableEvidenceValue(evidenceRefs);
  const leakedPath = [];
  const inspect = (value, trail = "evidenceRefs") => {
    if (Array.isArray(value)) return value.forEach((entry, index) => inspect(entry, `${trail}[${index}]`));
    if (value && typeof value === "object") return Object.entries(value).forEach(([key, entry]) => inspect(entry, `${trail}.${key}`));
    if (typeof value === "string" && absoluteLocalPath(value)) leakedPath.push(trail);
  };
  inspect(portable);
  if (leakedPath.length) throw new Error(`Persistent verification evidence still contains absolute local paths at ${leakedPath.slice(0, 4).join(", ")}.`);
  return portable;
}

function routeMaps(project) {
  if (Array.isArray(project?.maps) && project.maps.length) return project.maps;
  return [{
    id: project?.activeMapId ?? project?.startMapId ?? "map-main",
    name: project?.name ?? "Main map",
    width: Number(project?.width ?? 960),
    height: Number(project?.height ?? 540),
    objects: Array.isArray(project?.objects) ? project.objects : [],
  }];
}

function normalizedProfiles(project) {
  const requested = Array.isArray(project?.deviceProfiles) && project.deviceProfiles.length
    ? project.deviceProfiles
    : [{ id: "desktop", name: "Desktop", width: 1280, height: 800, dpr: 1, touchTargetMin: 44 }];
  return requested.map((profile, index) => {
    const width = Math.max(240, Math.min(3840, Math.trunc(Number(profile.width ?? 1280))));
    const height = Math.max(240, Math.min(2160, Math.trunc(Number(profile.height ?? 800))));
    const dpr = Math.max(1, Math.min(3, Number(profile.dpr ?? 1)));
    return {
      id: String(profile.id ?? `profile-${index + 1}`),
      name: String(profile.name ?? profile.id ?? `Profile ${index + 1}`),
      width,
      height,
      dpr,
      touchTargetMin: Math.max(24, Math.min(96, Number(profile.touchTargetMin ?? 44))),
      expectsTouch: profile.touch === true || width <= 700 || /touch|mobile|portrait/i.test(String(profile.id ?? profile.name ?? "")),
    };
  });
}

export function buildExactArtifactEvidencePlan(project, { sourceDigest } = {}) {
  const joins = buildRuntimeJoinPlan(project);
  if (joins.status === "invalid") throw new Error(`Runtime-join plan is invalid: ${joins.issues.map((issue) => issue.message).join(" ")}`);
  return {
    schemaVersion: "looplab-exact-artifact-evidence-plan/v1",
    sourceDigest,
    maps: routeMaps(project).map((map) => ({ id: map.id, name: map.name ?? map.id, width: Number(map.width), height: Number(map.height) })),
    profiles: normalizedProfiles(project),
    joins: clone(joins.joins),
  };
}

async function settleArtifactFrame(frame) {
  await frame.waitForFunction(() => Array.from(document.images).every((image) => image.complete), undefined, { timeout: 5_000 }).catch(() => {});
  await frame.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
}

async function inspectCanvas(frame) {
  return frame.evaluate(() => {
    const canvas = document.querySelector("#game");
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error("The exact artifact has no #game canvas.");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("The exact artifact canvas has no readable 2D context.");
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    let opaque = 0;
    let luminanceTotal = 0;
    let luminanceSquaredTotal = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const alpha = pixels[offset + 3];
      if (alpha >= 250) opaque += 1;
      if (colors.size < 4097) colors.add(`${red >> 4}:${green >> 4}:${blue >> 4}:${alpha >> 5}`);
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      luminanceTotal += luminance;
      luminanceSquaredTotal += luminance * luminance;
    }
    const pixelCount = Math.max(1, pixels.length / 4);
    const mean = luminanceTotal / pixelCount;
    const luminanceStdDev = Math.sqrt(Math.max(0, luminanceSquaredTotal / pixelCount - mean * mean));
    const rect = canvas.getBoundingClientRect();
    const frameRect = document.querySelector(".frame")?.getBoundingClientRect() ?? null;
    const hudRect = document.querySelector(".game-bar")?.getBoundingClientRect() ?? null;
    const touchControls = document.querySelector("#touch-controls");
    const touchVisible = touchControls instanceof HTMLElement && !touchControls.hidden && getComputedStyle(touchControls).display !== "none";
    const touchTargets = touchControls ? Array.from(touchControls.querySelectorAll("button")).map((button) => {
      const bounds = button.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    }) : [];
    return {
      width: canvas.width,
      height: canvas.height,
      renderedBounds: { width: rect.width, height: rect.height, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      documentBounds: { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
      frameBounds: frameRect ? { width: frameRect.width, height: frameRect.height, left: frameRect.left, top: frameRect.top, right: frameRect.right, bottom: frameRect.bottom } : null,
      hudBounds: hudRect ? { width: hudRect.width, height: hudRect.height, left: hudRect.left, top: hudRect.top, right: hudRect.right, bottom: hudRect.bottom } : null,
      touchVisible,
      touchTargets,
      contentStats: {
        distinctQuantizedColorCount: colors.size,
        luminanceMean: mean,
        luminanceStdDev,
        opaquePixelRatio: opaque / pixelCount,
        flatFrame: colors.size < 4 || luminanceStdDev < 1,
      },
    };
  });
}

async function captureCanvasPng(frame, path) {
  const options = { type: "png", animations: "disabled", caret: "hide" };
  const png = await frame.locator("#game").screenshot(path ? { ...options, path } : options);
  return { png, sha256: sha256(png), byteLength: png.byteLength, path: path ?? null };
}

async function captureAnalysisFrame(frame, path) {
  const png = await captureCanvasPng(frame, path);
  const sampled = await frame.evaluate(() => {
    const source = document.querySelector("#game");
    if (!(source instanceof HTMLCanvasElement)) throw new Error("The exact artifact has no #game canvas.");
    const scale = Math.min(1, 320 / Math.max(1, source.width), 180 / Math.max(1, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const target = document.createElement("canvas");
    target.width = width;
    target.height = height;
    const context = target.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    let binary = "";
    for (let offset = 0; offset < pixels.length; offset += 32_768) binary += String.fromCharCode(...pixels.subarray(offset, offset + 32_768));
    return { width, height, pixelsBase64: btoa(binary) };
  });
  return { ...sampled, pixels: Uint8ClampedArray.from(Buffer.from(sampled.pixelsBase64, "base64")), sha256: png.sha256, path: png.path };
}

function responsiveEvidence(profile, sourceDigest, canvas) {
  const checks = [
    { id: "layout-width-contained", passed: canvas.documentBounds.scrollWidth <= canvas.viewport.width + 1, detail: `Document width ${canvas.documentBounds.scrollWidth}px within ${canvas.viewport.width}px viewport.` },
    { id: "profile-dpr", passed: Math.abs(Number(canvas.viewport.devicePixelRatio) - profile.dpr) < 0.01, detail: `Artifact DPR ${Number(canvas.viewport.devicePixelRatio).toFixed(2)} matches configured DPR ${profile.dpr.toFixed(2)}.` },
    { id: "canvas-visible", passed: canvas.renderedBounds.width > 0 && canvas.renderedBounds.height > 0, detail: `Canvas rendered at ${canvas.renderedBounds.width.toFixed(1)}×${canvas.renderedBounds.height.toFixed(1)} CSS pixels.` },
    { id: "canvas-width-contained", passed: canvas.renderedBounds.left >= -1 && canvas.renderedBounds.right <= canvas.viewport.width + 1, detail: "The play canvas stays horizontally inside the artifact viewport." },
    { id: "hud-width-contained", passed: !canvas.hudBounds || (canvas.hudBounds.left >= -1 && canvas.hudBounds.right <= canvas.viewport.width + 1), detail: "The exported HUD stays horizontally inside the artifact viewport." },
    { id: "profile-touch-controls", passed: profile.expectsTouch === canvas.touchVisible, detail: profile.expectsTouch ? "Touch profile exposes controls after a touch pointer." : "Desktop profile keeps touch controls hidden." },
    { id: "touch-target-size", passed: !profile.expectsTouch || canvas.touchTargets.every((target) => target.width >= profile.touchTargetMin && target.height >= profile.touchTargetMin), detail: profile.expectsTouch ? `Touch targets meet ${profile.touchTargetMin}px.` : "Touch target sizing does not apply." },
  ];
  return {
    version: 2,
    type: "responsive",
    id: `responsive:${profile.id}:${sourceDigest}`,
    status: checks.every((check) => check.passed) ? "passed" : "failed",
    sourceDigest,
    createdAt: new Date().toISOString(),
    runner: "looplab-headless-exact-artifact",
    profileId: profile.id,
    profileName: profile.name,
    profileSimulation: "headless-browser-profile",
    targetViewport: { width: profile.width, height: profile.height, devicePixelRatio: profile.dpr },
    viewport: canvas.viewport,
    renderedBounds: { width: canvas.renderedBounds.width, height: canvas.renderedBounds.height },
    expectsTouch: profile.expectsTouch,
    checks: checks.map((check) => ({ id: check.id, status: check.passed ? "passed" : "failed", detail: check.detail })),
  };
}

function screenshotEvidence(map, profile, sourceDigest, canvas, png) {
  const contentPassed = canvas.contentStats.flatFrame !== true;
  return {
    version: 2,
    type: "screenshot",
    id: `exact-canvas:${map.id}:${profile.id}:${png.sha256.slice(-16)}`,
    status: contentPassed ? "passed" : "failed",
    sourceDigest,
    createdAt: new Date().toISOString(),
    runner: "looplab-headless-exact-artifact",
    mapId: map.id,
    mapName: map.name,
    profileId: profile.id,
    profileName: profile.name,
    sha256: png.sha256,
    width: canvas.width,
    height: canvas.height,
    viewport: canvas.viewport,
    targetViewport: { width: profile.width, height: profile.height, devicePixelRatio: profile.dpr },
    renderedBounds: { width: canvas.renderedBounds.width, height: canvas.renderedBounds.height },
    cleanPlay: true,
    editorOverlays: false,
    profileSimulation: "headless-browser-profile",
    contentStats: canvas.contentStats,
    capturePath: png.path,
  };
}

async function collectProfileEvidence({ browser, artifactHtml, plan, profile, captureDirectory }) {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.dpr,
    hasTouch: profile.expectsTouch,
    serviceWorkers: "block",
  });
  const evidence = [];
  const captures = [];
  try {
    const page = await context.newPage();
    await page.setContent(artifactHtml, { waitUntil: "load" });
    const frame = page;
    await frame.waitForFunction(() => document.querySelector("#looplab-runtime-bridge")?.dataset.ready === "true" && globalThis.looplabRuntime, undefined, { timeout: 15_000 });
    const reportedDigest = await frame.evaluate(() => globalThis.looplabRuntime.getSourceDigest());
    if (reportedDigest !== plan.sourceDigest) throw new Error(`Profile ${profile.id} loaded stale source ${reportedDigest}; expected ${plan.sourceDigest}.`);
    if (profile.expectsTouch) await frame.evaluate(() => document.querySelector("#game")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", pointerId: 1 })));
    for (const map of plan.maps) {
      const loaded = await frame.evaluate((mapId) => { const api = globalThis.looplabRuntime; api.pause(); api.reset(); const ok = api.loadMap(mapId, null); if (ok) api.step(16); return ok; }, map.id);
      if (!loaded) throw new Error(`Exact artifact could not load map ${map.id}.`);
      await settleArtifactFrame(frame);
      const canvas = await inspectCanvas(frame);
      const path = captureDirectory ? join(captureDirectory, `${safeSegment(profile.id)}--${safeSegment(map.id)}.png`) : null;
      const png = await captureCanvasPng(frame, path);
      const screenshot = screenshotEvidence(map, profile, plan.sourceDigest, canvas, png);
      evidence.push(screenshot);
      captures.push({ id: screenshot.id, mapId: map.id, profileId: profile.id, sha256: png.sha256, path: png.path, contentStats: canvas.contentStats });
    }
    const responsiveCanvas = await inspectCanvas(frame);
    evidence.push(responsiveEvidence(profile, plan.sourceDigest, responsiveCanvas));
    for (const joinPlan of plan.joins) {
      const sourceProbe = await frame.evaluate((portalId) => globalThis.looplabRuntime.beginRuntimeJoinProbe?.(portalId), joinPlan.portalId);
      if (!sourceProbe?.ok) throw new Error(sourceProbe?.error ?? `Runtime join ${joinPlan.portalId} could not begin.`);
      await settleArtifactFrame(frame);
      const sourcePath = captureDirectory ? join(captureDirectory, `${safeSegment(profile.id)}--join-${safeSegment(joinPlan.portalId)}--source.png`) : null;
      const sourceFrame = await captureAnalysisFrame(frame, sourcePath);
      const transition = await frame.evaluate((portalId) => globalThis.looplabRuntime.commitRuntimeJoinProbe?.(portalId), joinPlan.portalId);
      if (!transition?.ok) throw new Error(transition?.error ?? `Runtime join ${joinPlan.portalId} could not commit.`);
      await settleArtifactFrame(frame);
      const targetPath = captureDirectory ? join(captureDirectory, `${safeSegment(profile.id)}--join-${safeSegment(joinPlan.portalId)}--target.png`) : null;
      const targetFrame = await captureAnalysisFrame(frame, targetPath);
      await frame.evaluate(() => globalThis.looplabRuntime.finishRuntimeJoinProbe?.());
      const targetMap = plan.maps.find((map) => map.id === joinPlan.targetMapId);
      const edgeExtent = joinPlan.contract.targetEdge === "left" || joinPlan.contract.targetEdge === "right" ? targetMap?.width : targetMap?.height;
      const captureExtent = joinPlan.contract.targetEdge === "left" || joinPlan.contract.targetEdge === "right" ? targetFrame.width : targetFrame.height;
      const captureScale = captureExtent / Math.max(1, Number(edgeExtent ?? captureExtent));
      const analysis = analyzeRuntimeJoinPixels({
        sourceFrame,
        targetFrame,
        contract: { ...joinPlan.contract, overlapPixels: Math.round(Number(joinPlan.contract.overlapPixels ?? 0) * captureScale), sampleDepth: Math.max(1, Math.round(Number(joinPlan.contract.sampleDepth ?? 8) * captureScale)) },
      });
      const behaviorChecks = [
        { id: "runtime-transition", passed: transition.transitioned === true, detail: transition.transitioned ? `Entered ${joinPlan.targetMapId} through ${joinPlan.portalId}.` : `The real runtime did not enter ${joinPlan.targetMapId}.` },
        { id: "exact-target-spawn", passed: joinPlan.contract.requireExactSpawn === false || transition.exactSpawn === true, detail: transition.exactSpawn ? `Player landed at exact spawn ${joinPlan.targetSpawnId}.` : "The runtime missed the exact target spawn." },
        { id: "clear-target-landing", passed: joinPlan.contract.requireClearLanding === false || transition.landingClear === true, detail: transition.landingClear ? "The target landing is clear." : "The target landing overlaps solid authored geometry." },
      ];
      const checks = [...behaviorChecks, ...analysis.checks].map((check) => ({ id: check.id, status: check.passed ? "passed" : "failed", detail: check.detail }));
      evidence.push({
        version: 2,
        type: "runtime-join",
        id: `runtime-join:${joinPlan.portalId}:${profile.id}:${targetFrame.sha256.slice(-16)}`,
        status: checks.every((check) => check.status === "passed") ? "passed" : "failed",
        sourceDigest: plan.sourceDigest,
        createdAt: new Date().toISOString(),
        runner: "looplab-headless-exact-artifact",
        portalId: joinPlan.portalId,
        sourceMapId: joinPlan.sourceMapId,
        targetMapId: joinPlan.targetMapId,
        targetSpawnId: joinPlan.targetSpawnId,
        profileId: profile.id,
        profileSimulation: "headless-browser-profile",
        sourceSha256: sourceFrame.sha256,
        targetSha256: targetFrame.sha256,
        actualVisibleJoin: transition.transitioned === true,
        playerExcluded: sourceProbe.playerExcluded === true && transition.playerExcluded === true,
        nextUniqueContentInspected: true,
        metrics: analysis.metrics,
        checks,
        capturePaths: { source: sourceFrame.path, target: targetFrame.path },
      });
    }
  } finally {
    await context.close().catch(() => {});
  }
  return { evidence, captures };
}

export async function collectExactArtifactVerificationEvidence({ html, project, sourceDigest, captureDirectory, browserChannel, executablePath, signal } = {}) {
  const artifactHtml = String(html ?? "");
  if (!/^\s*<!doctype html>/i.test(artifactHtml)) throw new Error("Exact artifact evidence requires a complete one-file HTML document.");
  if (typeof sourceDigest !== "string" || !sourceDigest) throw new Error("Exact artifact evidence requires the current source digest.");
  const plan = buildExactArtifactEvidencePlan(project, { sourceDigest });
  const requirements = verificationCoverageRequirements(project);
  const directory = captureDirectory ? resolve(String(captureDirectory)) : null;
  if (directory) await mkdir(directory, { recursive: true });
  const playtest = createRuntimePlaytestEvidence(project, { sourceDigest, runner: "looplab-headless-deterministic-playtest" });
  const replay = createReplayEvidence(project, { sourceDigest, runner: "looplab-headless-replay-runner" });
  const evidenceRefs = [playtest, ...(replay ? [replay] : [])];
  const captures = [];
  let browser = null;
  let browserInfo = null;
  try {
    if (signal?.aborted) throw Object.assign(new Error("Exact artifact evidence cancelled."), { name: "AbortError" });
    const launched = await launchInstalledBrowser({ browserChannel, executablePath, headless: true });
    browser = launched.browser;
    browserInfo = { launchTarget: launched.launchTarget, version: browser.version() };
    for (const profile of plan.profiles) {
      if (signal?.aborted) throw Object.assign(new Error("Exact artifact evidence cancelled."), { name: "AbortError" });
      const collected = await collectProfileEvidence({ browser, artifactHtml, plan, profile, captureDirectory: directory });
      evidenceRefs.push(...collected.evidence);
      captures.push(...collected.captures);
    }
  } finally {
    await browser?.close().catch(() => {});
  }
  const persistentEvidenceRefs = preparePersistentVerificationEvidence(evidenceRefs);
  const validation = validateVerificationEvidence(persistentEvidenceRefs, { sourceDigest, ...requirements });
  return {
    schemaVersion: LOOPLAB_EXACT_ARTIFACT_EVIDENCE_SCHEMA,
    status: validation.valid ? "passed" : "failed",
    passed: validation.valid,
    sourceDigest,
    artifactSha256: sha256(artifactHtml),
    plan,
    requirements,
    evidenceRefs: persistentEvidenceRefs,
    validation: { valid: validation.valid, errors: validation.errors },
    captures,
    browser: browserInfo,
    usage: { provider: "local", model: "none", inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, estimatedUsd: 0, billingBasis: "local-operation", actualChargeClaimed: false },
  };
}
