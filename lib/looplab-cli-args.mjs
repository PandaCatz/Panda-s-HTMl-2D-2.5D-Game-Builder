const LOOPLAB_NPM_OPTION_NAMES = Object.freeze([
  "allow-replacement",
  "allow-unproven",
  "apply",
  "archive",
  "as",
  "attach",
  "browser-channel",
  "captures",
  "category",
  "codes",
  "collision",
  "compact",
  "context-file",
  "context-json",
  "convergence-digest",
  "create-only",
  "cursor",
  "decor",
  "detail",
  "emit",
  "event-limit",
  "executable-path",
  "expansion-digest",
  "families",
  "fixture",
  "frame",
  "frame-height",
  "frame-ms",
  "frame-width",
  "frames",
  "framework",
  "full",
  "id",
  "include-archive-only",
  "include-fixture",
  "inputs",
  "inputs-file",
  "inputs-json",
  "inputs-stdin",
  "invocation-id",
  "issue-code",
  "kind",
  "limit",
  "macro",
  "map",
  "maps",
  "max-actions",
  "max-candidates",
  "max-entries",
  "max-findings",
  "max-hud-intrusions",
  "max-matches",
  "max-overlaps",
  "max-passes",
  "max-position-samples",
  "max-repairs",
  "model",
  "narrative",
  "objects",
  "offset",
  "output",
  "owner",
  "parameters-json",
  "parameters-stdin",
  "place",
  "preview-digest",
  "profile",
  "promote",
  "query",
  "receipt",
  "recipe",
  "refresh",
  "repair-digest",
  "result",
  "revision-digest",
  "run-file",
  "run-json",
  "sample-every",
  "save-policy",
  "scale",
  "select",
  "since-digest",
  "since-timestamp",
  "source-digest",
  "spacing",
  "start-map",
  "start-spawn",
  "status",
  "summary",
  "tag",
  "tick-rate",
  "ticks",
  "view",
  "x",
  "y",
]);

const EXPLICIT_SEPARATOR_OPTIONS = Object.freeze(new Set(["force", "pointer"]));
const EMPTY_NPM_VALUES = Object.freeze(new Set(["", "false", "null", "undefined"]));

function optionArgumentPresent(args, name) {
  const option = `--${name}`;
  return args.some((argument) => argument === option || argument.startsWith(`${option}=`));
}
function npmEnvironmentName(name) {
  return `npm_config_${name.replaceAll("-", "_")}`;
}

function recoveredArgument(name, rawValue) {
  const value = String(rawValue).trim();
  return value.toLowerCase() === "true" ? `--${name}` : `--${name}=${value}`;
}

/**
 * npm 10 converts trailing script flags such as --attach into npm_config_attach
 * unless callers add a second `--`. Recover only LoopLab's closed, single-value
 * option set. Destructive --force and repeatable --pointer remain explicit-only.
 */
export function recoverLooplabNpmArguments(rawArgs, environment = {}) {
  const args = [...rawArgs];
  const recovered = [];
  const rejected = [];
  if (environment.npm_lifecycle_event !== "agent") return { args, recovered, rejected };

  for (const name of EXPLICIT_SEPARATOR_OPTIONS) {
    if (optionArgumentPresent(args, name)) continue;
    const rawValue = environment[npmEnvironmentName(name)];
    if (rawValue === undefined || EMPTY_NPM_VALUES.has(String(rawValue).trim().toLowerCase())) continue;
    rejected.push(`--${name}`);
  }

  for (const name of LOOPLAB_NPM_OPTION_NAMES) {
    if (optionArgumentPresent(args, name)) continue;
    const rawValue = environment[npmEnvironmentName(name)];
    if (rawValue === undefined || EMPTY_NPM_VALUES.has(String(rawValue).trim().toLowerCase())) continue;
    const argument = recoveredArgument(name, rawValue);
    args.push(argument);
    recovered.push(argument);
  }
  return { args, recovered, rejected };
}

export function npmArgumentForwardingGuidance(recovery) {
  return {
    schemaVersion: "looplab-npm-argument-forwarding/v1",
    recovered: [...recovery.recovered],
    rejected: [...recovery.rejected],
    explicitSeparatorRequiredFor: ["--force", "repeated --pointer"],
    guidance: "LoopLab recovers known single-value flags consumed by npm 10. Put an extra -- immediately before --force or the first repeated --pointer option.",
  };
}
