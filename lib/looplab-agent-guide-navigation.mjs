import { canonicalSha256, sha256Hex } from "./looplab-canonical-digest.mjs";

export const LOOPLAB_AGENT_GUIDE_INDEX_SCHEMA = "looplab-agent-guide-index/v1";
export const LOOPLAB_AGENT_GUIDE_QUERY_SCHEMA = "looplab-agent-guide-query/v1";
export const LOOPLAB_AGENT_GUIDE_NAV_START = "<!-- LOOPLAB_AGENT_GUIDE_NAV_START -->";
export const LOOPLAB_AGENT_GUIDE_NAV_END = "<!-- LOOPLAB_AGENT_GUIDE_NAV_END -->";
export const LOOPLAB_AGENT_GUIDE_RECOVERY_START = "<!-- LOOPLAB_AGENT_GUIDE_RECOVERY_START -->";
export const LOOPLAB_AGENT_GUIDE_RECOVERY_END = "<!-- LOOPLAB_AGENT_GUIDE_RECOVERY_END -->";

const GUIDE_URL = "/AI_AGENT_GUIDE.md";
const GUIDE_RESOURCE = "looplab://agent-guide";
const INDEX_URL = "/agent-guide-index.json";
const INDEX_RESOURCE = "looplab://agent-guide-index";

export const LOOPLAB_AGENT_GUIDE_INVARIANTS = Object.freeze([
  { id: "2d-only", title: "2D only", statement: "Never route work through a 3D engine, editor, or asset pipeline. Dimetric 2.5D remains reversible authored 2D data rendered with sprites and tiles.", anchor: "discover-and-connect" },
  { id: "authored-collision", title: "Collision is authored data", statement: "Generated or imported art never owns collision; visual assets remain separate from authored gameplay geometry.", anchor: "ground-and-raised-surface-attachment" },
  { id: "digest-duties", title: "Three digests, three duties", statement: "sourceDigest gates gameplay truth, revisionDigest gates shared document concurrency, and expectedLedgerDigest gates coordination mutations.", anchor: "one-shared-project-store" },
  { id: "preview-before-apply", title: "Apply only what was previewed", statement: "Nontrivial batches, repairs, rebases, and macros apply only with the exact source-bound receipt returned by their preview.", anchor: "build-an-atomic-candidate" },
  { id: "companion-authority", title: "Companion bytes are authoritative", statement: "Browser storage is a recoverable cache. Explicitly mount the companion-owned shared project before live work.", anchor: "one-shared-project-store" },
  { id: "replay-integrity", title: "Never silently rerecord replay", statement: "Replacing a deterministic fixture requires deliberate review, a higher revision, and a non-empty change reason.", anchor: "iteration-ledger-and-safe-restore" },
  { id: "honest-evidence", title: "Never claim an unrun check", statement: "Do not fabricate tests, screenshots, coverage, or completion. Inconclusive evidence remains inconclusive.", anchor: "project-doctor-and-verification" },
  { id: "explicit-selection", title: "Searches propose; judgment selects", statement: "Tuning, structural, spatial, and foundation searches preserve alternatives and never choose an automatic creative winner.", anchor: "search-valid-game-structures-before-spending-provider-tokens" },
  { id: "bots-not-players", title: "Bots are not players", statement: "Bot cohorts measure reachability and strategy shape; they do not establish fun, taste, or preference.", anchor: "interrogate-design-coverage-without-mistaking-bots-for-players" },
  { id: "consent-gates", title: "Consent gates are hard gates", statement: "Playtest observation and image-bearing visual critique require the documented consent for each exact session or submission.", anchor: "grounded-ai-visual-critique-requires-per-job-consent" },
  { id: "privacy-first", title: "Privacy precedes provider work", statement: "A blocked exact-payload preflight spends zero provider tokens and must be repaired locally without forwarding matched values.", anchor: "mandatory-preflight" },
  { id: "provider-boundary", title: "Creative work crosses a ready provider boundary", statement: "Deterministic composition and validation are not presented as AI output; schema-invalid provider output is a failed pass.", anchor: "provider-connection-preflight" },
  { id: "secret-boundary", title: "Keys and tokens stay out of artifacts", statement: "Credentials and the local mutation token never enter projects, prompts, logs, commits, research, or exports.", anchor: "discover-and-connect" },
  { id: "release-truth", title: "Current is not release", statement: "An authoring-profile pass may protect an iteration; only production assessment and exact-artifact verification govern shipping one offline HTML file.", anchor: "exported-game-runtime-contract" },
  { id: "coordination-authority", title: "Presence is not ownership", statement: "Presence is ephemeral liveness. The shared work ledger is durable coordination authority.", anchor: "coordinate-codex-and-claude-with-the-shared-work-ledger" },
  { id: "truth-before-budget", title: "Never truncate authored truth", statement: "Context budgets never justify trimming collision, replay, acceptance, map truth, or the fresh-press portal contract.", anchor: "provider-context-budget-and-bounded-passes" },
]);

export const LOOPLAB_AGENT_GUIDE_LIFECYCLE = Object.freeze([
  { id: "arrive", title: "Arrive", summary: "Mount the shared project when live, establish the change bookmark, read the brief and ledger, then claim work before editing.", anchor: "discover-and-connect", commands: ["list_shared_projects", "mount_shared_project", "get_agent_changes", "get_agent_brief", "get_work_ledger"] },
  { id: "select", title: "Select", summary: "Select the exact project and create a protected variation before experiments that must not affect the baseline.", anchor: "select-the-project-and-prompt-draft", commands: ["select_project", "create_variation"] },
  { id: "contract", title: "Contract the design", summary: "Author gameplay systems, verbs, narrative, visual identity, shell, and tuning intent as inspectable data before implementation.", anchor: "author-executable-gameplay-systems", commands: ["set_gameplay_program", "set_verb_architecture", "set_visual_identity", "set_game_shell", "set_tuning_contract"] },
  { id: "search", title: "Search before guessing", summary: "Generate structurally valid, spatially valid, and tunable alternatives; inspect the archive and select deliberately.", anchor: "search-valid-game-structures-before-spending-provider-tokens", commands: ["run_structural_scaffold_search", "run_spatial_layout_search", "run_tuning_search", "run_bot_cohorts"] },
  { id: "build", title: "Build", summary: "Draft a source-bound plan where useful, preview the coherent canonical batch, then apply only the exact receipt.", anchor: "build-an-atomic-candidate", commands: ["draft_agent_plan", "preview_batch", "apply_previewed_batch"] },
  { id: "converge", title: "Converge", summary: "Use provider-free repair for deterministic findings and leave judgment residue explicit instead of looping mechanically.", anchor: "repair-deterministic-doctor-mechanics-without-guessing", commands: ["auto_repair", "converge"] },
  { id: "deterministic-evidence", title: "Collect deterministic evidence", summary: "Run acceptance, replay, completion, simulation, and input-liveness checks against the exact current source.", anchor: "project-doctor-and-verification", commands: ["run_acceptance_suite", "run_replay_suite", "get_completion_report", "simulate"] },
  { id: "browser-evidence", title: "Collect browser evidence", summary: "Exercise the real browser, review clean and annotated captures, and use consented critique only for advisory taste judgment.", anchor: "visual-first-build-loop", commands: ["run_post_generation_qa", "capture_visual_review", "start_visual_critique", "describe_frame"] },
  { id: "release", title: "Release", summary: "Run privacy and production gates, export one self-contained HTML artifact, and verify those exact bytes including hostile-platform behavior.", anchor: "exported-game-runtime-contract", commands: ["get_privacy_report", "prepare_export", "export_html", "verify_release"] },
  { id: "report", title: "Report and hand off", summary: "Report measured evidence and usage, update the shared work item, preserve resumable IDs, and release presence.", anchor: "completion-response", commands: ["update_work_item", "leave_agent_presence"] },
]);

export const LOOPLAB_AGENT_GUIDE_RECOVERIES = Object.freeze([
  { id: "stale-source", signal: "[stale-source] on a mutation", meaning: "The project changed after the sourceDigest was read.", recovery: "Re-read the brief or Doctor, rebase the intent, re-preview, and apply only against the current source. Never overwrite newer work.", anchor: "build-an-atomic-candidate" },
  { id: "stale-revision", signal: "Stale revisionDigest or HTTP 412", meaning: "The companion-owned document changed under this draft.", recovery: "Preserve the draft, preview the shared-project rebase, apply only its exact conflict-free receipt, rerun gates, and save explicitly.", anchor: "one-shared-project-store" },
  { id: "stale-ledger", signal: "expectedLedgerDigest mismatch", meaning: "The coordination ledger changed after it was read.", recovery: "Read get_work_ledger again and issue the claim or update against the returned digest.", anchor: "coordinate-codex-and-claude-with-the-shared-work-ledger" },
  { id: "stale-preview", signal: "Preview, plan, expansion, or rebase receipt rejected", meaning: "The requested action is no longer byte-for-byte the reviewed action.", recovery: "Generate a fresh preview and apply only its unchanged current receipt.", anchor: "build-an-atomic-candidate" },
  { id: "presence-expired", signal: "Presence lease expired", meaning: "The actor's liveness heartbeat elapsed.", recovery: "Register presence again and confirm that the durable ledger claim still names the actor before continuing.", anchor: "publish-live-agent-presence-without-confusing-it-with-ownership" },
  { id: "converge-residue", signal: "converge returns residue", meaning: "The remaining findings do not have an unambiguous mechanical repair.", recovery: "Treat them as the judgment queue and resolve each through its owning authoring section; do not repeat converge hoping for a different answer.", anchor: "repair-deterministic-doctor-mechanics-without-guessing" },
  { id: "dead-input", signal: "Doctor input-action-dead", meaning: "A declared semantic action has no observable gameplay effect.", recovery: "Wire the action into shipped movement or rules, then rerun input liveness and the affected evidence.", anchor: "author-executable-gameplay-systems" },
  { id: "missing-shell", signal: "Doctor game-shell-missing", meaning: "The release lacks the authored title, pause, terminal, restart, or settings lifecycle.", recovery: "Author the game shell and exercise its keyboard, focus, visibility, and reduced-motion controls in the exported artifact.", anchor: "standard-game-shell-and-player-lifecycle" },
  { id: "unreachable", signal: "Doctor reachability finding", meaning: "A required target lies outside the real movement or route envelope.", recovery: "Change authored geometry or movement tuning, then rerun the shipped-integrator reachability check rather than trusting a screenshot.", anchor: "project-doctor-and-verification" },
  { id: "narrative-unreachable", signal: "Narrative reachability error", meaning: "No authored ending is structurally reachable from the entry page.", recovery: "Repair the page and edge graph until at least one ending is actually reachable.", anchor: "author-executable-gameplay-systems" },
  { id: "replay-divergence", signal: "Replay firstDivergence", meaning: "Deterministic state diverged from a pinned fixture at one exact tick.", recovery: "Treat that tick as a regression. If the behavior is intentional, rerecord with the same ID, higher revision, and a non-empty reviewed reason.", anchor: "iteration-ledger-and-safe-restore" },
  { id: "acceptance-missing", signal: "Acceptance missing or spec-only", meaning: "Promised behavior lacks executable proof.", recovery: "Author the executable test or record the required deterministic fixture before making the behavior claim.", anchor: "project-doctor-and-verification" },
  { id: "completion-inconclusive", signal: "Completion harness inconclusive", meaning: "Bounded search neither proved nor disproved completability.", recovery: "Report inconclusive, then deliberately adjust the design or search bounds. Never relabel it as a pass.", anchor: "project-doctor-and-verification" },
  { id: "search-empty", signal: "No acceptable search candidate", meaning: "The declared targets are unsatisfiable inside the searched design space.", recovery: "Deliberately revise the targets or design. Do not cherry-pick a candidate that failed the hard gate.", anchor: "search-valid-game-structures-before-spending-provider-tokens" },
  { id: "context-blocked", signal: "provider.context.blocked", meaning: "The scoped provider context exceeded its budget before model launch.", recovery: "Narrow the task, map set, or conditions without removing authored truth. The failed preflight used zero provider tokens.", anchor: "provider-context-budget-and-bounded-passes" },
  { id: "claude-unstructured", signal: "Claude result lacks structured_output", meaning: "The CLI response failed LoopLab's schema contract.", recovery: "Reject the pass without mutation. Free-form text is not an equivalent result.", anchor: "provider-connection-preflight" },
  { id: "privacy-blocked", signal: "Privacy preflight blocked", meaning: "The outbound payload or artifact contains a flagged value or incomplete scan.", recovery: "Repair locally from the stable codes and sanitized paths, then rerun. Never send the raw finding to another provider.", anchor: "mandatory-preflight" },
  { id: "consent-absent", signal: "Consent absent for observation or critique", meaning: "The required per-job consent was not granted for the exact data.", recovery: "Request consent or continue without that evidence path. Never substitute another submission route.", anchor: "grounded-ai-visual-critique-requires-per-job-consent" },
  { id: "evidence-stale", signal: "verification.automatic.failed or stale evidence", meaning: "Browser evidence is missing or bound to an older source digest.", recovery: "Recollect evidence against the current source. The candidate remains unverified until the new evidence passes.", anchor: "project-doctor-and-verification" },
  { id: "release-failed", signal: "Exact-artifact release verification failed", meaning: "The shipped bytes violate a production requirement.", recovery: "Repair the authoring source, export a new artifact, and verify the new exact bytes. Never hand-patch exported HTML.", anchor: "exported-game-runtime-contract" },
  { id: "protocol-mismatch", signal: "Companion health protocol mismatch", meaning: "The running companion predates the current manifest and validators.", recovery: "Restart through LoopLab's managed launcher; do not let an old companion judge current work.", anchor: "discover-and-connect" },
  { id: "session-token-missing", signal: "Mutation rejected for missing session token", meaning: "The caller lacks the current x-looplab-session-token.", recovery: "Read the ignored local session descriptor and set the header without printing or persisting the token.", anchor: "discover-and-connect" },
]);

function normalizedMarkdown(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n");
}

function removeGeneratedBlock(source, startMarker, endMarker) {
  let output = source;
  while (output.includes(startMarker) || output.includes(endMarker)) {
    const start = output.indexOf(startMarker);
    const end = output.indexOf(endMarker);
    if (start < 0 || end < 0 || end < start) throw new Error(`AI Agent Guide generated markers are unbalanced: ${startMarker} / ${endMarker}`);
    const after = end + endMarker.length;
    output = `${output.slice(0, start)}${output.slice(after).replace(/^\n{0,2}/, "")}`;
  }
  return output;
}

export function stripGeneratedAgentGuideBlocks(markdown) {
  let source = normalizedMarkdown(markdown);
  source = removeGeneratedBlock(source, LOOPLAB_AGENT_GUIDE_NAV_START, LOOPLAB_AGENT_GUIDE_NAV_END);
  source = removeGeneratedBlock(source, LOOPLAB_AGENT_GUIDE_RECOVERY_START, LOOPLAB_AGENT_GUIDE_RECOVERY_END);
  return `${source.trimEnd()}\n`;
}

function plainHeadingText(value) {
  return String(value ?? "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/\\([\\`*_{}\u005b\u005d()#+.!-])/g, "$1")
    .trim();
}

export function githubHeadingAnchor(title) {
  return plainHeadingText(title)
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}\-_ ]/gu, "")
    .replace(/ /g, "-");
}

function generatedLineMask(lines) {
  const excluded = new Set();
  let activeEnd = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (activeEnd) {
      excluded.add(index);
      if (line.trim() === activeEnd) activeEnd = null;
      continue;
    }
    if (line.trim() === LOOPLAB_AGENT_GUIDE_NAV_START) activeEnd = LOOPLAB_AGENT_GUIDE_NAV_END;
    else if (line.trim() === LOOPLAB_AGENT_GUIDE_RECOVERY_START) activeEnd = LOOPLAB_AGENT_GUIDE_RECOVERY_END;
    if (activeEnd) excluded.add(index);
  }
  if (activeEnd) throw new Error(`AI Agent Guide generated block is missing ${activeEnd}.`);
  return excluded;
}

export function extractAgentGuideHeadings(markdown, { excludeGenerated = true } = {}) {
  const lines = normalizedMarkdown(markdown).split("\n");
  const excluded = excludeGenerated ? generatedLineMask(lines) : new Set();
  const headings = [];
  const anchorCounts = new Map();
  const parentByLevel = new Map();
  let fence = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === marker) fence = null;
      else if (!fence) fence = marker;
      continue;
    }
    if (fence || excluded.has(index)) continue;
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const level = match[1].length;
    const title = plainHeadingText(match[2]);
    const baseAnchor = githubHeadingAnchor(title);
    if (!baseAnchor) throw new Error(`AI Agent Guide heading on line ${index + 1} has no stable anchor.`);
    const duplicateIndex = anchorCounts.get(baseAnchor) ?? 0;
    anchorCounts.set(baseAnchor, duplicateIndex + 1);
    const anchor = duplicateIndex ? `${baseAnchor}-${duplicateIndex}` : baseAnchor;
    for (const key of [...parentByLevel.keys()]) if (key >= level) parentByLevel.delete(key);
    const parentLevel = [...parentByLevel.keys()].filter((candidate) => candidate < level).sort((a, b) => b - a)[0];
    const parentAnchor = parentLevel ? parentByLevel.get(parentLevel) ?? null : null;
    parentByLevel.set(level, anchor);
    headings.push({ level, title, anchor, baseAnchor, duplicateIndex, parentAnchor, startLine: index + 1, endLine: lines.length });
  }
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const next = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level);
    heading.endLine = next ? next.startLine - 1 : lines.length;
  }
  return headings;
}

function validateNavigationDefinition(headings) {
  const anchors = new Set(headings.map((heading) => heading.anchor));
  const duplicates = headings.filter((heading) => heading.duplicateIndex > 0);
  if (duplicates.length) throw new Error(`AI Agent Guide has duplicate generated heading anchors: ${duplicates.map((heading) => heading.baseAnchor).join(", ")}. Rename the headings instead of relying on order-sensitive suffixes.`);
  const missing = [...LOOPLAB_AGENT_GUIDE_INVARIANTS, ...LOOPLAB_AGENT_GUIDE_LIFECYCLE, ...LOOPLAB_AGENT_GUIDE_RECOVERIES]
    .filter((entry) => !anchors.has(entry.anchor))
    .map((entry) => `${entry.id}->${entry.anchor}`);
  if (missing.length) throw new Error(`AI Agent Guide navigation references missing anchors: ${missing.join(", ")}.`);
}

function markdownLink(title, anchor) {
  return `[${title}](#${anchor})`;
}

function renderContents(headings) {
  const visible = headings.filter((heading) => heading.level >= 2 && heading.level <= 4);
  return visible.map((heading) => `${"  ".repeat(heading.level - 2)}- ${markdownLink(heading.title, heading.anchor)}`).join("\n");
}

export function renderAgentGuideNavigationBlock(headings) {
  return [
    LOOPLAB_AGENT_GUIDE_NAV_START,
    "## Contents",
    "",
    renderContents(headings),
    "",
    "## Collected invariants",
    "",
    "These summaries are orientation only. Each links to the authoritative section that supplies its context; omission is never permission and this list never overrides the full guide.",
    "",
    ...LOOPLAB_AGENT_GUIDE_INVARIANTS.map((entry, index) => `${index + 1}. **${entry.title}.** ${entry.statement} ${markdownLink("Source", entry.anchor)}.`),
    "",
    "## Standard pass at a glance",
    "",
    ...LOOPLAB_AGENT_GUIDE_LIFECYCLE.map((entry, index) => `${index + 1}. **${entry.title}.** ${entry.summary} ${markdownLink("Source", entry.anchor)}.`),
    "",
    "Machine-readable lookup is available at `/agent-guide-index.json`, through `looplab://agent-guide-index`, and with `{ \"op\": \"get_agent_guide_index\" }` on the browser-session bridge. The index is generated from this guide and cannot execute, mutate, verify, or grant authority.",
    LOOPLAB_AGENT_GUIDE_NAV_END,
  ].join("\n");
}

function escapeTableCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function renderAgentGuideRecoveryBlock() {
  return [
    LOOPLAB_AGENT_GUIDE_RECOVERY_START,
    "## Failure modes and recovery",
    "",
    "This table routes a stable signal back to the guide section that owns recovery. It does not execute the repair or upgrade failed evidence into a pass.",
    "",
    "| Signal | Meaning | Recovery |",
    "|---|---|---|",
    ...LOOPLAB_AGENT_GUIDE_RECOVERIES.map((entry) => `| ${escapeTableCell(entry.signal)} | ${escapeTableCell(entry.meaning)} | ${escapeTableCell(entry.recovery)} ${markdownLink("Source", entry.anchor)}. |`),
    LOOPLAB_AGENT_GUIDE_RECOVERY_END,
  ].join("\n");
}

function insertBeforeHeading(source, heading, block) {
  const marker = `\n${heading}\n`;
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`AI Agent Guide is missing the required heading ${heading}.`);
  return `${source.slice(0, index + 1)}${block}\n\n${source.slice(index + 1)}`;
}

function entrySource(headings, anchor) {
  const heading = headings.find((candidate) => candidate.anchor === anchor);
  return heading ? { startLine: heading.startLine, endLine: heading.endLine } : { startLine: null, endLine: null };
}

function publicEntry(entry, kind, headings) {
  return {
    kind,
    ...entry,
    href: `${GUIDE_URL}#${entry.anchor}`,
    resourceUri: `${GUIDE_RESOURCE}#${entry.anchor}`,
    source: entrySource(headings, entry.anchor),
  };
}

export function createAgentGuideIndex(documentMarkdown, { sourceMarkdown = stripGeneratedAgentGuideBlocks(documentMarkdown) } = {}) {
  const headings = extractAgentGuideHeadings(documentMarkdown, { excludeGenerated: true }).filter((heading) => heading.level > 1);
  validateNavigationDefinition(headings);
  const sourceDigest = `sha256:${sha256Hex(normalizedMarkdown(sourceMarkdown))}`;
  const base = {
    schemaVersion: LOOPLAB_AGENT_GUIDE_INDEX_SCHEMA,
    source: {
      canonicalPath: "docs/AI_AGENT_GUIDE.md",
      publicUrl: GUIDE_URL,
      resourceUri: GUIDE_RESOURCE,
      digest: sourceDigest,
      headingCount: headings.length,
      generatedBlocksExcludedFromDigest: true,
    },
    indexResource: { publicUrl: INDEX_URL, resourceUri: INDEX_RESOURCE },
    policy: {
      authority: "orientation-only",
      fullGuideAuthoritative: true,
      omissionMeansPermission: false,
      mayExecute: false,
      mayMutate: false,
      verificationEvidence: false,
      guidance: "Use the index to find the owning section, then apply the canonical command and evidence rules from the complete guide.",
    },
    sections: headings.map((heading) => ({
      kind: "section",
      id: heading.anchor,
      title: heading.title,
      summary: `Guide section: ${heading.title}`,
      level: heading.level,
      anchor: heading.anchor,
      parentAnchor: heading.parentAnchor,
      href: `${GUIDE_URL}#${heading.anchor}`,
      resourceUri: `${GUIDE_RESOURCE}#${heading.anchor}`,
      source: { startLine: heading.startLine, endLine: heading.endLine },
    })),
    invariants: LOOPLAB_AGENT_GUIDE_INVARIANTS.map((entry) => publicEntry(entry, "invariant", headings)),
    lifecycle: LOOPLAB_AGENT_GUIDE_LIFECYCLE.map((entry) => publicEntry(entry, "lifecycle", headings)),
    recoveries: LOOPLAB_AGENT_GUIDE_RECOVERIES.map((entry) => publicEntry({ ...entry, title: entry.signal, summary: entry.meaning }, "recovery", headings)),
  };
  return { ...base, indexDigest: canonicalSha256(base) };
}

export function buildAgentGuideArtifacts(markdown) {
  const sourceMarkdown = stripGeneratedAgentGuideBlocks(markdown);
  const sourceHeadings = extractAgentGuideHeadings(sourceMarkdown).filter((heading) => heading.level > 1);
  validateNavigationDefinition(sourceHeadings);
  let documentMarkdown = insertBeforeHeading(sourceMarkdown, "## Discover and connect", renderAgentGuideNavigationBlock(sourceHeadings));
  documentMarkdown = insertBeforeHeading(documentMarkdown, "## Completion response", renderAgentGuideRecoveryBlock());
  documentMarkdown = `${documentMarkdown.trimEnd()}\n`;
  return { documentMarkdown, index: createAgentGuideIndex(documentMarkdown, { sourceMarkdown }) };
}

function normalizedQuery(value) {
  return String(value ?? "").trim().toLocaleLowerCase("en-US");
}

function searchableEntry(entry) {
  return [entry.id, entry.title, entry.summary, entry.statement, entry.signal, entry.meaning, entry.recovery, entry.anchor, ...(entry.commands ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("en-US");
}

export function queryAgentGuideIndex(index, { query = "", category = "all", limit = 24 } = {}) {
  const allowedCategories = new Set(["all", "section", "invariant", "lifecycle", "recovery"]);
  if (!allowedCategories.has(category)) throw new Error(`Unsupported agent guide category: ${category}.`);
  const safeLimit = Math.max(1, Math.min(50, Number.isInteger(limit) ? limit : 24));
  const needle = normalizedQuery(query);
  const tokens = needle.split(/\s+/).filter(Boolean);
  const groups = [index.invariants, index.lifecycle, index.recoveries, index.sections];
  const entries = groups.flat().filter((entry) => (category === "all" || entry.kind === category) && tokens.every((token) => searchableEntry(entry).includes(token)));
  const ranked = entries.map((entry, order) => {
    const id = normalizedQuery(entry.id);
    const title = normalizedQuery(entry.title);
    const score = needle && (id === needle || normalizedQuery(entry.anchor) === needle) ? 0 : needle && title.startsWith(needle) ? 1 : 2;
    return { entry, order, score };
  }).sort((left, right) => left.score - right.score || left.order - right.order).map(({ entry }) => entry);
  return {
    schemaVersion: LOOPLAB_AGENT_GUIDE_QUERY_SCHEMA,
    guideSchemaVersion: index.schemaVersion,
    sourceDigest: index.source.digest,
    indexDigest: index.indexDigest,
    query: String(query ?? "").trim(),
    category,
    totalMatches: ranked.length,
    returned: Math.min(ranked.length, safeLimit),
    truncated: ranked.length > safeLimit,
    entries: ranked.slice(0, safeLimit),
    resources: { guide: GUIDE_RESOURCE, index: INDEX_RESOURCE, guideUrl: GUIDE_URL, indexUrl: INDEX_URL },
    policy: index.policy,
  };
}
