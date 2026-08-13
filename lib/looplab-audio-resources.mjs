export const LOOPLAB_AUDIO_RESOURCE_REPORT_SCHEMA = "looplab-audio-resource-report/v1";
export const LOOPLAB_AUDIO_DECODE_SAMPLE_RATE = 48_000;

export const LOOPLAB_AUDIO_RESOURCE_LIMITS = Object.freeze({
  maximumReferencedResources: 32,
  maximumEncodedBytes: 16 * 1024 * 1024,
  maximumDecodedBytes: 32 * 1024 * 1024,
});

const cleanString = (value) => typeof value === "string" ? value.trim() : "";

function readUint32(bytes, offset) {
  return (bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)) >>> 0;
}

function readUint16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function ascii(bytes, offset, length) {
  let value = "";
  for (let index = 0; index < length; index += 1) value += String.fromCharCode(bytes[offset + index] ?? 0);
  return value;
}

function decodedMemoryCost(frameCount, sourceSampleRate, channels) {
  const decodedFrameCount = Math.ceil(frameCount * LOOPLAB_AUDIO_DECODE_SAMPLE_RATE / sourceSampleRate);
  return {
    sourceDecodedMemoryBytes: frameCount * channels * 4,
    decodedSampleRate: LOOPLAB_AUDIO_DECODE_SAMPLE_RATE,
    decodedFrameCount,
    decodedMemoryBytes: decodedFrameCount * channels * 4,
  };
}

function analyzeOggVorbis(bytes) {
  if (bytes.length < 58 || ascii(bytes, 0, 4) !== "OggS") return null;
  let offset = 0;
  let channels = null;
  let sampleRate = null;
  let frameCount = 0;
  let pageCount = 0;
  while (offset + 27 <= bytes.length) {
    if (ascii(bytes, offset, 4) !== "OggS" || bytes[offset + 4] !== 0) return null;
    const segmentCount = bytes[offset + 26];
    const segmentTableEnd = offset + 27 + segmentCount;
    if (segmentTableEnd > bytes.length) return null;
    let bodyLength = 0;
    for (let index = offset + 27; index < segmentTableEnd; index += 1) bodyLength += bytes[index];
    const bodyStart = segmentTableEnd;
    const pageEnd = bodyStart + bodyLength;
    if (pageEnd > bytes.length) return null;
    const granuleLow = readUint32(bytes, offset + 6);
    const granuleHigh = readUint32(bytes, offset + 10);
    if (!(granuleLow === 0xffffffff && granuleHigh === 0xffffffff)) {
      const granule = granuleHigh * 4294967296 + granuleLow;
      if (Number.isSafeInteger(granule)) frameCount = Math.max(frameCount, granule);
    }
    if (channels == null && bodyLength >= 16 && bytes[bodyStart] === 1 && ascii(bytes, bodyStart + 1, 6) === "vorbis") {
      channels = bytes[bodyStart + 11];
      sampleRate = readUint32(bytes, bodyStart + 12);
    }
    pageCount += 1;
    offset = pageEnd;
  }
  if (!channels || !sampleRate || !frameCount || !pageCount) return null;
  return {
    format: "ogg-vorbis",
    channels,
    sampleRate,
    frameCount,
    durationSeconds: frameCount / sampleRate,
    ...decodedMemoryCost(frameCount, sampleRate, channels),
  };
}

function analyzeWave(bytes) {
  if (bytes.length < 44 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") return null;
  let offset = 12;
  let channels = null;
  let sampleRate = null;
  let blockAlign = null;
  let dataBytes = null;
  let audioFormat = null;
  while (offset + 8 <= bytes.length) {
    const chunkId = ascii(bytes, offset, 4);
    const chunkSize = readUint32(bytes, offset + 4);
    const bodyStart = offset + 8;
    if (bodyStart + chunkSize > bytes.length) return null;
    if (chunkId === "fmt " && chunkSize >= 16) {
      audioFormat = readUint16(bytes, bodyStart);
      channels = readUint16(bytes, bodyStart + 2);
      sampleRate = readUint32(bytes, bodyStart + 4);
      blockAlign = readUint16(bytes, bodyStart + 12);
    } else if (chunkId === "data") dataBytes = chunkSize;
    offset = bodyStart + chunkSize + (chunkSize % 2);
  }
  if (![1, 3].includes(audioFormat) || !channels || !sampleRate || !blockAlign || dataBytes == null) return null;
  const frameCount = Math.floor(dataBytes / blockAlign);
  return {
    format: audioFormat === 3 ? "wav-float" : "wav-pcm",
    channels,
    sampleRate,
    frameCount,
    durationSeconds: frameCount / sampleRate,
    ...decodedMemoryCost(frameCount, sampleRate, channels),
  };
}

export function analyzeEmbeddedAudioBytes(input, mimeType = "") {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input ?? 0);
  const normalizedMime = cleanString(mimeType).toLowerCase();
  const measured = normalizedMime.includes("ogg")
    ? analyzeOggVorbis(bytes)
    : normalizedMime.includes("wav") || normalizedMime.includes("wave")
      ? analyzeWave(bytes)
      : analyzeOggVorbis(bytes) ?? analyzeWave(bytes);
  if (!measured) return {
    measurable: false,
    encodedBytes: bytes.byteLength,
    mimeType: normalizedMime || null,
    error: "Only embedded OGG Vorbis and PCM/float WAV resources currently have exact decoded-memory measurement.",
  };
  return {
    measurable: true,
    encodedBytes: bytes.byteLength,
    mimeType: normalizedMime || null,
    ...measured,
  };
}

function decodeDataUrl(dataUrl) {
  const match = /^data:([^;,]+)?((?:;[^,]*)*?),(.*)$/s.exec(cleanString(dataUrl));
  if (!match) return { error: "Resource dataUrl is not a valid embedded data URL." };
  const mimeType = cleanString(match[1]).toLowerCase();
  const parameters = match[2] || "";
  const payload = match[3] || "";
  try {
    if (/;base64(?:;|$)/i.test(parameters)) {
      if (typeof globalThis.atob !== "function") return { error: "Base64 decoding is unavailable in this environment." };
      const binary = globalThis.atob(payload.replace(/\s+/g, ""));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return { bytes, mimeType };
    }
    const decoded = decodeURIComponent(payload);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index) & 0xff;
    return { bytes, mimeType };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), mimeType };
  }
}

export function inspectEmbeddedAudioResource(resource) {
  if (!resource || typeof resource !== "object" || Array.isArray(resource)) return {
    ok: false,
    resourceId: null,
    error: "Audio resource must be an object.",
  };
  const resourceId = cleanString(resource.id);
  const declaredMimeType = cleanString(resource.mimeType).toLowerCase();
  if (!resourceId) return { ok: false, resourceId: null, error: "Audio resource has no stable id." };
  if (resource.kind !== "audio") return { ok: false, resourceId, error: `Resource ${resourceId} is not kind audio.` };
  if (!declaredMimeType.startsWith("audio/")) return { ok: false, resourceId, error: `Resource ${resourceId} does not declare an audio MIME type.` };
  const decoded = decodeDataUrl(resource.dataUrl);
  if (decoded.error) return { ok: false, resourceId, error: `Resource ${resourceId}: ${decoded.error}` };
  if (!decoded.mimeType.startsWith("audio/") || decoded.mimeType !== declaredMimeType) return {
    ok: false,
    resourceId,
    error: `Resource ${resourceId} data MIME ${decoded.mimeType || "missing"} does not match ${declaredMimeType}.`,
  };
  const analysis = analyzeEmbeddedAudioBytes(decoded.bytes, decoded.mimeType);
  return {
    ok: analysis.measurable,
    resourceId,
    ...analysis,
    error: analysis.error ?? null,
  };
}

export function inspectPresentationAudioResources(project, cues = []) {
  const resourceIds = [...new Set((Array.isArray(cues) ? cues : [])
    .filter((cue) => cue?.enabled !== false && cue?.kind === "sample")
    .map((cue) => cleanString(cue.resourceId))
    .filter(Boolean))].sort();
  const byId = new Map((project?.resources ?? []).filter((resource) => resource && typeof resource === "object").map((resource) => [resource.id, resource]));
  const resources = [];
  const issues = [];
  let encodedBytes = 0;
  let decodedBytes = 0;
  for (const resourceId of resourceIds) {
    const resource = byId.get(resourceId);
    if (!resource) {
      issues.push({ severity: "error", code: "presentation-audio-resource-missing", resourceId, message: `Audio resource ${resourceId} is not embedded in project.resources.` });
      continue;
    }
    const inspection = inspectEmbeddedAudioResource(resource);
    resources.push(inspection);
    if (!inspection.ok) {
      issues.push({ severity: "error", code: "presentation-audio-resource-invalid", resourceId, message: inspection.error });
      continue;
    }
    encodedBytes += inspection.encodedBytes;
    decodedBytes += inspection.decodedMemoryBytes;
  }
  if (resourceIds.length > LOOPLAB_AUDIO_RESOURCE_LIMITS.maximumReferencedResources) issues.push({
    severity: "error",
    code: "presentation-audio-resource-count",
    message: `Presentation may reference at most ${LOOPLAB_AUDIO_RESOURCE_LIMITS.maximumReferencedResources} unique embedded audio resources.`,
  });
  if (encodedBytes > LOOPLAB_AUDIO_RESOURCE_LIMITS.maximumEncodedBytes) issues.push({
    severity: "error",
    code: "presentation-audio-encoded-budget",
    message: `Referenced audio uses ${encodedBytes} encoded bytes, above the ${LOOPLAB_AUDIO_RESOURCE_LIMITS.maximumEncodedBytes}-byte one-file budget.`,
  });
  if (decodedBytes > LOOPLAB_AUDIO_RESOURCE_LIMITS.maximumDecodedBytes) issues.push({
    severity: "error",
    code: "presentation-audio-decoded-budget",
    message: `Referenced audio decodes to ${decodedBytes} bytes, above the ${LOOPLAB_AUDIO_RESOURCE_LIMITS.maximumDecodedBytes}-byte runtime budget.`,
  });
  return {
    schemaVersion: LOOPLAB_AUDIO_RESOURCE_REPORT_SCHEMA,
    referencedResourceIds: resourceIds,
    referencedResourceCount: resourceIds.length,
    encodedBytes,
    decodedBytes,
    decodedSampleRate: LOOPLAB_AUDIO_DECODE_SAMPLE_RATE,
    limits: { ...LOOPLAB_AUDIO_RESOURCE_LIMITS },
    resources,
    issues,
    valid: issues.every((issue) => issue.severity !== "error"),
  };
}
