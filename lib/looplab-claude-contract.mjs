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
    defaultScope: "user",
    mcpProfiles: {
      "looplab-core": "Workspace-contained deterministic .loop.json authoring.",
      "looplab-live": "Complete live editor, provider, visual, playtest, and export control.",
    },
    instructions: ["CLAUDE.md", ".claude/skills/looplab-game-builder/SKILL.md"],
    handoff: "claudedocs/codex-to-claude (private and gitignored when present)",
    crossProjectSkill: "Setup atomically synchronizes the repository-owned LoopLab skill into the private user Claude skill directory and status verifies exact bytes.",
    registrationBoundary: "User-scoped registration is private, cross-project, idempotent, and contains no provider credential. A connected MCP stdio process is not live-editor proof; status independently fetches the loopback app manifest and requires the exact current protocol.",
    smokeBoundary: "The executable smoke preflights the live app before provider launch, uses a temporary synthetic blank project, and supplies Claude a strict temporary MCP config containing exactly one read-only core schema and one read-only live schema. User and project MCP catalogs are ignored.",
    providerBoundary: "External Claude MCP equips the lead agent. LoopLab's schema-bound Claude provider subprocess remains nonpersistent, task-scoped, tool-limited, and MCP-free.",
  };
}
