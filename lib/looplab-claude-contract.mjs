import { LOOPLAB_PROVIDER_MODEL_POLICY } from "./looplab-provider-model-policy.mjs";

export const LOOPLAB_CLAUDE_INTEGRATION_SCHEMA = "looplab-claude-integration/v1";
export const LOOPLAB_CLAUDE_MCP_SERVER_IDS = Object.freeze(["looplab-core", "looplab-live"]);
export const LOOPLAB_CLAUDE_SETUP_SCOPES = Object.freeze(["user", "local"]);

export function getClaudeIntegrationManifest({ minimumClaudeVersion = "2.1.205" } = {}) {
  return {
    schemaVersion: LOOPLAB_CLAUDE_INTEGRATION_SCHEMA,
    minimumClaudeVersion,
    statusCommand: "npm run claude:status",
    setupCommand: 'npm run claude:setup -- "<games-root>"',
    smokeCommand: 'npm run claude:smoke -- "<games-root>"',
    modelPolicy: {
      schemaVersion: LOOPLAB_PROVIDER_MODEL_POLICY.schemaVersion,
      smokeDefault: LOOPLAB_PROVIDER_MODEL_POLICY.claudeCli.defaultModel,
      smokeEffort: LOOPLAB_PROVIDER_MODEL_POLICY.claudeCli.defaultEffort,
      smokePurpose: "operability-only",
      smokeUsedForGameCreation: false,
      creativeCliSelection: "Default every Claude Code prompt, generation, loop, research, and smoke launch to exact Claude Opus 5 with --effort max. Explicit task-specific or generic overrides remain visible in the usage receipt.",
      researchCliSelection: "Use LOOPLAB_CLAUDE_RESEARCH_MODEL, then LOOPLAB_CLAUDE_MODEL, then Claude Opus 5; always pass an explicit effort, defaulting to max.",
      visionCliSelection: "Use Claude Opus 5 at max effort. A full Sonnet model override is rejected unless LOOPLAB_VISUAL_CRITIQUE_MODEL_BENCHMARK points to a canonical matched receipt proving that exact Sonnet model beats Opus 5.",
      directApiSelection: "Prompt and game-loop API selection remains configurable. Anthropic visual critique defaults to Claude Opus 5; the same content-verified matched benchmark gate controls any Sonnet override.",
      silentVisionDowngrade: false,
    },
    defaultScope: "user",
    mcpProfiles: {
      "looplab-core": "Workspace-contained deterministic .loop.json authoring.",
      "looplab-live": "Complete live editor, provider, visual, playtest, and export control.",
    },
    instructions: ["CLAUDE.md", ".claude/skills/looplab-game-builder/SKILL.md"],
    handoff: "claudedocs/codex-to-claude (private and gitignored when present)",
    crossProjectSkill: "Setup atomically synchronizes the repository-owned LoopLab skill into the private user Claude skill directory and status verifies exact bytes.",
    registrationBoundary: "User-scoped registration is private, cross-project, idempotent, and contains no provider credential. A connected MCP stdio process is not live-editor proof; status independently fetches the loopback app manifest and requires the exact current protocol.",
    smokeBoundary: "The executable smoke preflights the live app before provider launch, uses the same Claude-Opus-5/max-effort policy as other Claude CLI work, creates a temporary synthetic blank project, and supplies Claude a strict temporary MCP config containing exactly one read-only core schema and one read-only live schema. User and project MCP catalogs are ignored.",
    providerBoundary: "External Claude MCP equips the lead agent. LoopLab's schema-bound Claude provider subprocess remains nonpersistent, task-scoped, tool-limited, and MCP-free.",
  };
}
