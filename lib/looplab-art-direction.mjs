export const ART_DIRECTION_MODES = Object.freeze(["explore", "preserve", "locked"]);

const cleanList = (values) => [...new Set((Array.isArray(values) ? values : String(values ?? "").split(/\r?\n|\|/))
  .map((value) => String(value).trim())
  .filter(Boolean))]
  .slice(0, 30);

export function normalizeArtDirectionPolicy(input = {}) {
  const requestedMode = ART_DIRECTION_MODES.includes(input.mode) ? input.mode : "explore";
  const locks = cleanList(input.locks ?? input.styleLocks);
  const mode = requestedMode === "locked" && locks.length === 0 ? "explore" : requestedMode;
  return {
    mode,
    locks: mode === "locked" ? locks : [],
    requestedMode,
    fallbackApplied: requestedMode === "locked" && locks.length === 0,
  };
}

export function artDirectionInstruction(input = {}) {
  const policy = normalizeArtDirectionPolicy(input);
  const boundary = "Quality targets may require clarity, cohesion, accessibility, or technical correctness, but they must not silently imply a palette, setting, rendering style, material language, camera format, or character design.";
  if (policy.mode === "preserve") {
    return `${boundary} Preserve the current project's established visual identity while improving its execution. Do not replace its theme or visual language unless the user's creative brief explicitly requests that change.`;
  }
  if (policy.mode === "locked") {
    return `${boundary} Only these user-authored visual constraints are locked: ${policy.locks.join("; ")}. Everything else about the art direction remains open to the AI.`;
  }
  return `${boundary} Art direction is intentionally open. Infer a cohesive visual identity from the user's creative brief and the game's needs. Existing generated art, prior candidates, examples, and quality targets are references—not immutable style constraints.`;
}
