import { canonicalSha256 } from "./looplab-canonical-digest.mjs";

export const LOOPLAB_RUN_VARIATION_PROGRAM_SCHEMA = "looplab-run-variation-program/v1";
export const LOOPLAB_RUN_VARIATION_STATE_SCHEMA = "looplab-run-variation-state/v1";
export const LOOPLAB_RUN_VARIATION_SELECTION_ALGORITHM = "canonical-sha256-weighted-stable-id/v1";

export function normalizeRunVariationProgram(input = {}) {
  const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  return {
    schemaVersion: LOOPLAB_RUN_VARIATION_PROGRAM_SCHEMA,
    version: 1,
    enabled: input?.enabled !== false,
    seedNamespace: String(input?.seedNamespace ?? "looplab-run").trim(),
    defaultSeed: String(input?.defaultSeed ?? "standard").trim(),
    dailyChallenge: {
      enabled: input?.dailyChallenge?.enabled === true,
      namespace: String(input?.dailyChallenge?.namespace ?? "daily").trim(),
    },
    pools: (Array.isArray(input?.pools) ? input.pools : []).map((pool) => ({
      id: String(pool?.id ?? "").trim(),
      label: String(pool?.label ?? pool?.id ?? "").trim(),
      variants: (Array.isArray(pool?.variants) ? pool.variants : []).map((variant) => ({
        id: String(variant?.id ?? "").trim(),
        label: String(variant?.label ?? variant?.id ?? "").trim(),
        weight: Number.isSafeInteger(Number(variant?.weight)) ? Number(variant.weight) : 1,
        assignments: (Array.isArray(variant?.assignments) ? variant.assignments : [])
          .map((assignment) => ({ variableId: String(assignment?.variableId ?? "").trim(), value: clone(assignment?.value) })),
      })),
    })),
    ghosts: (Array.isArray(input?.ghosts) ? input.ghosts : []).map((ghost) => ({
      id: String(ghost?.id ?? "").trim(),
      label: String(ghost?.label ?? ghost?.id ?? "").trim(),
      replayCaseId: String(ghost?.replayCaseId ?? "").trim(),
      replayDigest: String(ghost?.replayDigest ?? "").trim(),
      trajectoryDigest: String(ghost?.trajectoryDigest ?? "").trim(),
      sampleEveryTicks: Number.isSafeInteger(Number(ghost?.sampleEveryTicks)) ? Number(ghost.sampleEveryTicks) : 2,
      color: String(ghost?.color ?? "#c4ccd4").trim().toLowerCase(),
      opacity: Number.isFinite(Number(ghost?.opacity)) ? Number(ghost.opacity) : 0.5,
      frames: (Array.isArray(ghost?.frames) ? ghost.frames : []).map((frame) => ({
        tick: Number(frame?.tick),
        mapId: String(frame?.mapId ?? "").trim(),
        x: Number(frame?.x),
        y: Number(frame?.y),
        z: Number(frame?.z ?? 0),
        facingX: Number.isFinite(Number(frame?.facingX)) ? Number(frame.facingX) : 1,
      })),
    })),
    acceptanceTestIds: (Array.isArray(input?.acceptanceTestIds) ? input.acceptanceTestIds : []).map((id) => String(id).trim()),
  };
}

export function runVariationProgramDigest(input = {}) {
  const compare = (first, second) => String(first) < String(second) ? -1 : String(first) > String(second) ? 1 : 0;
  const program = normalizeRunVariationProgram(input);
  const semantic = {
    ...program,
    pools: [...program.pools].sort((first, second) => compare(first.id, second.id)).map((pool) => ({
      ...pool,
      variants: [...pool.variants].sort((first, second) => compare(first.id, second.id)).map((variant) => ({
        ...variant,
        assignments: [...variant.assignments].sort((first, second) => compare(first.variableId, second.variableId)),
      })),
    })),
    ghosts: [...program.ghosts].sort((first, second) => compare(first.id, second.id)),
    acceptanceTestIds: [...program.acceptanceTestIds].sort(compare),
  };
  return canonicalSha256(semantic);
}

export function runVariationSelectionProgramDigest(input = {}) {
  const compare = (first, second) => String(first) < String(second) ? -1 : String(first) > String(second) ? 1 : 0;
  const program = normalizeRunVariationProgram(input);
  return canonicalSha256({
    schemaVersion: "looplab-run-variation-selection-program/v1",
    enabled: program.enabled,
    seedNamespace: program.seedNamespace,
    dailyChallenge: { enabled: program.dailyChallenge.enabled, namespace: program.dailyChallenge.namespace },
    pools: [...program.pools].sort((first, second) => compare(first.id, second.id)).map((pool) => ({
      id: pool.id,
      variants: [...pool.variants].sort((first, second) => compare(first.id, second.id)).map((variant) => ({
        id: variant.id,
        weight: variant.weight,
        assignments: [...variant.assignments].sort((first, second) => compare(first.variableId, second.variableId)),
      })),
    })),
  });
}

export function validUtcRunDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function resolveRunVariation(input = {}, options = {}) {
  const program = normalizeRunVariationProgram(input);
  const compare = (first, second) => String(first) < String(second) ? -1 : String(first) > String(second) ? 1 : 0;
  const mode = options?.mode === "daily" ? "daily" : "standard";
  const utcDay = mode === "daily" ? String(options?.utcDay ?? "") : null;
  if (mode === "daily" && (!program.dailyChallenge.enabled || !validUtcRunDay(utcDay))) {
    throw new Error(program.dailyChallenge.enabled ? "Daily challenge utcDay must be a real UTC date in YYYY-MM-DD format." : "Daily challenges are not enabled by this run-variation program.");
  }
  const requestedSeed = String(options?.seed ?? program.defaultSeed).trim();
  if (mode === "standard" && !requestedSeed) throw new Error("Run seed must be a non-empty string.");
  const programDigest = runVariationProgramDigest(program);
  const selectionProgramDigest = runVariationSelectionProgramDigest(program);
  const seed = mode === "daily"
    ? canonicalSha256({ schemaVersion: "looplab-daily-run-seed/v1", seedNamespace: program.seedNamespace, dailyNamespace: program.dailyChallenge.namespace, utcDay })
    : requestedSeed;
  const selections = [];
  const assignments = {};
  if (program.enabled) for (const pool of [...program.pools].sort((first, second) => compare(first.id, second.id))) {
    const variants = [...pool.variants].filter((variant) => Number(variant.weight) > 0).sort((first, second) => compare(first.id, second.id));
    const totalWeight = variants.reduce((total, variant) => total + Number(variant.weight), 0);
    const identity = { schemaVersion: LOOPLAB_RUN_VARIATION_SELECTION_ALGORITHM, selectionProgramDigest, seed, poolId: pool.id };
    const digest = canonicalSha256(identity);
    const unit = Number.parseInt(digest.slice("sha256:".length, "sha256:".length + 13), 16) / 0x1_0000_0000_0000;
    let cursor = unit * totalWeight;
    let selected = totalWeight > 0 ? variants.at(-1) : null;
    for (const variant of variants) {
      cursor -= Number(variant.weight);
      if (cursor < 0) { selected = variant; break; }
    }
    if (!selected) throw new Error(`Run-variation pool ${pool.id || "(empty)"} has no selectable variant.`);
    for (const assignment of selected.assignments) assignments[assignment.variableId] = JSON.parse(JSON.stringify(assignment.value));
    selections.push({ poolId: pool.id, variantId: selected.id, unit, totalWeight });
  }
  const selectionDigest = canonicalSha256({ schemaVersion: "looplab-run-variation-selection/v1", selectionProgramDigest, mode, seed, utcDay, selections: selections.map(({ poolId, variantId }) => ({ poolId, variantId })) });
  return {
    schemaVersion: LOOPLAB_RUN_VARIATION_STATE_SCHEMA,
    enabled: program.enabled,
    mode,
    seed,
    utcDay,
    programDigest,
    selectionProgramDigest,
    selectionAlgorithm: LOOPLAB_RUN_VARIATION_SELECTION_ALGORITHM,
    selectionDigest,
    selections,
    assignments,
  };
}
