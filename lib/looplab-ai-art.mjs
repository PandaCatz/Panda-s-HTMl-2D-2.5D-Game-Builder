import { createHash } from "node:crypto";
import {
  LOOPLAB_VISUAL_IDENTITY_LIMITS,
  inspectVisualIdentity,
  visualIdentityContextForRole,
} from "./looplab-visual-identity.mjs";

export const LOOPLAB_AI_ART_VERSION = "looplab-ai-art/v1";
export const LOOPLAB_AI_ART_ROLES = Object.freeze(["character", "enemy", "pickup", "prop", "effect", "ui", "tileset", "environment"]);
export const LOOPLAB_AI_ART_QUALITIES = Object.freeze(["low", "medium", "high"]);
export const LOOPLAB_AI_ART_FRAME_SIZES = Object.freeze([16, 32, 48, 64]);

const DEFAULT_ACTIONS = Object.freeze({
  character: ["idle", "walk-contact", "walk-pass", "walk-recoil"],
  enemy: ["idle", "anticipate", "attack", "recover"],
  pickup: ["front", "quarter-turn", "side", "three-quarter-turn"],
  prop: ["front"],
  effect: ["start", "expand", "peak", "fade"],
  ui: ["default"],
  tileset: ["ground", "edge", "corner", "wall", "accent", "transition"],
  environment: ["background"],
});

const IMAGE_OUTPUT_USD = Object.freeze({
  "gpt-image-2": Object.freeze({ low: 0.006, medium: 0.053, high: 0.211 }),
  "gpt-image-1.5": Object.freeze({ low: 0.009, medium: 0.034, high: 0.133 }),
  "gpt-image-1": Object.freeze({ low: 0.011, medium: 0.042, high: 0.167 }),
  "gpt-image-1-mini": Object.freeze({ low: 0.005, medium: 0.011, high: 0.036 }),
});

const trimText = (value, maximum) => String(value ?? "").trim().slice(0, maximum);
const canonicalModel = (value) => trimText(value, 120).toLowerCase().replace(/-\d{4}-\d{2}-\d{2}$/, "");
const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");

function normalizeActions(value, role) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n|\|/) : [];
  const actions = source.map((entry) => trimText(entry, 80)).filter(Boolean).slice(0, 8);
  return actions.length ? [...new Set(actions)] : [...DEFAULT_ACTIONS[role]];
}

function normalizePalette(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((color) => trimText(color, 7).toLowerCase()).filter((color) => /^#[0-9a-f]{6}$/.test(color)))].slice(0, 16);
}

function parseReferencePng(asset, reference) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=\r\n]+)$/.exec(String(asset?.dataUrl ?? ""));
  if (!match) throw new Error(`Visual identity reference ${reference.id} must resolve to an embedded PNG asset.`);
  const bytes = Buffer.from(match[1].replace(/\s+/g, ""), "base64");
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error(`Visual identity reference ${reference.id} is not a valid PNG.`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height) throw new Error(`Visual identity reference ${reference.id} has invalid PNG dimensions.`);
  return {
    referenceId: reference.id,
    assetId: reference.assetId,
    purpose: reference.purpose,
    filename: `${String(reference.assetId).replace(/[^A-Za-z0-9._-]+/g, "-") || "reference"}.png`,
    mimeType: "image/png",
    byteLength: bytes.length,
    width,
    height,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes,
  };
}

function prepareVisualIdentity(input, role) {
  const context = visualIdentityContextForRole(input.visualIdentity, role, { useVisualIdentity: input.useVisualIdentity !== false });
  if (!context.enabled) return { context, referenceImages: [], referenceSummary: [] };
  const referenceAssets = Array.isArray(input.referenceAssets) ? input.referenceAssets : [];
  const report = inspectVisualIdentity({ visualIdentity: input.visualIdentity, assets: referenceAssets });
  if (report.errors.length) throw new Error(`Project visual identity is invalid: ${report.errors.join(" ")}`);
  const assetById = new Map(referenceAssets.map((asset) => [asset?.id, asset]));
  const imageReferences = context.references.filter((reference) => reference.delivery === "image");
  if (imageReferences.length && input.referenceConsent !== true) {
    throw new Error("This AI-art job includes project image references. Set referenceConsent=true for this job before any pixels are uploaded.");
  }
  if (imageReferences.length > LOOPLAB_VISUAL_IDENTITY_LIMITS.maximumImageReferencesPerJob) {
    throw new Error(`An AI-art job may upload at most ${LOOPLAB_VISUAL_IDENTITY_LIMITS.maximumImageReferencesPerJob} project image references.`);
  }
  const referenceImages = imageReferences.map((reference) => parseReferencePng(assetById.get(reference.assetId), reference));
  const totalBytes = referenceImages.reduce((sum, entry) => sum + entry.byteLength, 0);
  if (totalBytes > LOOPLAB_VISUAL_IDENTITY_LIMITS.maximumReferenceBytesPerJob) {
    throw new Error(`Project image references total ${totalBytes} bytes; the per-job limit is ${LOOPLAB_VISUAL_IDENTITY_LIMITS.maximumReferenceBytesPerJob} bytes.`);
  }
  const referenceSummary = context.references.map((reference) => {
    const image = referenceImages.find((entry) => entry.referenceId === reference.id);
    return {
      referenceId: reference.id,
      assetId: reference.assetId,
      purpose: reference.purpose,
      delivery: reference.delivery,
      uploaded: Boolean(image),
      byteLength: image?.byteLength ?? null,
      sha256: image?.sha256 ?? null,
    };
  });
  return { context, referenceImages, referenceSummary };
}

export function modelSupportsTransparentBackground(model) {
  return !/^gpt-image-2(?:$|-)/i.test(String(model ?? "")) && !/^chatgpt-image-latest$/i.test(String(model ?? ""));
}

export function normalizeAiArtRequest(input = {}, env = process.env) {
  const role = LOOPLAB_AI_ART_ROLES.includes(input.role) ? input.role : "character";
  const actions = normalizeActions(input.actions, role);
  const targetFrameSize = LOOPLAB_AI_ART_FRAME_SIZES.includes(Number(input.targetFrameSize)) ? Number(input.targetFrameSize) : 32;
  const quality = LOOPLAB_AI_ART_QUALITIES.includes(input.quality) ? input.quality : "medium";
  const model = trimText(input.model ?? env.LOOPLAB_OPENAI_IMAGE_MODEL ?? "gpt-image-1.5", 120);
  if (!/^gpt-image-[a-z0-9.-]+$/i.test(model)) throw new Error("AI art model must be a GPT Image model.");
  const background = input.background === "light-neutral-gray" ? "light-neutral-gray" : "transparent";
  if (background === "transparent" && !modelSupportsTransparentBackground(model)) {
    throw new Error(`${model} does not support transparent backgrounds. Choose a supported GPT Image model or the light-neutral-gray review matte.`);
  }
  const prompt = trimText(input.prompt, 12_000);
  if (!prompt) throw new Error("AI art prompt must describe the requested game asset.");
  const identity = trimText(input.identity ?? input.seed ?? role, 240) || role;
  const projection = input.projection === "dimetric-2:1" ? "dimetric-2:1" : "orthographic";
  const palette = normalizePalette(input.palette);
  const frameCount = actions.length;
  const columns = role === "tileset" ? Math.min(3, frameCount) : Math.min(4, frameCount);
  const rows = Math.ceil(frameCount / columns);
  const assetType = role === "tileset" ? "tileset" : "sprite";
  const groundAnchored = !["effect", "ui", "environment"].includes(role);
  const visualIdentity = prepareVisualIdentity(input, role);
  const matte = background === "light-neutral-gray" ? "#d9d9d9" : "transparent alpha";
  const paletteInstruction = palette.length ? `Use only this shared final palette: ${palette.join(", ")}.` : "Use one cohesive shared palette across every cell.";
  const projectionInstruction = projection === "dimetric-2:1"
    ? "Use a fixed 2:1 dimetric camera with identical projection in every cell; do not use perspective."
    : "Use a fixed orthographic side or front camera with no perspective drift.";
  const anchorInstruction = groundAnchored
    ? "Every subject must touch the same visible ground baseline at bottom-center with clear empty alpha below nothing."
    : "Center every subject consistently inside its cell.";
  const providerPrompt = [
    `Create production-ready 2D HTML game art: ${prompt}`,
    `Identity reference: ${identity}. Asset role: ${role}.`,
    `Return one exact ${columns} columns by ${rows} rows contact sheet containing ${frameCount} occupied cells in row-major order.`,
    `Cell order: ${actions.map((action, index) => `${index + 1}. ${action}`).join("; ")}.`,
    "One subject or tile per occupied cell. Use equal cell dimensions, clear gutters, identical camera, identical scale, identical lighting, and no labels or text.",
    `${projectionInstruction} ${anchorInstruction}`,
    `${paletteInstruction} Background must be ${matte}.`,
    "Do not draw collision boxes, guides, frames, checkerboards, shadows outside the subject, duplicate characters, invented rails, invented ledges, or other gameplay geometry.",
    "Keep every occupied cell fully inside its bounds and leave unused cells empty.",
    visualIdentity.context.prompt,
  ].filter(Boolean).join("\n");
  const providerOperation = visualIdentity.referenceImages.length ? "edit" : "generation";
  const inputFidelity = providerOperation === "edit" && !/^gpt-image-2(?:$|-)/i.test(model) ? "high" : null;
  const request = {
    schemaVersion: LOOPLAB_AI_ART_VERSION,
    provider: "openai",
    model,
    role,
    assetType,
    prompt,
    identity,
    actions,
    frameCount,
    columns,
    rows,
    targetFrameSize,
    quality,
    background,
    projection,
    palette,
    groundAnchored,
    providerOperation,
    referenceSummary: visualIdentity.referenceSummary,
    referenceImages: visualIdentity.referenceImages,
    visualIdentity: {
      inherited: visualIdentity.context.enabled,
      bypassed: visualIdentity.context.bypassed,
      identityDigest: visualIdentity.context.identityDigest,
      status: visualIdentity.context.status ?? null,
      directiveIds: visualIdentity.context.directives.map((entry) => entry.id),
      referenceIds: visualIdentity.context.references.map((entry) => entry.id),
      exclusionIds: visualIdentity.context.exclusions.map((entry) => entry.id),
      imageReferenceCount: visualIdentity.referenceImages.length,
      imageReferenceBytes: visualIdentity.referenceImages.reduce((sum, entry) => sum + entry.byteLength, 0),
      referenceConsent: visualIdentity.referenceImages.length ? true : false,
    },
    providerPrompt,
    providerPayload: {
      model,
      prompt: providerPrompt,
      n: 1,
      size: "1024x1024",
      quality,
      output_format: "png",
      background: background === "transparent" ? "transparent" : "opaque",
      ...(inputFidelity ? { input_fidelity: inputFidelity } : {}),
    },
  };
  return {
    ...request,
    promptDigest: sha256(JSON.stringify({
      providerOperation,
      providerPayload: request.providerPayload,
      references: visualIdentity.referenceSummary.map(({ referenceId, assetId, purpose, delivery, sha256: digest }) => ({ referenceId, assetId, purpose, delivery, sha256: digest })),
    })),
  };
}

export function createAiArtProviderRequest(request, apiKey) {
  if (!request || request.provider !== "openai") throw new Error("AI-art provider request must be a normalized OpenAI request.");
  const authorization = `Bearer ${String(apiKey ?? "").trim()}`;
  if (request.providerOperation !== "edit") return {
    url: "https://api.openai.com/v1/images/generations",
    init: {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify(request.providerPayload),
    },
  };
  const form = new FormData();
  for (const [key, value] of Object.entries(request.providerPayload ?? {})) {
    if (value !== undefined && value !== null) form.append(key, String(value));
  }
  for (const reference of request.referenceImages ?? []) {
    form.append("image[]", new Blob([reference.bytes], { type: reference.mimeType }), reference.filename);
  }
  return {
    url: "https://api.openai.com/v1/images/edits",
    init: { method: "POST", headers: { Authorization: authorization }, body: form },
  };
}

export function parseAiArtResponse(value, request, { requestId = null } = {}) {
  const encoded = value?.data?.[0]?.b64_json;
  if (typeof encoded !== "string" || encoded.length < 32) throw new Error("OpenAI Image API returned no base64 PNG.");
  let bytes;
  try { bytes = Buffer.from(encoded, "base64"); }
  catch { throw new Error("OpenAI Image API returned invalid base64 image data."); }
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("OpenAI Image API result is not a PNG.");
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height) throw new Error("OpenAI Image API PNG dimensions are invalid.");
  return {
    schemaVersion: LOOPLAB_AI_ART_VERSION,
    provider: "openai",
    model: value.model ?? request.model,
    requestId,
    createdAt: value.created ? new Date(Number(value.created) * 1000).toISOString() : new Date().toISOString(),
    promptDigest: request.promptDigest,
    width,
    height,
    mimeType: "image/png",
    byteLength: bytes.length,
    dataUrl: `data:image/png;base64,${encoded}`,
    layout: { frameCount: request.frameCount, columns: request.columns, rows: request.rows, actions: request.actions },
    normalization: { targetFrameSize: request.targetFrameSize, palette: request.palette, groundAnchored: request.groundAnchored, projection: request.projection, background: request.background },
    visualIdentity: request.visualIdentity,
    usage: value.usage ?? null,
  };
}

export function createAiArtUsageReceipt({ model, quality, usage, operation = "generation" } = {}) {
  const normalizedModel = canonicalModel(model);
  const inputTokens = Number.isFinite(Number(usage?.input_tokens)) ? Math.floor(Number(usage.input_tokens)) : null;
  const outputTokens = Number.isFinite(Number(usage?.output_tokens)) ? Math.floor(Number(usage.output_tokens)) : null;
  const totalTokens = Number.isFinite(Number(usage?.total_tokens)) ? Math.floor(Number(usage.total_tokens)) : inputTokens !== null || outputTokens !== null ? (inputTokens ?? 0) + (outputTokens ?? 0) : null;
  const estimatedImageOutputUsd = IMAGE_OUTPUT_USD[normalizedModel]?.[quality] ?? null;
  return {
    schemaVersion: "looplab-ai-usage/v1",
    kind: operation === "edit" ? "image-reference-generation" : "image-generation",
    provider: "openai",
    model: model ?? null,
    source: "openai-images-api",
    measured: totalTokens !== null,
    billingMode: "api",
    inputTokens,
    promptTokens: inputTokens,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens,
    reasoningTokens: 0,
    totalTokens,
    estimatedUsd: estimatedImageOutputUsd,
    estimateKind: estimatedImageOutputUsd === null ? "unavailable" : "published-image-output-price",
    pricing: estimatedImageOutputUsd === null ? null : { currency: "USD", asOf: "2026-08-09", sourceUrl: "https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency", imageOutputUsd: estimatedImageOutputUsd, quality, size: "1024x1024" },
    actualChargeClaimed: false,
    note: estimatedImageOutputUsd === null
      ? "The provider reported image-token usage, but Looplab has no verified image-output price for this model."
      : "The dollar figure is the published 1024x1024 image-output price for this model and quality. Text/image input token charges, if any, are not included.",
  };
}

export function publicAiArtRequest(request) {
  return Object.fromEntries(Object.entries(request).filter(([key]) => !["providerPayload", "providerPrompt", "prompt", "referenceImages"].includes(key)));
}
