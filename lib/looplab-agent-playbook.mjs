import { canonicalSha256 } from "./looplab-canonical-digest.mjs";
import { LOOPLAB_AGENT_COMMANDS } from "./looplab-command-surfaces.mjs";

export const LOOPLAB_AGENT_PLAYBOOK_SCHEMA = "looplab-agent-playbook/v1";
export const LOOPLAB_AGENT_PLAYBOOK_VERSION = 1;
export const LOOPLAB_AGENT_RECIPE_SCHEMA_ID = "https://looplab.local/schemas/agent-recipe-v1.json";

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const STABLE_ID = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const MAX_RECIPES = 50;
const MAX_MATCHES = 10;

export const LOOPLAB_AGENT_RECIPE_SCHEMA = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: LOOPLAB_AGENT_RECIPE_SCHEMA_ID,
  title: "LoopLab agent recipe",
  description: "A read-only, evidence-backed operating recipe. Recipes describe canonical commands but never execute them.",
  type: "object",
  properties: {
    id: { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$" },
    revision: { type: "integer", minimum: 1 },
    status: { enum: ["active", "deprecated"] },
    replacedBy: { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$" },
    title: { type: "string", minLength: 1, maxLength: 120 },
    summary: { type: "string", minLength: 1, maxLength: 500 },
    protocol: {
      type: "object",
      properties: { min: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" }, max: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" } },
      required: ["min"],
      additionalProperties: false,
    },
    tags: { type: "array", items: { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$" }, minItems: 1, maxItems: 12, uniqueItems: true },
    signals: {
      type: "object",
      properties: {
        issueCodes: { type: "array", items: { type: "string", minLength: 1, maxLength: 120 }, maxItems: 20, uniqueItems: true },
        states: { type: "array", items: { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$" }, maxItems: 12, uniqueItems: true },
        terms: { type: "array", items: { type: "string", minLength: 2, maxLength: 80 }, maxItems: 24, uniqueItems: true },
      },
      additionalProperties: false,
    },
    when: { type: "array", items: { type: "string", minLength: 1, maxLength: 400 }, minItems: 1, maxItems: 8 },
    prerequisites: { type: "array", items: { type: "string", minLength: 1, maxLength: 400 }, minItems: 1, maxItems: 12 },
    steps: {
      type: "array",
      minItems: 1,
      maxItems: 16,
      items: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$" },
          instruction: { type: "string", minLength: 1, maxLength: 600 },
          commands: { type: "array", items: { type: "string" }, maxItems: 8, uniqueItems: true, readOnly: true },
        },
        required: ["id", "instruction", "commands"],
        additionalProperties: false,
      },
    },
    stopConditions: { type: "array", items: { type: "string", minLength: 1, maxLength: 400 }, minItems: 1, maxItems: 12 },
    expectedOutcomes: { type: "array", items: { type: "string", minLength: 1, maxLength: 400 }, minItems: 1, maxItems: 12 },
    evidence: { type: "array", items: { type: "string", minLength: 1, maxLength: 400 }, minItems: 1, maxItems: 12 },
    references: { type: "array", items: { type: "string", minLength: 1, maxLength: 240 }, minItems: 1, maxItems: 12, uniqueItems: true },
    recipeDigest: { type: "string", pattern: "^sha256:[a-f0-9]{64}$", readOnly: true },
  },
  required: ["id", "revision", "status", "title", "summary", "protocol", "tags", "signals", "when", "prerequisites", "steps", "stopConditions", "expectedOutcomes", "evidence", "references", "recipeDigest"],
  additionalProperties: false,
});

const DEFINITIONS = [
  {
    id: "recover-stale-source",
    revision: 2,
    status: "active",
    title: "Recover from stale project state",
    summary: "Rebase intended edits against the exact current project instead of replacing an optimistic-concurrency digest blindly.",
    protocol: { min: "1.58.0" },
    tags: ["concurrency", "doctor", "recovery", "safety"],
    signals: { issueCodes: ["stale-source"], states: ["stale-source"], terms: ["stale source", "digest mismatch", "rebase", "concurrent edit"] },
    when: ["A mutation returns [stale-source] or the inspected sourceDigest no longer matches the selected project."],
    prerequisites: ["Retain the original intent and exact target IDs; do not retain authority from the stale digest."],
    steps: [
      { id: "read-current-brief", instruction: "Read the current bounded brief and Doctor result for the selected project.", commands: ["get_agent_brief", "get_doctor"] },
      { id: "rebase-intent", instruction: "Compare the changed IDs and findings with the intended edit, then rebuild the smallest coherent command set against current state.", commands: ["get_project"] },
      { id: "preview-current-digest", instruction: "Clone-execute the rebased coherent command set with preview_batch and the newly inspected sourceDigest; review nested errors plus current and release Doctor deltas.", commands: ["preview_batch"] },
      { id: "apply-exact-preview", instruction: "Apply only the unchanged rebased commands and summary with the current sourceDigest and exact previewDigest returned by that preview.", commands: ["apply_previewed_batch"] },
      { id: "verify-result", instruction: "Re-read Doctor and confirm the intended IDs changed without new blockers.", commands: ["get_doctor"] },
    ],
    stopConditions: ["The target ID was removed or semantically changed.", "The rebased edit would overwrite unrelated concurrent work.", "The current Doctor has a new blocker that changes the repair plan."],
    expectedOutcomes: ["The mutation is bound to current source and preserves unrelated edits.", "A stale digest is never treated as a replaceable credential."],
    evidence: ["Preview reports persistsProject:false and an exact source-bound previewDigest before mutation.", "Post-mutation Project Doctor sourceDigest differs only after the accepted authored change.", "Regression coverage rejects the original stale digest and any changed reviewed batch before mutation."],
    references: ["lib/looplab-agent-core.mjs", "tests/agent-batch-preview.test.mjs", "tests/dimetric-navigation.test.mjs", "docs/AI_AGENT_GUIDE.md"],
  },
  {
    id: "repair-doctor-mechanics",
    revision: 1,
    status: "active",
    title: "Repair deterministic Doctor mechanics",
    summary: "Preview and atomically apply only uniquely determined Project Doctor invariant repairs, while keeping route, tuning, reachability, art, and ambiguous geometry as explicit judgment residue.",
    protocol: { min: "1.59.0" },
    tags: ["doctor", "repair", "convergence", "collision", "support", "safety"],
    signals: {
      issueCodes: ["asset-collision-policy", "collision-owner", "culling-padding", "fresh-input-policy", "ground-anchor", "implicit-snap", "object-clipped-by-map", "object-outside-map", "projection-size", "projection-ratio", "projection-world-unit", "signature-density", "start-map-missing", "support-anchor", "support-gap", "support-height", "support-missing", "traversal-authority", "traversal-point-bounds"],
      states: ["doctor-mechanical-findings", "bounded-convergence"],
      terms: ["auto repair", "mechanical repair", "doctor fix", "support snap", "collision authority", "converge", "judgment residue"],
    },
    when: ["Project Doctor reports placement or metadata invariants that have one local behavior-preserving correction.", "An imported project contains multiple independent repairable invalidities that must be corrected atomically."],
    prerequisites: ["Inspect the exact current sourceDigest and finding contexts first.", "Do not classify art, route design, tuning, reachability, clearance, or non-unique geometry as mechanical."],
    steps: [
      { id: "inspect-current-doctor", instruction: "Read the current Doctor report and retain its exact sourceDigest; optionally select a bounded allowlist of finding codes.", commands: ["get_doctor"] },
      { id: "preview-safe-plan", instruction: "Run auto_repair without apply, or converge without apply for bounded repeated passes. Review exact commands, both Doctor projections, validation, stop reason, and residue.", commands: ["auto_repair", "converge"] },
      { id: "respect-residue", instruction: "Leave judgment residue unchanged until a human or provider-backed design pass can choose and test the intended behavior.", commands: ["get_agent_brief", "get_project_context"] },
      { id: "apply-exact-receipt", instruction: "Apply only the unchanged source-bound repair or convergence receipt with its exact SHA-256 digest.", commands: ["auto_repair", "converge"] },
      { id: "verify-fixed-point", instruction: "Re-run Doctor, replay, acceptance, and visual checks required by the affected features; a second mechanical dry run should propose no already-applied repair.", commands: ["get_doctor", "run_replay_suite", "run_acceptance_suite"] },
    ],
    stopConditions: ["The dry run introduces a blocker, fails validation, stalls, or detects a cycle.", "The proposed change would invent a route, collider, tuning value, visual composition, or support choice.", "The source or exact plan digest changed after preview."],
    expectedOutcomes: ["Eligible invariant findings are removed through canonical commands and one atomic outer mutation.", "Ambiguous findings remain explicit and explain why automatic repair stopped.", "Repeated execution is idempotent and bounded."],
    evidence: ["Dry-run receipt reports providerUsed:false, persistsProject:false, exact source and plan digests, and current plus release Doctor projections.", "Regression tests cover no-mutation preview, stale digest rejection, multi-map repair, invalid-intermediate isolation, idempotence, bounded passes, and visible mouse parity.", "Post-apply change feed contains one coalesced authored event and exported HTML contains no repair journal."],
    references: ["lib/looplab-auto-repair.mjs", "lib/looplab-agent-core.mjs", "tests/auto-repair.test.mjs", "docs/AI_AGENT_GUIDE.md"],
  },
  {
    id: "monitor-durable-provider-job",
    revision: 1,
    status: "active",
    title: "Monitor one durable provider job",
    summary: "Submit provider work once, retain its job ID, and monitor or resume that exact job without duplicate token spend after caller timeouts.",
    protocol: { min: "1.50.0" },
    tags: ["provider", "jobs", "tokens", "recovery"],
    signals: { issueCodes: [], states: ["pending-agent-request", "provider-job-running"], terms: ["provider timeout", "job id", "token spend", "long running", "resume job"] },
    when: ["A provider build, research task, or asset request may outlive one UI, CLI, or MCP call."],
    prerequisites: ["A ready provider is selected.", "The caller can persist the returned job ID outside transient console text."],
    steps: [
      { id: "submit-once", instruction: "Submit exactly one bounded build, research, or asset request and record the returned durable job ID.", commands: ["start_ai_build", "start_research", "generate_ai_asset"] },
      { id: "monitor-existing", instruction: "Poll or resume the existing job by ID; extend the caller wait or monitor asynchronously instead of creating another request.", commands: ["get_ai_asset_job"] },
      { id: "inspect-receipt", instruction: "When complete, inspect status, output, usage receipt, and source binding before applying any result.", commands: ["get_pending_requests", "get_agent_brief"] },
    ],
    stopConditions: ["The job reports failed or canceled.", "The selected project or source digest changed and the result no longer applies cleanly.", "The job ID is lost; inspect provider state before any resubmission."],
    expectedOutcomes: ["One user request maps to one provider job.", "Caller timeouts do not duplicate provider work or token usage."],
    evidence: ["Provider receipt identifies one job and measured usage.", "Tests verify repeated status reads do not create a second job."],
    references: ["lib/looplab-mcp-server.mjs", "docs/AI_AGENT_GUIDE.md", "tests/provider-http.test.mjs"],
  },
  {
    id: "resume-agent-session",
    revision: 1,
    status: "active",
    title: "Resume an agent session from an opaque bookmark",
    summary: "Recover only retained semantic changes after a disconnect, then re-establish authoritative source context without trusting transient UI events or stale conversation memory.",
    protocol: { min: "1.58.0" },
    tags: ["agents", "context", "recovery", "claude-parity", "concurrency"],
    signals: { issueCodes: [], states: ["agent-session-resume"], terms: ["resume session", "change feed", "opaque cursor", "missed changes", "agent memory", "warm resync"] },
    when: ["Codex or Claude returns to a selected project after another agent, the user, or a provider may have changed it."],
    prerequisites: ["The exact selected editable project is known.", "The caller retains its last opaque cursor when one exists; cursors are never parsed or synthesized."],
    steps: [
      { id: "read-missed-changes", instruction: "Call get_agent_changes with the last stored cursor, or omit cursor once to establish a new bookmark. Follow nextCursor until hasMore is false.", commands: ["get_agent_changes"] },
      { id: "honor-resync", instruction: "If resyncRequired is true, discard cached assumptions and rebuild orientation from the current brief plus bounded campaign and map context.", commands: ["get_agent_brief", "get_project_context"] },
      { id: "reconcile-authority", instruction: "Treat events as orientation only. Re-read current Doctor and shared-work state before planning or claiming work.", commands: ["get_doctor", "get_work_ledger"] },
      { id: "store-current-bookmark", instruction: "After reconciliation or a successful mutation, retain the latest currentCursor outside transient console text for the next resume.", commands: ["get_agent_changes"] },
    ],
    stopConditions: ["The cursor is expired or belongs to another feed; perform the declared warm resync instead of assuming no changes.", "A feed event is being treated as editable project source, verification evidence, or permission to mutate.", "A caller proposes storing prompts, provider content, credentials, assets, snapshots, patches, or exported HTML in the journal."],
    expectedOutcomes: ["Returning agents recover bounded authored, coordination, lifecycle, provider, mouse, and history changes without replaying entire conversations.", "Compaction is explicit and safe: an unrecoverable cursor demands a warm resync rather than returning a misleading empty delta."],
    evidence: ["Regression tests prove stable initial cursors, exact pagination, atomic batch coalescing, compaction resync, privacy bounds, and source/export neutrality.", "The visible Agent API exposes the same cursor workflow and advisory browser event as headless transports."],
    references: ["lib/looplab-agent-change-feed.mjs", "tests/agent-change-feed.test.mjs", "app/page.tsx", "docs/AI_AGENT_GUIDE.md"],
  },
  {
    id: "harden-browser-command-transport",
    revision: 1,
    status: "active",
    title: "Use the hardened browser command transport",
    summary: "Drive one canonical browser command contract through the window API, DOM event bridge, or form bridge without inventing UI-only behavior.",
    protocol: { min: "1.50.0" },
    tags: ["browser", "bridge", "headless", "claude-parity"],
    signals: { issueCodes: [], states: ["browser-global-unavailable"], terms: ["window api", "dom bridge", "form bridge", "headless browser", "claude browser"] },
    when: ["A browser automation environment cannot access or retain window.looplabAgent, or a content wrapper blocks direct page globals."],
    prerequisites: ["The running app exposes the generated protocol manifest and bridge selectors.", "The caller uses the same canonical command object on every transport."],
    steps: [
      { id: "inspect-manifest", instruction: "Read the protocol and transport selectors before sending a command.", commands: ["get_manifest"] },
      { id: "prefer-window-api", instruction: "Use window.looplabAgent.run when the page global is available and extensible.", commands: ["get_agent_brief"] },
      { id: "fall-back-to-dom", instruction: "If the global is unavailable, send the same command through looplab:agent-command and await the correlated response event.", commands: ["get_agent_brief"] },
      { id: "fall-back-to-form", instruction: "If script injection cannot call either API, use the hidden bridge form and parse its result field.", commands: ["get_agent_brief"] },
      { id: "confirm-parity", instruction: "Confirm the response protocol version and sourceDigest before mutation.", commands: ["get_doctor"] },
    ],
    stopConditions: ["The app protocol differs from the caller's expected protocol.", "A transport returns a response for a different correlation ID.", "The fallback would scrape visible UI text instead of the canonical bridge."],
    expectedOutcomes: ["Codex, Claude, Playwright, and mouse-driven UI share one validated operation model.", "A blocked page global does not make the builder inaccessible."],
    evidence: ["Browser bridge tests exercise window, event, and form paths.", "Returned Doctor sourceDigest matches the visible selected project."],
    references: ["app/page.tsx", "lib/looplab-browser-agent-session.mjs", "tests/mcp-server.test.mjs", "tests-build/rendered-html.test.mjs", "docs/AI_AGENT_GUIDE.md"],
  },
  {
    id: "diagnose-replay-divergence",
    revision: 1,
    status: "active",
    title: "Diagnose deterministic replay divergence",
    summary: "Stop at the first deterministic mismatch, fix the implementation or explicitly version an intentional behavior change, and never silently rerecord truth.",
    protocol: { min: "1.50.0" },
    tags: ["replay", "determinism", "regression", "safety"],
    signals: { issueCodes: ["replay-failed", "replay-stale", "replay-diverged"], states: ["replay-not-passed"], terms: ["replay mismatch", "hash divergence", "determinism", "rerecord"] },
    when: ["Project Doctor or the replay suite reports stale, failed, or divergent deterministic evidence."],
    prerequisites: ["Retain the failing fixture, revision, first mismatch, and current source digest."],
    steps: [
      { id: "run-exact-suite", instruction: "Run the current source-bound replay suite and preserve the first mismatch details.", commands: ["run_replay_suite"] },
      { id: "inspect-runtime-boundaries", instruction: "Compare fixed-step inputs, state transition, map join, and gameplay hash at the first divergent tick.", commands: ["get_project", "get_runtime_join_plan"] },
      { id: "fix-or-version", instruction: "Fix accidental drift. Only for an intentional measured behavior change, record a higher fixture revision with an explicit reason.", commands: ["record_replay_case"] },
      { id: "rerun-gates", instruction: "Rerun replay, acceptance, and Doctor against the same authored source.", commands: ["run_replay_suite", "run_acceptance_suite", "get_doctor"] },
    ],
    stopConditions: ["The first mismatch is not understood.", "A new baseline would merely hide a regression.", "Simulation or route evidence changed without an explicit version reason."],
    expectedOutcomes: ["Accidental divergence is fixed at its source.", "Intentional behavior changes remain reviewable through a new revision and reason."],
    evidence: ["The exact current replay suite passes.", "Acceptance and Doctor results are bound to the same current sourceDigest."],
    references: ["lib/looplab-replay.mjs", "tests/replay-contract.test.mjs", "tests/dimetric-navigation.test.mjs"],
  },
  {
    id: "place-grounded-supported-prop",
    revision: 1,
    status: "active",
    title: "Place a grounded supported prop",
    summary: "Keep visible bounds, ground contact, support footprint, collider, and elevation explicit so floor-standing art and gameplay geometry agree.",
    protocol: { min: "1.50.0" },
    tags: ["collision", "placement", "support", "assets"],
    signals: { issueCodes: ["support-missing", "support-drift", "anchor-invalid", "collision-footprint-mismatch"], states: [], terms: ["floating prop", "ground anchor", "vending machine", "footprint", "supported prop"] },
    when: ["A prop must visibly sit on a floor or elevated support and may own authored collision."],
    prerequisites: ["Know the exact destination map, visual bounds, ground-contact point, gameplay footprint, and intended support surface."],
    steps: [
      { id: "inspect-support", instruction: "Inspect candidate floor and elevated support surfaces at the target world position and z range.", commands: ["inspect_supports"] },
      { id: "preview-proven-macro", instruction: "Preview the built-in place-supported-prop macro with explicit visual bounds, anchor, footprint, collider, and support parameters.", commands: ["list_command_macros", "preview_command_macro"] },
      { id: "apply-exact-plan", instruction: "Apply only the exact previewed expansion and source digest when no new Doctor blocker appears.", commands: ["apply_command_macro"] },
      { id: "verify-placement", instruction: "Inspect support attachment, collision, culling, and rendered contact in edit and play modes.", commands: ["inspect_supports", "get_doctor", "capture_visual_review"] },
    ],
    stopConditions: ["Generated pixels are being treated as collision truth.", "The gameplay footprint is inferred from transparent or decorative pixels.", "The prop overlaps a solid architectural footprint or route-clearance zone."],
    expectedOutcomes: ["The prop's ground contact remains stable at its authored support z.", "Visual size and gameplay footprint can differ without invisible or missing collision."],
    evidence: ["Macro preview introduces no new Doctor blocker.", "Rendered capture shows correct contact while runtime collision uses authored geometry."],
    references: ["lib/looplab-command-macros.mjs", "lib/looplab-support.mjs", "tests/command-macros.test.mjs", "tests/support-import.test.mjs"],
  },
  {
    id: "connect-maps-round-trip",
    revision: 1,
    status: "active",
    title: "Connect maps with explicit round-trip joins",
    summary: "Author stable forward and return portals, exact destination spawns, and runtime-join evidence so map order and transitions are unambiguous.",
    protocol: { min: "1.50.0" },
    tags: ["maps", "joins", "portals", "campaign"],
    signals: { issueCodes: ["map-join-invalid", "map-unreachable", "portal-target-missing"], states: ["runtime-join-not-passed"], terms: ["connect maps", "map transition", "round trip", "portal", "target spawn"] },
    when: ["The player must experience one authored map before another and return or continue through a stable route."],
    prerequisites: ["Both map IDs exist and every intended destination has a stable spawn ID."],
    steps: [
      { id: "preview-round-trip", instruction: "Preview the built-in round-trip map macro with stable portal/spawn IDs and explicit placement.", commands: ["list_command_macros", "preview_command_macro"] },
      { id: "apply-round-trip", instruction: "Apply the exact previewed expansion atomically against the current source digest.", commands: ["apply_command_macro"] },
      { id: "inspect-join-plan", instruction: "Inspect the complete runtime join plan and confirm both directions resolve to exact spawns.", commands: ["get_runtime_join_plan"] },
      { id: "exercise-runtime", instruction: "Load each map and exercise the joins in preview before collecting acceptance/replay evidence.", commands: ["preview_load_map", "run_acceptance_suite", "run_replay_suite"] },
      { id: "verify-doctor", instruction: "Confirm map order, reachability, and join contracts remain blocker-free.", commands: ["get_doctor"] },
    ],
    stopConditions: ["A target spawn is missing or ambiguous.", "The join exists only in editor metadata and not the exported runtime plan.", "A return portal accidentally reuses the forward exit."],
    expectedOutcomes: ["Map progression has explicit player-facing order and deterministic destinations.", "Forward and return joins work in preview and the exported runtime."],
    evidence: ["Runtime join plan reports valid explicit joins.", "Acceptance/replay exercises map traversal against the current sourceDigest."],
    references: ["lib/looplab-command-macros.mjs", "lib/looplab-runtime-join.mjs", "tests/command-macros.test.mjs", "tests/runtime-join.test.mjs"],
  },
  {
    id: "release-one-file-html",
    revision: 2,
    status: "active",
    title: "Release one offline HTML game",
    summary: "Build and verify one self-contained HTML artifact whose Doctor, replay, browser, and export evidence all describe the same source.",
    protocol: { min: "1.56.0" },
    tags: ["export", "offline", "release", "html"],
    signals: { issueCodes: ["export-stale", "external-dependency", "package-budget-exceeded"], states: ["release-candidate", "export-not-ready"], terms: ["single file html", "offline game", "ship ready", "release export"] },
    when: ["A candidate is intended for download, upload, distribution, or final user review as one HTML file."],
    prerequisites: ["The selected project is an editable candidate whose production Doctor is blocked by no issue except the exact offline-verification gate, and current editor evidence can be collected."],
    steps: [
      { id: "inspect-release-state", instruction: "Read the current brief and production Doctor result; do not reuse an older receipt.", commands: ["get_agent_brief", "get_doctor"] },
      { id: "run-behavior-gates", instruction: "Run acceptance, completion, replay, and runtime-join checks against the current source.", commands: ["run_acceptance_suite", "get_completion_report", "run_replay_suite", "get_runtime_join_plan"] },
      { id: "collect-browser-evidence", instruction: "Capture visual review and collect strict source-bound verification evidence in the real browser harness.", commands: ["capture_visual_review", "collect_verification_evidence"] },
      { id: "verify-exact-artifact", instruction: "Submit one durable exact release job, wait on that same job ID, then inspect its source- and SHA-256-bound attestation. Never replace it with a Boolean flag or duplicate submission.", commands: ["verify_release", "get_release_verification_job", "get_release_verification"] },
      { id: "verify-candidate", instruction: "Verify and deliberately promote only the exact evidence-bound candidate.", commands: ["verify_iteration", "promote_iteration"] },
      { id: "prepare-and-export", instruction: "Prepare and export the one-file production artifact, then require receipt v3 to reproduce the attested SHA-256 exactly.", commands: ["prepare_export", "export_html"] },
    ],
    stopConditions: ["Any current blocker, warning required by the production profile, or stale evidence remains.", "The exact browser job fails, is cancelled, or belongs to a stale source.", "The artifact requests an external network/storage dependency.", "The export receipt sourceDigest or SHA-256 differs from the selected project attestation."],
    expectedOutcomes: ["Exactly one HTML file contains the runtime, authored data, and selected assets.", "The release receipt identifies the artifact hash, byte/memory budgets, and exact source digest."],
    evidence: ["Production Doctor is warning-clean where required.", "A current looplab-release-verification/v1 attestation binds source, policy, verifier, required checks, captures, and exact HTML SHA-256.", "Real-browser harness reports no external requests or unhandled errors.", "Single-file audit and exported-runtime smoke tests pass."],
    references: ["lib/looplab-release-verification.mjs", "lib/looplab-release-verification-runner.mjs", "lib/looplab-single-file-audit.mjs", "tests/release-verification.test.mjs", "tests/export-runtime.test.mjs", "tests/platform-harness.test.mjs", "docs/AI_AGENT_GUIDE.md"],
  },
  {
    id: "coordinate-shared-agent-work",
    revision: 1,
    status: "active",
    title: "Coordinate shared Codex and Claude work",
    summary: "Use independent digest-guarded leases and evidence-backed lifecycle updates so agents avoid duplicate subsystem work without changing game source truth.",
    protocol: { min: "1.51.0" },
    tags: ["coordination", "concurrency", "handoff", "claude-parity"],
    signals: { issueCodes: ["stale-ledger"], states: ["shared-work-active"], terms: ["shared work", "work ledger", "agent claim", "claude handoff", "duplicate work", "claim lease"] },
    when: ["Codex, Claude, or the user may work on the same project or hand a subsystem between sessions."],
    prerequisites: ["The exact selected editable project is known.", "The caller has a stable actor ID and can retain the latest ledgerDigest."],
    steps: [
      { id: "read-current-ledger", instruction: "Read the current bounded work ledger and retain its exact independent digest before any coordination mutation.", commands: ["get_work_ledger"] },
      { id: "claim-matching-work", instruction: "Claim matching open work before editing, or add one strict item when a durable handoff materially helps; never duplicate another actor's active lease.", commands: ["add_work_item", "claim_work_item"] },
      { id: "renew-or-handoff", instruction: "Renew long-running work with the same claim command, or release it deliberately when handing it back without a lifecycle conclusion.", commands: ["claim_work_item", "release_work_item"] },
      { id: "record-outcome", instruction: "Mark blocked, landed, or rejected only with the required blockers, result summary, and concrete evidence references.", commands: ["update_work_item"] },
      { id: "confirm-boundary", instruction: "Re-read the brief and Doctor to confirm coordination is visible while the gameplay sourceDigest and verification boundary remain unchanged.", commands: ["get_agent_brief", "get_doctor"] },
    ],
    stopConditions: ["The ledger digest is stale; reread and rebase instead of retrying blindly.", "Another actor owns an active claim and no explicit handoff or justified takeover exists.", "The proposed entry contains credentials, prompts, responses, hidden reasoning, or provider transcripts.", "A ledger item is being treated as permission to execute work or bypass a gate."],
    expectedOutcomes: ["Every active subsystem has visible attributable ownership and an expiring lease.", "Claude and Codex can hand work across sessions without the user relaying state manually.", "Coordination changes never alter gameplay source truth, provider input, verification, undo history, or shipped HTML."],
    evidence: ["Concurrent stale ledger writes are rejected before persistence.", "Claim, renew, takeover, release, blocked, landed, and rejected lifecycle tests pass.", "Provider-context and one-file-export tests prove the ledger is omitted while get_agent_brief exposes bounded active work."],
    references: ["lib/looplab-agent-work-ledger.mjs", "tests/agent-work-ledger.test.mjs", "tests/mcp-server.test.mjs", "docs/AI_AGENT_GUIDE.md"],
  },
];

const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function nonEmptyString(value, label, maximum) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  const normalized = value.trim();
  if (normalized.length > maximum) throw new Error(`${label} must be at most ${maximum} characters.`);
  if ([...normalized].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error(`${label} cannot contain control characters.`);
  return normalized;
}

function uniqueStrings(value, label, { minimum = 0, maximum = 20, stableIds = false } = {}) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new Error(`${label} must contain between ${minimum} and ${maximum} strings.`);
  const normalized = value.map((entry, index) => nonEmptyString(entry, `${label}[${index}]`, 600));
  if (stableIds && normalized.some((entry) => !STABLE_ID.test(entry))) throw new Error(`${label} must contain stable lowercase IDs.`);
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} must not contain duplicates.`);
  return normalized;
}

function validateDefinition(definition, index) {
  const label = `Agent recipe[${index}]`;
  const allowed = new Set(["id", "revision", "status", "replacedBy", "title", "summary", "protocol", "tags", "signals", "when", "prerequisites", "steps", "stopConditions", "expectedOutcomes", "evidence", "references"]);
  const unknown = Object.keys(definition).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`${label} has unknown fields: ${unknown.join(", ")}.`);
  const id = nonEmptyString(definition.id, `${label}.id`, 120);
  if (!STABLE_ID.test(id)) throw new Error(`${label}.id must be a stable lowercase ID.`);
  if (!Number.isInteger(definition.revision) || definition.revision < 1) throw new Error(`${label}.revision must be a positive integer.`);
  if (!["active", "deprecated"].includes(definition.status)) throw new Error(`${label}.status must be active or deprecated.`);
  if (definition.status === "deprecated" && (!definition.replacedBy || !STABLE_ID.test(definition.replacedBy))) throw new Error(`${label} requires replacedBy when deprecated.`);
  if (definition.status === "active" && owns(definition, "replacedBy")) throw new Error(`${label} cannot define replacedBy while active.`);
  if (!definition.protocol || typeof definition.protocol !== "object" || Array.isArray(definition.protocol) || !SEMVER.test(definition.protocol.min ?? "") || (definition.protocol.max && !SEMVER.test(definition.protocol.max))) throw new Error(`${label}.protocol requires semver min and optional max.`);
  const protocolUnknown = Object.keys(definition.protocol).filter((key) => !["min", "max"].includes(key));
  if (protocolUnknown.length) throw new Error(`${label}.protocol has unknown fields: ${protocolUnknown.join(", ")}.`);
  nonEmptyString(definition.title, `${label}.title`, 120);
  nonEmptyString(definition.summary, `${label}.summary`, 500);
  uniqueStrings(definition.tags, `${label}.tags`, { minimum: 1, maximum: 12, stableIds: true });
  if (!definition.signals || typeof definition.signals !== "object" || Array.isArray(definition.signals)) throw new Error(`${label}.signals must be an object.`);
  const signalUnknown = Object.keys(definition.signals).filter((key) => !["issueCodes", "states", "terms"].includes(key));
  if (signalUnknown.length) throw new Error(`${label}.signals has unknown fields: ${signalUnknown.join(", ")}.`);
  uniqueStrings(definition.signals.issueCodes ?? [], `${label}.signals.issueCodes`, { maximum: 20 });
  uniqueStrings(definition.signals.states ?? [], `${label}.signals.states`, { maximum: 12, stableIds: true });
  uniqueStrings(definition.signals.terms ?? [], `${label}.signals.terms`, { maximum: 24 });
  uniqueStrings(definition.when, `${label}.when`, { minimum: 1, maximum: 8 });
  uniqueStrings(definition.prerequisites, `${label}.prerequisites`, { minimum: 1, maximum: 12 });
  uniqueStrings(definition.stopConditions, `${label}.stopConditions`, { minimum: 1, maximum: 12 });
  uniqueStrings(definition.expectedOutcomes, `${label}.expectedOutcomes`, { minimum: 1, maximum: 12 });
  uniqueStrings(definition.evidence, `${label}.evidence`, { minimum: 1, maximum: 12 });
  uniqueStrings(definition.references, `${label}.references`, { minimum: 1, maximum: 12 });
  if (!Array.isArray(definition.steps) || definition.steps.length < 1 || definition.steps.length > 16) throw new Error(`${label}.steps must contain between 1 and 16 steps.`);
  const stepIds = new Set();
  for (const [stepIndex, step] of definition.steps.entries()) {
    if (!step || typeof step !== "object" || Array.isArray(step)) throw new Error(`${label}.steps[${stepIndex}] must be an object.`);
    const stepUnknown = Object.keys(step).filter((key) => !["id", "instruction", "commands"].includes(key));
    if (stepUnknown.length) throw new Error(`${label}.steps[${stepIndex}] has unknown fields: ${stepUnknown.join(", ")}.`);
    const stepId = nonEmptyString(step.id, `${label}.steps[${stepIndex}].id`, 120);
    if (!STABLE_ID.test(stepId) || stepIds.has(stepId)) throw new Error(`${label}.steps must use unique stable IDs.`);
    stepIds.add(stepId);
    nonEmptyString(step.instruction, `${label}.steps[${stepIndex}].instruction`, 600);
    const commands = uniqueStrings(step.commands, `${label}.steps[${stepIndex}].commands`, { maximum: 8 });
    const unknownCommands = commands.filter((command) => !LOOPLAB_AGENT_COMMANDS.includes(command));
    if (unknownCommands.length) throw new Error(`${label}.steps[${stepIndex}] references unknown commands: ${unknownCommands.join(", ")}.`);
  }
  return clone(definition);
}

const validated = DEFINITIONS.map(validateDefinition);
const ids = validated.map((recipe) => recipe.id);
if (new Set(ids).size !== ids.length) throw new Error("Agent playbook recipe IDs must be unique.");
for (const recipe of validated.filter((candidate) => candidate.status === "deprecated")) {
  if (!ids.includes(recipe.replacedBy)) throw new Error(`Deprecated agent recipe ${recipe.id} names missing replacement ${recipe.replacedBy}.`);
}

const RECIPES = Object.freeze(validated.map((recipe) => Object.freeze({
  ...recipe,
  recipeDigest: canonicalSha256({ schemaVersion: LOOPLAB_AGENT_PLAYBOOK_SCHEMA, recipe }),
})));

const REGISTRY_DIGEST = canonicalSha256({
  schemaVersion: LOOPLAB_AGENT_PLAYBOOK_SCHEMA,
  registryVersion: LOOPLAB_AGENT_PLAYBOOK_VERSION,
  recipes: RECIPES.map((recipe) => ({ id: recipe.id, revision: recipe.revision, status: recipe.status, recipeDigest: recipe.recipeDigest })),
});

function summary(recipe) {
  return {
    id: recipe.id,
    revision: recipe.revision,
    status: recipe.status,
    ...(recipe.replacedBy ? { replacedBy: recipe.replacedBy } : {}),
    title: recipe.title,
    summary: recipe.summary,
    protocol: clone(recipe.protocol),
    tags: [...recipe.tags],
    signals: clone(recipe.signals),
    stepCount: recipe.steps.length,
    commands: [...new Set(recipe.steps.flatMap((step) => step.commands))],
    recipeDigest: recipe.recipeDigest,
  };
}

function normalizedQueryTokens(value) {
  return [...new Set(String(value ?? "").toLowerCase().match(/[a-z0-9][a-z0-9-]{1,}/g) ?? [])].slice(0, 20);
}

function searchableText(recipe) {
  return [recipe.id, recipe.title, recipe.summary, ...recipe.tags, ...recipe.signals.issueCodes, ...recipe.signals.states, ...recipe.signals.terms, ...recipe.when].join(" ").toLowerCase();
}

function boundedLimit(value, fallback, maximum = MAX_RECIPES) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < 1 || number > maximum) throw new Error(`limit must be an integer between 1 and ${maximum}.`);
  return number;
}

export function getAgentPlaybook() {
  return clone({
    schemaVersion: LOOPLAB_AGENT_PLAYBOOK_SCHEMA,
    registryVersion: LOOPLAB_AGENT_PLAYBOOK_VERSION,
    registryDigest: REGISTRY_DIGEST,
    recipeSchema: LOOPLAB_AGENT_RECIPE_SCHEMA,
    count: RECIPES.length,
    policy: {
      readOnly: true,
      sourceControlled: true,
      autoExecution: false,
      mutationAuthority: "Canonical LoopLab commands retain all source-digest, Project Doctor, replay, provider, browser, and export gates.",
      updatePolicy: "A recurring failure earns a recipe only after the solution and its regression evidence are committed and tested.",
    },
    recipes: RECIPES,
  });
}

export function listAgentRecipes(options = {}) {
  const queryTokens = normalizedQueryTokens(options.query);
  const tag = String(options.tag ?? "").trim().toLowerCase();
  const issueCode = String(options.issueCode ?? "").trim();
  const status = String(options.status ?? "active").trim().toLowerCase();
  if (!["active", "deprecated", "all"].includes(status)) throw new Error("status must be active, deprecated, or all.");
  if (tag && !STABLE_ID.test(tag)) throw new Error("tag must be a stable lowercase ID.");
  const limit = boundedLimit(options.limit, RECIPES.length);
  const matches = RECIPES.filter((recipe) => {
    if (status !== "all" && recipe.status !== status) return false;
    if (tag && !recipe.tags.includes(tag)) return false;
    if (issueCode && !recipe.signals.issueCodes.includes(issueCode)) return false;
    if (queryTokens.length && !queryTokens.every((token) => searchableText(recipe).includes(token))) return false;
    return true;
  }).slice(0, limit);
  return clone({
    schemaVersion: LOOPLAB_AGENT_PLAYBOOK_SCHEMA,
    registryVersion: LOOPLAB_AGENT_PLAYBOOK_VERSION,
    registryDigest: REGISTRY_DIGEST,
    recipeSchemaId: LOOPLAB_AGENT_RECIPE_SCHEMA_ID,
    totalCount: RECIPES.length,
    count: matches.length,
    filters: { query: queryTokens.join(" "), tag: tag || null, issueCode: issueCode || null, status },
    recipes: matches.map(summary),
    policy: { readOnly: true, autoExecution: false },
  });
}

export function getAgentRecipe(id) {
  const normalized = nonEmptyString(id, "recipeId", 120);
  const recipe = RECIPES.find((candidate) => candidate.id === normalized);
  if (!recipe) throw new Error(`Unknown agent recipe: ${normalized}. Run list_agent_recipes to inspect the available playbook.`);
  return clone({
    schemaVersion: LOOPLAB_AGENT_PLAYBOOK_SCHEMA,
    registryVersion: LOOPLAB_AGENT_PLAYBOOK_VERSION,
    registryDigest: REGISTRY_DIGEST,
    recipeSchemaId: LOOPLAB_AGENT_RECIPE_SCHEMA_ID,
    recipe,
    warning: recipe.status === "deprecated" ? `Recipe ${recipe.id} is deprecated; use ${recipe.replacedBy}.` : null,
    policy: { readOnly: true, autoExecution: false },
  });
}

export function matchAgentRecipes(context = {}) {
  const issueCodes = [...new Set((context.issueCodes ?? []).map((value) => String(value ?? "").trim()).filter(Boolean))].slice(0, 40);
  const states = [...new Set((context.states ?? []).map((value) => String(value ?? "").trim().toLowerCase()).filter((value) => STABLE_ID.test(value)))].slice(0, 24);
  const queryTokens = normalizedQueryTokens(context.query);
  const limit = boundedLimit(context.limit, 3, MAX_MATCHES);
  const ranked = [];
  for (const recipe of RECIPES) {
    if (recipe.status !== "active") continue;
    let score = 0;
    const reasons = [];
    for (const issueCode of issueCodes) {
      if (!recipe.signals.issueCodes.includes(issueCode)) continue;
      score += 100;
      reasons.push(`issue:${issueCode}`);
    }
    for (const state of states) {
      if (!recipe.signals.states.includes(state)) continue;
      score += 60;
      reasons.push(`state:${state}`);
    }
    const text = searchableText(recipe);
    for (const token of queryTokens) {
      if (!text.includes(token)) continue;
      score += 10;
      reasons.push(`query:${token}`);
    }
    if (score > 0) ranked.push({ ...summary(recipe), relevance: { score, reasons: reasons.slice(0, 12) } });
  }
  ranked.sort((left, right) => right.relevance.score - left.relevance.score || left.id.localeCompare(right.id));
  return clone({
    schemaVersion: "looplab-agent-playbook-matches/v1",
    registryDigest: REGISTRY_DIGEST,
    count: Math.min(limit, ranked.length),
    matches: ranked.slice(0, limit),
  });
}

export function validateAgentPlaybook() {
  return {
    valid: true,
    schemaVersion: LOOPLAB_AGENT_PLAYBOOK_SCHEMA,
    registryVersion: LOOPLAB_AGENT_PLAYBOOK_VERSION,
    registryDigest: REGISTRY_DIGEST,
    count: RECIPES.length,
  };
}
