---
name: looplab-game-builder
description: Control LoopLab headlessly or visually to create, refine, verify, and export self-contained 2D/2.5D HTML games through the same canonical workflow used by Codex.
---

# LoopLab Game Builder for Claude Code

Use LoopLab as an AI game-authoring instrument, not as a fixed form. The visual UI is a convenience subset; the generated manifest, MCP tools, and canonical commands are the capability superset.

Keep the product strictly 2D. Side-scrollers, top-down games, connected maps, and dimetric/isometric “2.5D” are valid. Never route LoopLab work through Three.js, React Three Fiber, a 3D editor, or a GLB/glTF pipeline.

## Bootstrap Claude and establish current truth

1. Read `public/agent-manifest.json`; never rely on a remembered protocol, command list, or schema.
2. Run `npm run claude:status`. Claude Code must meet the manifest minimum, both MCP registrations must match the exact current executable/scope/arguments/workspace/app URL, both transports must connect, the private user-level LoopLab skill must match the repository-owned source bytes, and an independent loopback manifest fetch must report the exact current app protocol. A connected MCP stdio process is not proof that the editor is running. When any definition or skill is missing/stale and the user has authorized setup, run `npm run claude:setup -- "<games-root>"`. Setup is private, cross-project, idempotent, atomic for the skill, and stores no provider credential.
3. After setup or a LoopLab upgrade, start the app and run `npm run claude:smoke -- "<games-root>"`. The npm path uses a positional root because Windows npm may consume arbitrary named options; direct Node invocation accepts `--games-root=...`. Preflight must fail before model launch with an exact 0-token receipt when the editor is offline or stale. A ready run creates/removes a temporary synthetic blank project and submits one monitored, nonpersistent Haiku session restricted to that core brief plus one bounded public `list_agent_recipes` query. Its strict temporary MCP config advertises exactly one core schema and one live schema and ignores installed user/project MCP catalogs. It never sends a user game brief or shared-project catalog, defaults to a $0.25 CLI budget cap, and requires actual tool-use evidence, current transport envelopes/protocols, and measured usage. Never resubmit after a caller timeout.
4. When the app is needed, start it with `npm run open` and require companion `GET /health.protocolVersion` to equal the manifest. A registered live MCP profile may be disconnected while LoopLab is stopped; start the app instead of reinstalling it.
5. Prefer the MCP `browser` profile for the live editor and the `core` profile for workspace-contained `*.loop.json` files. Without MCP, use `window.looplabAgent` only when the browser permits new window globals; otherwise use the canonical `looplab:agent-command` DOM bridge or visible Agent API form. A non-extensible `window` does not make the editor unavailable.
6. Read `CLAUDE.md`, `AGENTS.md`, and relevant sections of `docs/AI_AGENT_GUIDE.md`. When present, read the private handoff in `claudedocs/codex-to-claude`; confirm every claim against code, the current manifest, tests, and exact receipts.
7. In the running app, inspect machine-readable state before pixels: `#looplab-project-library-state`, `#looplab-project-state`, `#looplab-director-state`, `#looplab-agent-presence-state`, `#looplab-research-state`, `#looplab-visual-review-state`, and `#looplab-asset-pack-state`.

## Canonical warm start

0. In the live profile, call `list_shared_projects` and `mount_shared_project` for the intended stable ID. Companion bytes are authoritative; browser storage is only a cache.
1. Call `get_agent_changes` with the last opaque cursor and follow `nextCursor` while `hasMore`. On `resyncRequired`, discard cached assumptions and perform the full warm start.
2. In the live profile, call `get_agent_presence`, then `register_agent_presence` with a stable Claude presence ID. Retain the returned opaque lease token locally, renew before the heartbeat deadline, and leave explicitly when possible. Presence is liveness only.
3. Call `get_agent_brief`, `get_work_ledger`, and `get_project_context {view:"campaign"}`; request only required stable map IDs with `view:"map"`. Treat omissions as unknown. Use full `get_project` only when complete embedded source is required.
4. Claim a matching shared-work item with the latest `expectedLedgerDigest`; never use presence as ownership and never duplicate another active work-ledger lease.
5. Call `draft_agent_plan` with the bounded intent and exact map scope. Account for every coverage item, ordered phase, missing input, retry/resume rule, source digest, and plan digest. Planning is provider-free and non-executing.
6. Call `get_doctor` for the current and production profiles. A clean prototype is not release readiness.
7. Use `list_agent_recipes` and `get_agent_recipe` for a matching recurring workflow. Recipes are read-only guidance, never authority or evidence.

## Select, protect, and author

1. Use `list_projects` to reconcile the mounted shared project with browser-only drafts/imports, then `create_variation` before risky work. Persist an accepted shared candidate with `save_shared_project` and the latest full-document `revisionDigest`; new IDs use `createOnly:true`. On 412, preserve the draft, use `preview_shared_project_rebase`, resolve every reported conflict, apply only the exact reviewed receipt, run gates, and save explicitly. Never force overwrite or treat a rebase as evidence.
2. Retain the current Doctor `sourceDigest`. For deterministic repairs, dry-run `auto_repair` or bounded `converge`. For arbitrary edits, call `preview_batch`, review every command plus current/release Doctor deltas, then call `apply_previewed_batch` with the unchanged source and preview digests. Never retry an applied mutation receipt.
3. Keep stable IDs. Art, collision, supports, traversal, navigation, depth, and rendering are separate authored layers. Generated pixels never own collision.
4. Store promised map count in `designBrief.campaignScope`. Connect maps through exact portal-to-spawn joins. Preserve rich-route timings, waits, facing, animation cues, meetings, events, world z, depth bias, and evidence hashes.
5. Floor-standing props require ground-contact anchors and explicit support. Dimetric projects use reversible 2:1 projection with authored world z only for elevation, support, collision separation, and deterministic depth.
6. Desktop-only games omit touch controls unless requested. Every shipped game remains one self-contained offline HTML file.

### Author canonical tile layers and autotiling

- Treat `map.tileProgram` (`looplab-tile-program/v1`) as sparse map-owned source, never renderer cache. Begin with `get_tile_program` and `get_tile_program_report`; use bounded `get_tile_region` for the exact visual/collision cells needed. `suggest_tile_program` may prepare palette references and empty layers from explicitly selected embedded tilesets, but it never invents terrain adjacency or collision from art.
- Keep direct visual cells, terrain IDs, and collision profiles independent. Terrain variants require exact eight-neighbor authored signatures; missing signatures remain Doctor blockers. Equivalent variants resolve from stable map/layer/cell/set/seed hashing, so paint order and unrelated edits cannot change them.
- Send an exact `looplab-tile-patch/v1` to `preview_tile_patch`. Review validation plus current and production Doctor deltas, then call only the returned `apply_tile_patch` command with unchanged source, tile-program, and patch digests. Stale or locked-layer writes must fail. The visible Map Studio Tiles tool uses this same workflow.
- Orthographic cells match the authored projection cell dimensions. Dimetric art remains exact 128×64 while logical cell coverage uses the map's reversible world-units-per-tile contract. Inspect `getTileRuntime()` / `get_tile_runtime` in the exported artifact and tile collision inside `getCollisionGeometry()`; Canvas or Phaser may draw the compiled entries, but neither owns terrain or collision truth.

### Author map collision chains and slopes

- Treat `map.collisionGeometry` (`looplab-collision-geometry/v1`) as optional authored world truth beside object colliders. Start with read-only `get_collision_geometry` and `get_collision_geometry_report`; use `suggest_collision_geometry` only to convert reviewed authored one-way collider tops, never sprite pixels or renderer bounds. Persist only explicit reviewed geometry through `set_collision_geometry`; use `remove_collision_geometry` to remove the complete map contract.
- Preserve stable chain/point IDs and authored point order. In the browser's y-down world, each segment's canonical right-hand normal is `(dy / length, -dx / length)`, so a floor authored left-to-right faces upward. Contacts own the start endpoint and exclude the end except on the last open segment; equal-time candidates resolve by stable chain ID and segment index.
- Use `role`, `oneWay`, `zMin`/`zMax`, and bounded tuning for floor classification, grounded-only snap, step-up, stop-on-slope, slide acceleration, maximum slide speed, and contact epsilon. Screen projection and draw order never decide collision elevation. Inspect the Map Studio Collision overlay for point order and normal direction, then verify behavior in the deterministic runtime.
- Replay v9 introduced ground chain/segment IDs, normals, and slope-slide state while v1–v8 stayed byte-compatible. Current replay v10 retains that collision projection and adds motion-body rider, accepted-delta, and crush state. Exported games expose `getCollisionGeometry()` / `get_collision_geometry`; contact state is observable through ordinary runtime state.

### Author deterministic moving platforms

- Select the exact authored object and start with provider-free `suggest_motion_body`; review its same-map authored path before persisting through `set_motion_body`. Inspect `get_motion_body_report`; use `remove_motion_body` only for an intentional reviewed removal. UI, CLI, core/live MCP, Codex, and Claude share these commands.
- Version 1 remains readable with legacy player-blocking semantics. Version 2 makes `riderMode`, bounded `carryTolerance`, and `crushResponse` explicit. Only a solid platform in platformer mode on a fixed-z path may carry the player by the exact accepted fixed-tick delta. Stop rolls the blocked substep back and holds until the rider leaves or the input driver disengages; respawn uses the canonical spawn path. Do not claim general body stacks or 2.5D elevators.
- Require authored anchors/colliders/path/support truth plus executable movement, release, block, carry, crush, endpoint, map-persistence, replay-v10, and exact one-file export evidence. Earlier replay projections stay frozen. Inspect `motion-body.crushed` and `getMotionBodyStates()` / `get_motion_body_states` rather than renderer pixels.

### Author and verify the standard game shell

- Treat `project.gameShell` (`looplab-game-shell/v1`) as the canonical renderer-neutral title/start, playing, pause/resume, settings, win/loss, and restart contract. Start with `get_game_shell` and `get_game_shell_report`; use provider-free `suggest_game_shell` for a reviewed default, persist only through `set_game_shell`, and use `remove_game_shell` only for an explicit reviewed removal or waiver.
- Production Doctor blocks accidental absence. A disabled shell is valid only with a concrete waiver. Bind terminal overlays only to deterministic runtime truth (`won`, `player-health-depleted`, or an explicit Boolean gameplay variable), never pixels, animation, wall-clock time, or provider prose.
- The shell orchestrates the existing simulation and presentation runtimes; it never becomes a second gameplay state machine. Shell lifecycle and session preferences stay outside replay hashes and portable saves. Focus/visibility loss may pause an active game but must never blindly auto-resume it.
- In the exact one-file artifact, exercise `get_game_shell`, `get_game_shell_report`, `get_game_shell_state`, `start_game`, `pause`, `resume`, `restart`, `open_game_settings`, `close_game_settings`, `set_audio_muted`, `set_master_volume`, `set_reduced_motion`, and `set_touch_control_size` through runtime API 2.27 or its DOM bridge. Verify the native settings dialog, focus behavior, no simulation advancement while paused, deterministic terminal overlays, desktop/touch policy, and zero external requests.

## Design executable systems

- Do not choose mechanics by quota. Author `verbArchitecture.version:2` from recurring player decisions. One deep verb is valid; every additional verb must earn its input, attention, onboarding, implementation, and feedback cost.
- Give every verb purpose, role, activation, standalone/dependency truth, semantic input, affordances, observable state, readable feedback, runtime IDs, and executable test IDs.
- Author intentional sequence, simultaneous, modifier, state-gate, resource-loop, counterplay, or substitution relationships. Exercise independent uses and recurring relationships during teaching, practice, pressure, recovery, mastery, or expression—not only in a finale.
- Model the repeatable decide-act-feedback loop plus resource sources, sinks, pressure, and recovery. Prose is a specification, not runtime or test evidence.
- For projectile/health/hit mechanics, begin with read-only `suggest_combat_program`, inspect `get_combat_report`, and apply only reviewed source through `set_combat_program`. Keep teams and actor/emitter IDs stable; keep health/damage integers and projectile capacity bounded. Projectiles consume authored colliders and elevation—sprites and generated art never define hits. Require semantic-input liveness, canonical combat events, save/replay compatibility, and independent acceptance before calling the mechanic complete.
- For NPCs, enemies, companions, guards, and cutscene actors, begin with read-only `suggest_actor_program`, inspect `get_actor_report`, and apply only reviewed source through `set_actor_program`. Bind every actor to one same-map authored object, enabled authored collider, support height, home node, and connected directed navigation route. Keep stable actor-ID tick order; use cutscene → visible target → remembered target → return → base behavior priority; bound sight, memory, repathing, speed, and arrival distances. Reject cross-map/self targets and route steps without authored directional links. Require actor events, `actor-state` acceptance, save v4/replay v8 compatibility, and exported `getActorStates()` / `get_actor_states` proof.
- Use deterministic gameplay programs, narrative contracts, presentation programs, visual identity, tuning, scaffold, and layout contracts through their canonical commands. Never treat schema validity as proof of fun, prose quality, visual taste, originality, licensing, or balance.

## Provider, research, and asset work

- Require at least one eligible provider path to report `ready`. Installed or authenticated alone is not enough. Treat the selection as the requested path and the job receipt's `provider` as the actual path; they differ only when recorded fallback occurs.
- Treat `codex`, `openai`, `claude`, and `anthropic` as four independent availability paths. A blocked Codex CLI must not block OpenAI API, Claude Code CLI, or Anthropic API; the same isolation applies in every direction. Default jobs use `providerMode: "fallback"`: try the requested path, its same-vendor alternate transport, the other vendor's matching transport, then the remaining path. Use `providerMode: "strict"` only for provider-specific tests, comparisons, or an explicit user lock.
- Automatic fallback is observable, never silent. Preserve `requestedProvider`, actual `provider`, ordered attempts, sanitized failure reasons, and every usage receipt in `providerRoute` and `providerFailover`. Retry the unchanged request only before a proposal has mutated the project. A failed path never owns project changes, and a caller timeout never authorizes a duplicate submission.
- Image critique has a narrower consent boundary: a consented Codex/OpenAI submission may switch only between Codex CLI and OpenAI API, while a consented Claude/Anthropic submission may switch only between Claude CLI and Anthropic API. OpenAI image generation remains OpenAI-API-only until another path supports equivalent image bytes and provenance.
- Submit long provider work exactly once to the companion, retain the job ID, and monitor the same status/events/result URLs. Caller timeouts do not authorize resubmission or cancellation.
- Require `provider.parity.locked` for Codex/Claude loops. Both providers share selection, context, pass plan, mutation authority, frozen evaluator, gates, preservation, ledger, and usage semantics; creative output and token count may differ.
- Retry Prompt, Generate, Refine, Research, AI art, and Loop must use a real ready provider. Never present local assembly or a deterministic fallback as AI generation.
- AI-art jobs are durable. Submit once, retain the job ID, and require measurement, palette/scale/anchor normalization, provenance, and `collisionPolicy:"authored-only"` before attachment. Unmeasured art remains reviewable but rejected.
- Every improvement loop identifies its highest-value uncertainty and performs source-backed research when external evidence can change the result. Apply supported findings, reject weak or 3D-expanding suggestions, and save the private cited report.
- Permanent capability harvesting is mandatory: a reusable hard-won fix must become a canonical LoopLab capability plus a regression reproducing the failure. Do not leave it as a one-off game patch.

## Verification and release

1. Rerun current and production Doctor after the coherent pass.
2. Call `run_acceptance_suite`, `get_completion_report`, `run_replay_suite`, `get_input_liveness_report`, `get_game_shell_report`, `get_combat_report` when combat exists, `get_actor_report` when actors exist, `get_collision_geometry_report` when collision chains exist, and `get_runtime_join_plan`. Never silently rerecord a replay hash or weaken a gate. A consented saved playtest remains local observation only. For a genuinely good uninterrupted v2 run, call `preview_playtest_replay` first, inspect blockers/event parity and retain its source/session/promotion digests, then call `promote_playtest_replay` with those exact digests. Legacy wall-clock sessions, non-reset starts, dropped inputs/events, mid-run resets, stale source, unsafe replacement, or event-count mismatch must remain blocked.
3. Preview and play changed verbs, maps, transitions, HUD, and affected viewports. Use Playwright and screenshot evidence for Canvas/WebGL or visual changes.
4. Use canonical `compare_iterations`; hard gates constrain feasibility, but `automaticWinner` stays null. There is no automatic creative winner. Preview/play alternatives and explicitly select one source-bound parent against the user's stated vision.
5. Collect source-bound verification evidence, verify the iteration while the Doctor digest is current, checkpoint, and promote only a non-regressing candidate.
6. Run the closest visible builder benchmark when LoopLab itself changed. Its technical score never proves fun or aesthetics.
7. Export exact candidate bytes, run release verification and `audit-html`, and open/play the one offline HTML file.

## Security and reporting

- Never read, print, serialize, export, commit, or place an API key in MCP configuration. Credentials stay in the companion environment or Windows current-user vault.
- The external LoopLab MCP servers equip Claude as the lead agent. LoopLab's internal Claude provider subprocess remains schema-bound, nonpersistent, task-scoped, tool-limited, and MCP-free.
- Report selected project/variation, provider, one-pass or loop mode, accepted/rejected result, Doctor and visual findings, browser status, exact artifact, measured tokens, and dollars. Claude subscription dollars are API-rate equivalents, not an additional charge. Deterministic work is explicitly 0 provider tokens / $0.00.
