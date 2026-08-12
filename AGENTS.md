# Looplab agent instructions

Looplab is an AI-first builder for 2D HTML games. The user supplies the creative brief and optional constraints. The agent owns planning, implementation, asset generation, verification, versioning, and evidence; the user may make small precision edits afterward.

## Non-negotiable workflow

For live work, first call `list_shared_projects` and explicitly `mount_shared_project` for the intended stable ID. Use `list_projects` only to reconcile mounted shared entries with local drafts/imports. The companion-owned `.looplab/projects/` bytes outrank browser caches. `sourceDigest` is Doctor/gameplay truth; `revisionDigest` is strong whole-document concurrency truth. Persist accepted work with `save_shared_project` plus the latest `expectedRevisionDigest`, or `createOnly:true` for a new ID. On 412, keep the draft, call `preview_shared_project_rebase`, inspect every conflict, apply only an exact conflict-free receipt, run gates, and save explicitly. Never force overwrite or treat a rebase as evidence.

1. Resume through `get_agent_changes`: pass the last opaque cursor and follow `nextCursor` while `hasMore`, or omit the cursor once to establish a bookmark. If it returns `resyncRequired`, discard cached assumptions and perform the full warm start. Then read `get_agent_brief`, the pending request, and `get_work_ledger` before changing anything. The feed is orientation only—not source, evidence, or authority. The brief reports both `readiness.current` (the active authoring profile) and `readiness.release` (the production target) on one source digest; a clean prototype/current profile is not release readiness. Use `get_project_context` with `view: "campaign"`, then `view: "map"` plus stable `mapIds` for the maps you will touch. Treat omissions as unknown, not absent; use full `get_project` only when complete embedded source is genuinely required. If an existing work item covers the subsystem, claim it before editing; do not duplicate active work owned by another agent. If no item applies, proceed normally or add one when coordination or handoff will materially help.
2. Convert the bounded request into a source-bound plan with `draft_agent_plan`. Treat its `coverage` and ordered `phases` as authoritative: every detected requirement must be satisfied, planned, blocked, or explicitly need input. Review exact map scope, operation contracts, retry/resume rules, `sourceDigest`, and `planDigest`. Preserve completed evidence, redraft after authored source changes, resume durable jobs by ID, and never retry an applied mutation receipt. A plan is provider-free and non-executing; it never replaces explicit canonical commands or grants permission to mutate.
3. Run Project Doctor before the pass and record its digest, blockers, warnings, and next actions.
   Inspect the brief's relevant Agent Playbook references. Use `list_agent_recipes` and `get_agent_recipe` when a recurring failure or release workflow matches; recipes are read-only and never replace explicit commands or evidence.
4. Route the work through `route_work`. Architecture comes first; Playwright browser playtest evidence comes last. For a new game, use the `creation` / Full game creation workstream so the whole roster is routed instead of one narrow subsystem.
5. Make one coherent candidate pass with stable IDs. When current findings match the `repair-doctor-mechanics` recipe, dry-run `auto_repair` or bounded `converge` first; review every exact command, both Doctor projections, stop reason, and judgment residue, then apply only with the unchanged source and repair/convergence digest. Never expand mechanical eligibility to art, route design, reachability, tuning, collider semantics, clearance, or another non-unique choice. For an arbitrary multi-command change, call `preview_batch` first, review its exact current/release Doctor deltas and canonical `previewDigest`, then call `apply_previewed_batch` with the unchanged commands, summary, source digest, and preview digest. Keep `apply_batch` only for legacy or deliberately unreviewed single-boundary callers.
   When the uncertainty is numeric gameplay feel, inspect `get_feel_report`, author or accept an explicit bounded contract with `suggest_tuning_contract` / `set_tuning_contract`, then call `run_tuning_search` with the exact current Doctor source digest. Treat its safe Pareto set as measured tradeoffs, not a ranking or proof of fun; `automaticWinner` must remain `null`. Preview a changed candidate through its returned ordinary `preview_batch` command, play it, and apply the exact preview only to a protected variation. Never add an arbitrary target path, auto-apply a candidate, loosen a failed Doctor/replay/acceptance gate, or rerecord evidence to make a search result pass.
   When the uncertainty is quest, economy, or encounter structure, use `suggest_structural_scaffold_contract` / `set_structural_scaffold_contract`, then `run_structural_scaffold_search` against the exact Doctor source digest. Compare descriptor-distinct safe candidates; `automaticWinner` must remain `null`. Fill every returned content slot, call `materialize_structural_scaffold` with the exact candidate digest, and run its ordinary `preview_batch`. Existing gameplay programs are protected unless `replace-explicit` was deliberately authored on a variation. Structural feasibility never proves fun, balance, prose, art, collision, map geometry, or spatial playability.
   When map geometry is uncertain, use `suggest_spatial_layout_contract` / `set_spatial_layout_contract`, then `run_spatial_layout_search` against the exact Doctor source digest. Bind the contract to one exact map and projection-compatible family, review every mandatory player/spawn/goal/portal/locked pin, and compare descriptor-distinct side-view, top-down, or dimetric 2.5D candidates without a winner. Existing geometry is protected unless `replace-explicit` was deliberately authored on a protected variation. Call `materialize_spatial_layout` with the exact candidate digest, run its ordinary `preview_batch`, inspect and play the visual result, then apply only that receipt. Never rerecord acceptance/replay evidence, infer collision from art, or treat technical feasibility as proof of pacing, composition, originality, or quality.
6. Run Project Doctor again. Reject the candidate if it introduces a blocker, invalidates a feature contract, targets a stale build, or edits generated output.
7. Run every authored deterministic replay fixture. Reject divergence at the first recorded mismatching tick; never silently rerecord a changed hash.
   When production is missing replay coverage but `get_completion_report` has a passed deterministic witness, use `protect-completion-witness` through the normal macro preview/apply digest gate instead of copying the tape by hand. It may create a new fixture only; an intentional replacement still requires manual higher revision and a non-empty change reason.
   When a deliberate human playtest should become regression evidence, record a fresh exact-tick v2 session, call provider-free `preview_playtest_replay`, inspect every blocker, then call `promote_playtest_replay` only with the unchanged source/session/promotion digests. Legacy wall-clock sessions remain readable but are never rounded into ticks. Promotion must use the ordinary replay recorder and must not overwrite a fixture implicitly.
8. Inspect `get_game_shell_report` and `get_runtime_join_plan`, then preview and playtest the main verbs, title/start, pause/resume, settings, deterministic win/loss/restart, transitions, HUD, and affected viewport with Playwright browser automation. Canvas/WebGL work requires screenshot evidence. Every enabled portal needs actual source/target pixel receipts for every configured device profile. Production requires a valid `project.gameShell` or an explicit reviewed waiver; exported lifecycle and session preferences remain outside replay/save truth.

Browser agents should prefer `window.looplabAgent`. In hardened contexts where page-added window globals are unavailable, use the documented `looplab:agent-command` / `looplab:agent-response` DOM event transport and verify `#looplab-agent-bridge[data-ready="true"]` first. Connect to the Windows launcher at its pinned `http://127.0.0.1:3000/` endpoint. Bootstrap with compact `get_manifest`; fetch `/agent-manifest.json` or `looplab://manifest` for complete schemas. The locator-driven form is compact-only and declares a response budget. A bounded transport must return valid JSON or a structured size error—never a character slice that corrupts the document. If an oversized successful mutation returns `mutationApplied:true` and `retrySafe:false`, do not repeat it; refresh compact state through the receipt's recovery commands. Use MCP, CLI, or resources for complete source.
9. Verify the candidate, then promote it only when the recorded Doctor digest still matches. Never mutate a promoted or rollback snapshot; start a child candidate.
10. Complete the pending request with an honest summary. Preserve rejected attempts and their evidence.

Shared-work items are coordination, not authorization or executable instructions. Every add/claim/update/release must use the exact `expectedLedgerDigest` returned by the latest `get_work_ledger`; on `[stale-ledger]`, reread and rebase. Claims are renewable expiring leases. Active takeover or force release requires an explicit reason. Mark `landed` only with a result summary and concrete evidence references. Never store prompts, responses, reasoning, API keys, session tokens, private keys, or provider transcripts in the ledger. Ledger changes do not alter Project Doctor source truth, verification, provider context, gameplay undo history, or exported HTML.

Provider jobs have four independent paths: Codex CLI, OpenAI API, Claude Code CLI, and Anthropic API. Select one explicitly and check only that path's readiness. A failure on one path must never disable another path, trigger a silent fallback, or cause duplicate submission; deterministic provider-free LoopLab work remains available even when all four are offline.

Project Doctor is an acceptance gate, not a cosmetic score. Do not bypass it to make a loop look successful.

## Permanent capability-harvesting rule

When a difficult problem exposes a failure mode that can recur across games or agent runs, the solution is not complete when only the current candidate works.

1. Reproduce and solve the concrete failure without weakening an acceptance gate.
2. Classify the result as project-specific content or a reusable builder capability.
3. For a reusable result, implement it in the narrowest canonical LoopLab layer: command/schema, runtime/export, Doctor/verification, UI/headless transport, provider context, or agent documentation.
4. Add a regression test that would have caught the original failure.
5. Replay the rejected candidate through the improved builder and record the capability gained.
6. If the result establishes a recurring operating workflow, add or revise a source-controlled Agent Playbook recipe only after the implementation and regression test exist. Keep the recipe bounded, evidence-backed, and non-executable.
7. When deterministic state grows, add a new replay `hashVersion` projection. Fixtures without a version retain the original v1 projection; never reinterpret or silently rerecord accepted hashes under a richer schema.

Keep one-off narrative, art direction, level content, and game balance in the project. Do not contaminate builder defaults with a single game's creative constraints.

## Builder benchmark discipline

When a pass changes LoopLab itself, select the closest visible task from `list_builder_benchmarks` before claiming that the builder improved. Run `evaluate_builder_benchmark` against the exact candidate and retain its task, source, and receipt digests plus every raw blocker. Use `compare_builder_benchmark_runs` only for receipts with the same task revision, provider, model, scaffold, strategy, and context budget. Provider-free re-grading is one deterministic observation. Provider-backed generation must use the ordinary Director and durable companion lifecycle, never benchmark detection or a privileged prompt path, and requires complete trial indexes `1..N`; use at least three independent trials for a provisional stochastic claim. Token or rate-equivalent cost comparisons are eligible only when every run on both sides passes the same technical gate. Benchmark scores never prove fun, originality, composition, pacing, or art direction; browser playtest and human visual judgment remain separate evidence.

## Long-running provider jobs

Provider loops launched from Codex must be owned by the long-lived Looplab companion, not by a shell call that can time out. Before submission, require `GET /health.protocolVersion` to match the current headless manifest. Restart or replace a stale companion instead of letting old validation code judge a new project. Every companion `POST` also requires the current `x-looplab-session-token` from the ignored `.looplab/companion-session.json`; treat it as local control material, never log it or place it in provider context. Submit once to `POST /jobs`, retain the job ID, and poll `/jobs/{id}/status`, `/events`, or `/result`. Never submit a duplicate while the job is `starting` or `running`, and never infer token usage when a run dies before a measured receipt exists.

If a requested pass would require one enormous structured response, preserve the exact overall objective but decompose it into ordered bounded passes. Each pass must have stable handoff IDs, a narrow mutation scope, and its own Doctor/replay gate; do not resend the monolithic goal or repeat completed work.

Treat provider context as a gated artifact. `POST /jobs` accepts `contextBudgetTokens` (default 96,000 rough tokens; supported range 8,000–200,000). Read `provider.pass-plan.prepared`, `provider.pass.started`, `provider.context.prepared`, and `provider.context.blocked`; a blocked preflight means no provider request ran and usage is zero. Never raise the budget or truncate authored map/collision/replay/acceptance truth merely to make a request fit. Root active-map mirrors are omitted when `maps[]` exists. OpenAI cache keys are derived only from the stable non-private developer instruction; cache savings are real only when measured usage reports cached tokens.

## Specialist execution truth

- `route_work.agentPlan` is a coordinated role plan. One selected provider executes the AI-role reviews in one request per pass; these labels are not claims of independent model processes.
- Creative direction, loop design, architecture, gameplay, level/collision, art, audio, UI/accessibility, and one-file release roles require concise provider coverage receipts.
- Project Doctor Critic is executed by deterministic Project Doctor code, not by a provider receipt.
- Playtest QA is executed with a real browser and Playwright evidence. It remains pending until those checks and screenshots exist.
- The console may say a provider role was covered only when the response returned its receipt. Never fabricate per-agent activity.

## Headless interfaces

Browser global: `window.looplabAgent`

```js
const api = window.looplabAgent;
let lastOpaqueCursor = persistedCursor;
const changes = await api.run({ op: "get_agent_changes", cursor: lastOpaqueCursor });
if (changes.result.resyncRequired) throw new Error("Warm resync required before continuing");
lastOpaqueCursor = changes.result.nextCursor;
await api.run({ op: "get_pending_requests" });
const shared = await api.run({ op: "get_work_ledger", status: "all" });
const ledgerDigest = shared.result.ledgerDigest;
await api.run({ op: "claim_work_item", id: "existing-work-id", actor: "codex", leaseSeconds: 7200, expectedLedgerDigest: ledgerDigest });
await api.run({ op: "get_project_context", view: "campaign" });
await api.run({ op: "get_project_context", view: "map", mapIds: ["map-main"] });
const plan = await api.run({ op: "draft_agent_plan", intent: "Improve route flow without weakening replay", mapIds: ["map-main"] });
console.log(plan.result.planDigest, plan.result.strategy, plan.result.missingInputs);
// Call get_project only when the complete editable source is required.
await api.run({ op: "get_doctor", profile: "prototype" });
await api.run({ op: "route_work", prompt, track: "gameplay" });
const commands = [/* stable-ID LoopLab core authoring commands */];
const preview = (await api.run({
  op: "preview_batch",
  expectedSourceDigest: plan.result.sourceDigest,
  summary: "What this candidate changes",
  commands,
})).result;
if (!preview.applicable) throw new Error("Batch preview is not safe to apply");
await api.run({
  op: "apply_previewed_batch",
  expectedSourceDigest: preview.sourceDigest,
  expectedPreviewDigest: preview.previewDigest,
  summary: "What this candidate changes",
  commands,
});
await api.run({ op: "get_doctor", profile: "production" });
await api.run({ op: "run_replay_suite" });
await api.run({ op: "get_runtime_join_plan" });
await api.run({ op: "set_mode", mode: "play" });
const evidence = await api.run({ op: "collect_verification_evidence" });
const exact = await api.run({ op: "verify_release", filename: "game.html", wait: true });
if (!exact.ok) throw new Error("Exact hostile-browser release verification failed");
await api.run({ op: "get_release_verification" });
await api.run({ op: "verify_iteration", evidenceRefs: evidence.evidenceRefs });
```

Wait for the `looplab:ready` event before using the browser global. Listen to `looplab:project-changed` for state updates and `looplab:agent-requested` for user prompts.

CLI:

```powershell
npm run agent -- manifest
npm run agent -- playbook "replay mismatch"
npm run agent -- recipe diagnose-replay-divergence
npm run agent -- work game.loop.json --status=in-progress
npm run agent -- context game.loop.json
npm run agent -- context game.loop.json map-main --view=map
npm run agent -- plan game.loop.json "improve route flow without weakening replay" --maps=map-main
npm run agent -- batch-preview game.loop.json --source-digest=source-... --summary="What this candidate changes" < commands.json
npm run agent -- batch-apply game.loop.json --source-digest=source-... --preview-digest=sha256:... --summary="What this candidate changes" < commands.json
npm run agent -- inspect game.loop.json
npm run agent -- doctor game.loop.json production
npm run agent -- replay game.loop.json
npm run agent -- benchmarks
npm run agent -- benchmark-evaluate game.loop.json systems-choice-economy --output=receipt.json
npm run agent -- benchmark-compare baseline-receipt.json candidate-receipt.json --output=comparison.json
npm run agent -- scaffold-suggest game.loop.json --max-candidates=6
npm run agent -- scaffold-search game.loop.json --source-digest=source-...
npm run agent -- route game.loop.json gameplay "improve route flow"
npm run agent -- verify-release game.loop.json game.html --captures=.looplab/release-game
npm run agent -- export game.loop.json game.html
npm run agent -- audit-html game.html
'{"op":"add_object","kind":"coin","object":{"id":"reward-a","name":"Reward A","x":320,"y":280}}' | npm run agent -- apply game.loop.json
npm run loop -- --provider openai --project game.loop.json --iterations 5 --strategy cycle --evaluation-profile auto --conditions "map flow|mobile HUD|sprite cohesion" --goal "polish this game"
```

The direct `npm run loop` form is for a durable interactive terminal or bounded file-provider testing. Codex-driven real-provider jobs use the companion lifecycle above so caller timeouts cannot terminate the provider child.

Available providers are `openai`, `anthropic`, `codex`, `claude`, and the test-only `file` adapter. API keys belong only in the companion runtime: either its process environment (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`) or Looplab's Windows current-user DPAPI vault. They must never enter browser state, project JSON, prompts, logs, commits, or exports.

Before prompt drafting, generation, looping, research, visual critique, AI art, local-copilot inference, shared-project publication, release verification, or export, require `get_privacy_report {profile:"production"}` to be clear on the current source. Creative paths repeat the value-free scan against their exact outbound text before an API fetch or CLI/local-model launch. A blocked finding must spend zero provider tokens, must not be echoed, and must be removed locally rather than sent to another provider for repair.

Before starting a headless loop, run `npm run providers:check` or call `GET /providers?refresh=1` and require the selected provider's state to be `ready`. Do not infer that Codex or Claude is usable merely because an executable exists. Prefer the Connection Center's supported account login for `codex` or `claude`; on Windows, API-provider setup uses a native password-masked prompt and current-user encryption so the secret never passes through the web app.

Codex and Claude consume one canonical LoopLab authoring contract. Claude Code 2.1.205 or newer runs with schema-bound stream JSON, a required final `structured_output`, nonpersistent safe mode, `dontAsk` permissions, no MCP servers, and a task-scoped tool list; prompt/game passes get no tools and research gets only WebSearch/WebFetch. Selecting `claude` uses the authenticated Claude CLI session detected by the companion. Receipts distinguish subscription sessions from API-key, access-token, Bedrock, or Vertex sessions without exposing credential values. Never substitute the direct `anthropic` API, accept free-form text as an equivalent structured result, or expose provider content in liveness events.

That MCP-free rule applies to LoopLab's internal Claude provider subprocess, not an external Claude lead-agent session. External Claude uses the private `looplab-core` and `looplab-live` profiles directly. `npm run claude:status` must verify their exact persisted definitions, synchronized skill bytes, and the running app's exact manifest protocol; stdio connectivity alone is insufficient. After setup or an upgrade, `npm run claude:smoke -- "<games-root>"` proves both profiles with a synthetic blank fixture and public recipe query through an isolated two-schema MCP config. It must spend 0 provider tokens when preflight fails and must never submit a user project/catalog for this proof.

Before changing or looping a game, call `list_projects` and explicitly `select_project`; `#looplab-project-library-state` is the DOM-readable index. Loading a folder or template adds a library entry instead of silently replacing another project. Use `create_variation` for experiments: it preserves the base entry and selects a renamed child candidate. `get_prompt_draft` exposes deterministic prepared provider input until AI output exists. `retry_prompt` must call the selected ready provider through the loopback companion, preserve the user's exact words and all UI or arbitrary headless constraints, return a materially different prompt, and retain provider/model provenance. If the provider is unavailable or returns invalid output, keep the existing prompt and report the failure; never pass off a local template as AI generation. The UI is a convenience subset: use `get_director_state`, `configure_director`, `start_ai_build`, and `start_research`, or call the companion endpoints directly when a headless task needs options the UI does not expose.

## Source of truth

- Authoring project: `*.loop.json` or the live browser project state.
- Generated outputs: packaged HTML, atlases, manifests, reports, and version files. Regenerate them; do not edit them directly.
- Gameplay collision is always authored map data. Generated art may suggest an alpha footprint but must use `collisionOwner: "authored-map"` and asset `collisionPolicy: "authored-only"`.
- Connected floors, slopes, and boundaries use optional strict `map.collisionGeometry` source. Use `get_collision_geometry` / `get_collision_geometry_report`, review provider-free `suggest_collision_geometry`, and mutate only through `set_collision_geometry` or `remove_collision_geometry`. Preserve stable chain/point order, canonical right-hand normals in y-down coordinates, half-open endpoint ownership, explicit z ranges, bounded floor snap/step/slide tuning, and replay v9 contact state. Pixel art and projection never create this geometry.
- A `motionBody` remains authored simulation data: require a ground-contact anchor, an enabled authored collider, `collisionOwner: "authored-map"`, and a same-map authored path. Renderer sprites never own or advance it.
- An `actorProgram` remains authored simulation data: every actor binds to one same-map object, enabled authored collider, support height, home node, connected directed navigation route, and optional same-map target. Renderer sprites and generated art never own perception, navigation, transitions, or collision.
- Object placement uses explicit ground-contact anchors. Visual bounds and collision footprints are independent.
- A feature contract links visual asset, anchor, collision/support geometry, interaction socket, input action, animation state, scoring, sound/feedback, placement restrictions, responsive/culling rules, and acceptance tests.

## Map rules

- Dimetric projects use exact 128×64 diamonds and a 2:1 projection.
- Portals require a valid target map and target spawn. A fresh `E`/LOCK input is required; proximity does not snap or transfer.
- `connect_maps` enables a `runtimeJoin` contract by default. Visual QA must drive that real portal, require its exact clear landing, hide the player in both captures, hash both environments, and measure genuinely new target pixels beyond any declared overlap. Copied-overlap equality is insufficient.
- Keep high routes and underpasses on explicit, independent z/route layers.
- Use support z, authored collider z ranges, deterministic depth keys, and depth slices for raised foreground/background occlusion.
- Validate run-up, preview, interaction, landing, recovery, and next-decision zones. Do not place props inside those zones, buildings, or solid tiles.
- Repeated modular paths need authored endpoints and gap-free joins.
- Keep signature tiles sparse and edge-seal repeated textures.
- Include culling padding and HUD/device exclusion zones.

## Sprite and asset rules

- Treat the optional `project.visualIdentity` contract as canonical authoring guidance shared by the Director, AI art, visual critique, Doctor, CLI, MCP, Codex, and Claude. Inspect or mutate it only through `get_visual_identity`, `get_visual_identity_report`, `set_visual_identity`, and `remove_visual_identity`; only explicit `userAuthored:true` directives may be locks.
- Provider art inherits visual identity by default. A one-job bypass requires `useVisualIdentity:false`. Semantic references never upload pixels; every applicable `delivery:image` reference requires fresh `referenceConsent:true` for that exact job. Retain only IDs, hashes, counts, and byte lengths in public requests or receipts.
- Visual identity never owns collision, support, traversal, navigation, depth, replay, or acceptance. Valid schema and matching receipts do not prove beauty, originality, licensing, or adherence; use captured-pixel review and explicit judgment. Omit the contract from standalone runtime payloads.
- Generate complete strips from one approved identity seed when possible.
- Lock palette, facing, equipment, logos, shared scale, frame count, transparent edges, and bottom-center/ground contact across frames.
- Normalize independent frames before packing. Reject duplicate characters, frame leakage, silhouette drift, anchor drift, disconnected equipment, and alpha halos.
- Report encoded package bytes and decoded RGBA memory (`width × height × 4`) separately.
- Use stable human-readable asset manifest keys.

## Runtime and UI routing

- Begin runtime-sensitive work with `route_work`. Its program-owned knowledge covers Canvas, Phaser, PixiJS, and melonJS strengths, costs, best-fit signals, native lessons, and failure boundaries. This knowledge is available without loading an external Codex or Claude skill.
- Compose capabilities, not competing engines. Each game has one primary frame/render owner; LoopLab simulation, authored collision, replay, semantic input, DOM UI, assets, Project Doctor, and Playwright remain shared renderer-independent services.
- Canvas and the pinned Phaser 3.90.0 browser adapter are release-ready. Use `set_runtime_profile` rather than manually editing `runtimeProfile` and `release`; it atomically binds the selected primary adapter to its truthful one-file delivery metadata. PixiJS and melonJS knowledge is installed, but their adapters remain blocked until their exact exports pass the same static and browser gates.
- Auto may select Phaser for a new game when scene lifecycle, tilemaps, cameras, sprite animation, or physics/debug tooling materially improves it. Single-file delivery is never a Phaser penalty. Existing projects remain on their current runtime during improvement passes unless the user explicitly opts into migration.
- Read `route_work.context.narrative`. Auto includes both the Narrative Designer and Narrator/Dialogue Writer only when the authored brief or `narrative` workstream contains material story, character, dialogue, quest, lore, environmental-storytelling, or branching-choice signals. `narrativeMode: "include"|"exclude"` is the explicit override. Both roles are stages in the same provider request: the designer owns causality, continuity, choices, state bindings, and endings; the narrator/writer owns voice, dialogue, barks, tutorial copy, and readable text equivalents. Author `narrativeContract` with stable gameplay/map/feature/line/beat/ending IDs and linked acceptance IDs, then inspect `get_narrative_report`. Do not add mandatory lore to mechanics-first work, use prose as implementation evidence, or make essential information audio-only.
- Default lean route when no engine benefit is established: Web Game Foundations → One-file HTML → Canvas Performance → relevant collision/input/feel/UI/asset work → Verification Gates → Game Playtest.
- The Card Wind Runner reuse guide is incorporated as machine-readable contract `card-wind-runner-reuse-guide` at SHA-256 `9662eb78f40a6c6e74931485a5a9ff54a26345ae833ac4d2f2fefaa9fa560083`. Extract its renderer-independent systems; never copy its large scene, runner-specific content, or renderer-owned state into maker core.
- Project schema `1.0.0` owns serializable authored state. The simulation runs at 60 Hz with at most five catch-up steps, reports dropped catch-up, and keeps cameras, effects, animation playback, and renderer objects out of gameplay truth.
- Movement templates are optional system compositions, not core inheritance. The directed brief can select kinetic runner/skating, traditional platformer, top-down action RPG, twin-stick shooter, tactics grid, deck combat, or exploration/narrative.
- Author rails, grinds, ziplines, and routes with `add_traversal_path`, `update_traversal_path`, and `remove_traversal_path`. Paths carry explicit control points, entry radius/speed, direction, exit, transfer, and bail data; a fresh E/LOCK press is required for capture. Artwork remains a separate view of the path.
- Author deterministic moving platforms, hazards, doors, carriers, and machinery with provider-free `suggest_motion_body`, then reviewed `set_motion_body` / `remove_motion_body`; inspect `get_motion_body_report`. Version 1 remains legacy player-blocking data. Version 2 makes `riderMode`, `carryTolerance`, and `crushResponse` explicit: a solid fixed-z platform in platformer mode may transfer only its exact accepted simulation delta to the player, then either roll back and hold or use the canonical respawn path when that carry is blocked. Do not claim general stacks or 2.5D elevators. Require executable movement/release/blocking/carry/crush/endpoint/map-persistence evidence, preserve save v1 for projects without bodies and save v2 when bodies exist, keep replay v1-v9 frozen, and use replay v10 for rider/accepted-delta/crush state.
- Author NPCs, enemies, companions, guards, and cutscene actors with `suggest_actor_program` / `set_actor_program`; inspect `get_actor_report`. Fixed-tick stable actor-ID order uses cutscene, visible-target, remembered-target, return, then base behavior priority. Patrol/cutscene steps must follow authored directed navigation links; chase/flee/return use bounded deterministic A*; line of sight selects the nearest authored collider hit with stable ID ties. Reject self/cross-map targets, require `actor-state` acceptance, use save v4/replay v8 for latent actor state, and inspect one-file exports through `getActorStates()` / `get_actor_states`.
- For 2.5D work, prefer the `dimetric` starter or `add_dimetric_map`. Exact 128×64 projection is a reversible view adapter over authored world x/y/z; visual z, support z, collider z ranges, route layers, traversal height, and terrain depth slices are independent contracts.
- Path Editor exchange is bidirectional. Use `import_path_editor_navigation` and `export_path_editor_navigation`; preserve the `looplab-rich-route-v2` extension whenever height or a timed authored route exists. Never silently flatten a deck, rooftop, or underpass into z=0, or discard timing, waits, animation cues, facing, meetings, events, depth, or hash receipts.
- Navigation A* must keep an admissible heuristic when link multipliers are below 1, and blocked-link checks must use exact segment/polygon intersection on overlapping height ranges rather than sparse samples.
- A routed camera, continuous-world, animation, effect, or streaming capability is not proof the candidate implements it. Activate optional systems only with authored project data, declared requirements, and linked acceptance evidence. Validate the actual runtime chunk join, not copied overlap equality.
- Canvas 2D is the compact default. Phaser is valid only through LoopLab's pinned, SHA-256-checked inline browser bundle. Pixi's future delivery contract is an inline browser UMD/IIFE, and melonJS's is a tree-shaken inline IIFE; until those actual adapters pass the artifact and browser gates, use their absorbed decision knowledge without claiming their engine is shipped. Module-only, CDN, network-asset, or multi-file output violates the upload contract.
- Treat Awesome Canvas as a discovery index, not an approved dependency list. Verify the original project, current implementation, and license behind every link before reusing code or art.
- Keep simulation state outside Canvas/Phaser/Pixi/melonJS render objects. Renderers are view adapters.
- Keep dense HUD, menus, settings, and narrative UI in responsive DOM overlays that protect the playfield.
- LoopLab is a 2D HTML game builder. Do not route work through Three.js, React Three Fiber, a 3D editor, or a GLB/glTF pipeline. Dimetric/isometric “2.5D” stays inside the 2D model: sprites and tiles are drawn through a reversible projection while authored world z remains available only for elevation, support, collision separation, and deterministic depth.
- `hbg-loop` is intentionally excluded from this project's route and manifest.

## One-file upload contract

- The deliverable is exactly one `.html` file. It contains the runtime, styles, maps, authored collision, UI, controls, project metadata, procedural audio code, and only the assets selected into the project.
- Never leave `<script src>`, `<link href>`, module imports, CDN URLs, runtime fetches, or storage requirements in the artifact.
- Service workers, Cache API dependencies, and multi-file PWA exports are outside the single-upload contract. Source-guide sidecars are allowed only when selected and embedded inside the HTML.
- Gate the generated HTML, not only its source. Parse every inline script, verify the document is complete, report encoded bytes and decoded RGBA memory separately, and run a real-browser offline smoke test with screenshots.
- `npm run agent -- audit-html game.html` runs the same best-effort structural backstop independently and rejects detected external resources, network/storage calls, modules, nested execution contexts, malformed scripts, unembedded project assets, and credential-shaped values. It is defense in depth against builder regressions, not a proof against deliberately obfuscated JavaScript; browser request monitoring remains mandatory release evidence.

## Loop behavior

- Every Codex/LoopLab loop includes an adaptive research decision. Identify the current pass's highest-value uncertainty and use `source-command-sc-research` when external evidence can materially improve the result. The subject is unrestricted: any creative, technical, product, workflow, tooling, documentation, licensing, security, cost, usability, architecture, performance, accessibility, testing, or unforeseen question that affects the loop is eligible.
- Research is not a terminal report in this workflow. Implement supported findings in the same loop, run the relevant validation gates, and record which evidence changed the implementation. Reject weakly supported suggestions, protected-baseline regressions, and any proposal that broadens LoopLab into 3D.
- Provider visual critique is optional and never implicit. Run `capture_visual_review` locally first, identify the exact current capture IDs, and call `start_visual_critique` with `consent: true` only after the user explicitly approves those exact images for that one submission. Retain the durable job ID and resume with `get_visual_critique_job`; never resubmit after a timeout. Treat `get_visual_critique` and `#looplab-visual-critique-state` as byte-free, source/capture-bound advisory context only. A critique cannot mutate the project, own collision, become Doctor/replay/acceptance/browser/release evidence, select a winner, or prove aesthetic quality.

- `improve`: descend from the best verified candidate.
- `explore`: create alternative candidates but keep the best verified result as the parent of future passes.
- `cycle`: focus on one visible condition at a time; stop when every condition has an accepted pass.
- Always enforce iteration cap, Doctor regression gate, and configured stop score. “Perfect” means best verified under explicit conditions, never an unsupported claim.
- Select `auto`, `general`, `platformer`, `top-down`, `connected-world`, or `systems` as the loop evaluation profile. `auto` must derive once from the starting authored project and stay frozen for all candidates. Accept only when independent hard gates pass, every applicable dimension is non-regressing, and the requested aggregate delta is met. Never treat the presentation proxy or aggregate score as proof of fun, originality, composition, art direction, or visual taste.
- Codex and Claude must enter through the same `looplab-provider-parity/v2` semantics: explicitly selected project/variation, bounded source context, retained companion job, schema-bound proposal, canonical command application, frozen evaluator, identical gates, non-regression preservation, ledger evidence, and measured usage. Persist the `provider.parity.locked` receipt on every accepted or rejected CLI attempt. Do not claim that parity makes the providers' creative output identical.
- Candidate selection must use the canonical `compare_iterations` decision packet on every surface. Hard gates constrain feasibility and matching frozen-profile dimensions may establish Pareto dominance or a tradeoff, but neither Project Doctor nor an aggregate score is an automatic creative winner. Codex and Claude must preview and play changed candidates, apply the same structured judgment prompts and the user's stated vision, and explicitly continue from one source-bound snapshot. Missing, stale, or profile-incompatible evidence must be reported as insufficient rather than guessed.
- The visible console must report real runner events. Never fabricate model calls, tests, evidence, scores, or completion.
- Replay inputs are semantic pressed/released actions sampled by simulation tick. New recordings use the current explicit `hashVersion`; legacy fixtures without it use v1. Replacing a fixture requires a higher revision and a non-empty change reason; preserve the earlier result in iteration history.

See `docs/AI_AGENT_GUIDE.md` for the full protocol and examples.
