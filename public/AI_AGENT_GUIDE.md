# Using Looplab as an AI game-building agent

This guide is for Codex, Claude, and other agents that build games through LoopLab. The agent contract is the primary product surface: an agent should be able to discover, create, inspect, edit, preview, test, compare, recover, and export without depending on a visible control. The Windows UI is a secondary direction, evidence-review, and precise-tweak surface for the user; manual editing is optional and must never become a capability ceiling.

LoopLab is an AI capability amplifier, not a form the agent is confined to. Prefer its typed headless state and commands for precise, repeatable work; use the rendered editor and browser automation when visual judgment, direct manipulation, or screenshot evidence matters. UI edits and headless edits must pass the same command validation and Project Doctor gates.

The product scope is strictly **2D HTML games**. Side-scrollers, top-down games, connected rooms, single-screen games, and dimetric/isometric “2.5D” maps are in scope. A dimetric map may author world x/y/z for elevation, supports, collision separation, and deterministic draw order, but its renderer and assets remain 2D Canvas, tiles, and sprites. Do not route LoopLab through Three.js, React Three Fiber, a 3D editor, or a GLB/glTF asset pipeline.

## Discover and connect

The complete machine-readable manifest is available at `/agent-manifest.json`. Its `commandContracts` section is the canonical JSON Schema 2020-12 definition for every operation. In a local project, use `npm run agent -- manifest`. The live browser command `{ "op": "get_manifest" }` defaults to a bounded, parseable bootstrap index containing every operation, surface, mutation class, required field, and accepted field. Use the static URL or `looplab://manifest` when complete nested schemas are required; request `compact: false` only on a transport that can safely carry the full document. Never treat character-truncated text as JSON.

Prefer LoopLab's official-SDK MCP stdio server when Codex or Claude should operate the builder as a native toolset. The `core` profile works only on workspace-contained `.loop.json` files, requires the current Project Doctor digest for gameplay mutations, and writes valid projects atomically. The `browser` profile keeps one private Playwright page connected to the running app and exposes project-library selection, Director/provider work, visual review, preview input, and the complete browser-session surface. Read `looplab://manifest`, `looplab://agent-playbook`, `looplab://agent-guide`, and `looplab://mcp-setup` as MCP resources. For core work, begin with `get_agent_changes`; for live work, call `list_projects`, explicitly `select_project`, then `get_agent_changes`. Pass the caller's last opaque cursor or omit it once to establish a bookmark. Next read `get_agent_brief`. Its `readiness.current` is the active authoring profile, while `readiness.release` is the production target evaluated on the same source; a current/prototype pass is never release readiness. Read `get_work_ledger`, then request a source-bound `get_project_context` campaign or selected-map view. Its omissions are explicit and never mean absence; it is neither mutation input nor verification evidence. Request `get_project` only when complete embedded data is actually required. See `docs/MCP_AGENT_SETUP.md` for Codex and Claude registration.

MCP equips the external agent operating LoopLab. It does not change the provider security boundary: LoopLab's own Codex/Claude subprocesses remain task-scoped, schema-bound, nonpersistent, and MCP-free.

### One shared project store

For a live session, begin with `list_shared_projects`. Mount the intended stable ID with `mount_shared_project`; use `list_projects` only to reconcile mounted shared entries with browser-local imports and unsaved drafts. The companion owns canonical bytes under `.looplab/projects/<id>/project.loop.json`. Browser IndexedDB/localStorage are caches and never outrank the companion. `sourceDigest` remains Project Doctor/gameplay truth; the separate strong `revisionDigest` covers the complete editable project and is the only shared-store concurrency token.

After an accepted mutation, call `save_shared_project` with the latest `expectedRevisionDigest`. New IDs use `createOnly:true`. A stale update returns 412 and preserves both canonical bytes and the caller's local draft. Call `preview_shared_project_rebase`, inspect every conflict, and apply only an exact conflict-free receipt with `apply_shared_project_rebase`. Rebase changes the browser draft only: rerun the required gates, then save explicitly against the remote revision. Never retry a stale write unchanged, force an ambiguous winner, or treat a rebase as verification evidence.

CLI equivalents are `npm run agent -- projects`, `npm run agent -- select-project <id> [--full]`, and `npm run agent -- publish-project <path> --id=<id> --create-only|--revision-digest=revision-...`. Shared project paths are workspace-relative only. Companion-owned `metadata.json` stores library labels and lineage outside project truth; it never enters Project Doctor, providers, gameplay history, or exported HTML.

On npm 10, a trailing script option such as `--attach` or `--compact` may be removed from `process.argv` and exposed as `npm_config_attach=true` instead. The agent CLI recovers only its closed allowlist of single-value options and reports every recovery in `argumentForwarding`; inspect that receipt when the option changes behavior. LoopLab deliberately refuses to recover destructive `--force` and repeatable `--pointer` values because npm cannot prove their exact multiplicity or invocation origin. Put an extra `--` immediately before `--force` or the first repeated `--pointer`, for example `npm run agent -- init game.loop.json blank -- --force`. Never treat an absent or unreported flag as applied.

List responses are deliberately compact. Full iteration objectives, embedded assets, prompts, and project bytes are loaded only by an explicit mount/read, preventing catalog discovery from consuming game-building context.

Without MCP, launch the Windows app at its pinned `http://127.0.0.1:3000/` endpoint, wait for `looplab:ready`, then use `window.looplabAgent`. Hardened automation contexts can make `window` non-extensible; use the DOM event transport below whenever the global is unavailable. The live authoring source is readable from `#looplab-project-state`, and `#looplab-director-state` exposes the selected provider, readiness, prepared provider input, active generated prompt, loop configuration, and companion endpoints.

```js
async function runLooplab(command) {
  if (window.looplabAgent?.run) return window.looplabAgent.run(command);
  const bridge = document.querySelector("#looplab-agent-bridge");
  if (!bridge || bridge.dataset.ready !== "true") throw new Error("Looplab agent bridge is not ready");
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      document.removeEventListener("looplab:agent-response", receive);
      reject(new Error("Looplab agent command timed out"));
    }, 10_000);
    function receive(event) {
      if (event.detail?.id !== id) return;
      clearTimeout(timeout);
      document.removeEventListener("looplab:agent-response", receive);
      resolve(event.detail.result);
    }
    document.addEventListener("looplab:agent-response", receive);
    document.dispatchEvent(new CustomEvent("looplab:agent-command", { detail: { id, command } }));
  });
}

const api = { run: runLooplab };
```

If an automation sandbox also blocks DOM event listeners, use the stable form transport. Open `#looplab-agent-bridge`, fill `#looplab-agent-command` with one JSON command, activate `#looplab-agent-submit`, wait for it to re-enable, then read `#looplab-agent-result`. This is intentionally a real DOM form so Playwright-style locator tools can operate without page-global JavaScript access.

The form is a **compact-only bounded fallback**, not a complete-project transfer channel. It forces `compact: true` and declares its response schema and character limit in `data-response-schema` and `data-response-limit`. It always returns one complete parseable JSON document—never a character slice. If a successful mutation would exceed the budget, the form returns an applied receipt with `mutationApplied: true` and `retrySafe: false`; do not repeat that command. If a read-only result is too large, it returns `agent-form-response-too-large` plus recovery commands and full-result surfaces. Retrieve complete source through core/browser MCP, the project-file CLI, or a documented resource.

```js
await page.locator("#looplab-agent-bridge > summary").click();
await page.locator("#looplab-agent-command").fill(JSON.stringify({ op: "get_project_context", view: "campaign" }));
await page.locator("#looplab-agent-submit").click();
const result = JSON.parse(await page.locator("#looplab-agent-result").inputValue());
if (result?.result?.transport?.mutationApplied && result.result.transport.retrySafe === false) {
  // The requested mutation already happened. Follow result.result.recovery; never resubmit it.
}
```

### Use explicit preference memory as adjacent context

The browser-session profile exposes `get_preference_memory`, `get_applied_preferences`, `set_preference_memory_enabled`, `add_preference_statement`, `record_candidate_preference`, `update_preference_entry`, `remove_preference_entry`, `clear_preference_memory`, and `import_preference_memory`. These commands are the canonical surface; the Director controls are only a visible editor for the same builder-local state. Read `#looplab-preference-memory-state` or listen for `looplab:preference-memory-changed` when DOM state is more efficient than a command round trip.

Preference memory contains only explicit user statements and source-bound candidate comparisons. It is an adjacent soft prior, never the project source, sole working memory, hidden reward, acceptance condition, or automatic winner. The current brief, explicit style locks, and current authored project always take precedence. Each provider run carries the exact selected entry IDs and canonical receipt digest. Reject malformed fields instead of normalizing them, and never infer a dislike from an omitted choice. The state is browser-local on the supported Windows host and deliberately absent from file-only core commands, screenshots, prompts, provider responses, credentials, replays, and one-file exports.

```js
const memory = await api.run({ op: "get_preference_memory" });
const applied = await api.run({ op: "get_applied_preferences" });
await api.run({
  op: "add_preference_statement",
  statement: "Prefer readable silhouettes over noisy surface detail.",
  dimensions: ["player-clarity", "art-direction"],
  context: { genres: ["platformer"] },
});
```

The local companion listens on `http://127.0.0.1:4317`. It can invoke the OpenAI or Anthropic API using server-side environment variables, or use authenticated Codex/Claude CLIs. Codex uses schema-bound JSONL and Claude uses schema-bound stream JSON with a required final `structured_output`. Both adapters convert genuine provider activity into content-free `provider.activity` events containing only allowlisted event/item types; prompts, responses, reasoning, tool arguments, and commands never enter the job console. The pinned optional `@openai/codex` package is the preferred Codex transport: LoopLab resolves its project-local JavaScript entry before Node-global and user-global package entries, and never passes provider arguments through a Windows command shim. A Codex Desktop `WindowsApps` executable that returns `EPERM` is not a runnable CLI.

LoopLab may also detect an optional **local AI copilot** on literal loopback. This is actual on-device model inference, distinct from the deterministic companion process and distinct from the selected OpenAI/Anthropic/Codex/Claude build provider. `get_local_copilot_status` passively checks `/v1/models` on the Ollama and LM Studio defaults, or on one explicitly configured loopback OpenAI-compatible origin; scanning never downloads, loads, or invokes a model. Use `start_local_copilot`, retain its durable ID, then poll `get_local_copilot_job`; use `cancel_local_copilot_job` only for that exact job. The same operations are available through browser MCP and `npm run agent -- local-copilot*`.

The local copilot is deliberately narrow: bounded stateless context, strict JSON-Schema advice, no tools or MCP integrations, no remote endpoint, no embedded images/assets/HTML, and no project mutation. It may summarize supplied context, critique a plan, identify risks, or suggest a natural-language next intent. Its response is adjacent working context for Codex or Claude—not source truth, a reviewed command, collision authority, or Doctor/replay/acceptance/browser/release evidence. A reported local token count has `$0.00` provider cost; electricity and hardware costs are not estimated. If no suitable local model is installed, LoopLab remains fully functional and the local-copilot status stays unavailable instead of falling back silently.

Default discovery checks `http://127.0.0.1:11434` (Ollama) and `http://127.0.0.1:1234` (LM Studio). To use another OpenAI-compatible local server, set `LOOPLAB_LOCAL_AI_URL` to a literal `http://127.0.0.1:<port>` or `http://[::1]:<port>` origin; remote hosts, HTTPS tunnels, URL credentials, paths, queries, and fragments are rejected. Optionally set `LOOPLAB_LOCAL_AI_ENGINE`, `LOOPLAB_LOCAL_AI_LABEL`, exact `LOOPLAB_LOCAL_AI_MODEL`, and a local-only `LOOPLAB_LOCAL_AI_TOKEN`. The token may be sent to the loopback server but is never returned in status, events, results, prompts, project data, or exports.

Codex CLI and Claude Code CLI share the versioned `looplab-provider-parity/v2` semantic contract in the agent manifest. Every game loop emits `provider.parity.locked` before the provider request and retains a `looplab-provider-parity-receipt/v1` with the shared contract digest, provider transport, source digest, frozen evaluation profile, and pass-plan ID. Both providers receive the same context and authoring authority and face the same independent acceptance gates; model wording, latency, token count, and creative output are not claimed to be identical. Companion job status and result expose the same receipt, and accepted and rejected iteration-ledger entries retain it.

The managed launcher creates `.looplab/companion-session.json` and gives the same short-lived control token to the companion, the server-rendered browser UI, and local headless clients. Every companion `POST` requires that file's `x-looplab-session-token`; GET health, status, result, and SSE observation remain read-only. Keep the ignored descriptor local, never print its token, and never include it in project JSON, research, an AI prompt, a commit, or an export. `npm run agent` reads it automatically. A direct HTTP client must read it locally and set the header itself.

Claude Code 2.1.205 or newer is required for reliable structured-headless output. LoopLab starts Claude in a nonpersistent safe-mode session with `dontAsk` permissions and no MCP servers. Prompt drafting and game iterations receive no tools. Research receives only `WebSearch` and `WebFetch`. A successful process without `structured_output`, a structured-output retry failure, or an interactive permission requirement is a failed provider pass and cannot mutate a project. Selecting `claude` requests the authenticated Claude CLI session detected by the companion; its usage receipt distinguishes a subscription from an API-key, access-token, Bedrock, or Vertex session without copying credential values. In default fallback mode the direct `anthropic` API is the same-vendor alternate transport if Claude CLI is unavailable or fails before a proposal is accepted. Strict mode runs only the requested Claude path.

Start LoopLab with `npm run dev` or `npm start`, not the web-only scripts. The managed launcher reuses a companion only when `/health` reports the exact manifest protocol. It cooperatively replaces an idle stale LoopLab companion, refuses to interrupt any active operation, and refuses to kill an unknown service occupying the port. This prevents the visible app from silently using older AI commands or validation rules.

For a provider build or loop that may run longer than a caller, submit exactly once with `POST /jobs`, retain the returned ID, and monitor `/jobs/{id}/status` or `/jobs/{id}/events` until the terminal result is available from `/jobs/{id}/result`. Never submit a duplicate while the job is `starting` or `running`. A `provider.progress` heartbeat reports `process-only` until a genuine safe JSONL event has been observed, then reports `provider-activity-observed` with the last event type and measured age. Neither heartbeat is permission to kill, time out, or restart the provider. Report only the completed measured usage receipt.

Never request, reveal, read back, log, or serialize an API key. The Connection Center may receive a key once through its password-masked field, but it clears the field as soon as Save key securely is submitted and sends the value only to the companion on `127.0.0.1`. The companion verifies the candidate with the provider before passing it to the Windows vault writer through stdin, then encrypts it for the current Windows user and returns only redacted status. A rejected candidate leaves the existing saved key unchanged. Keys must never enter project state, local storage, console entries, exports, command arguments, or process environment mutations performed by the browser.

### Provider connection preflight

Start the companion, then inspect its evidence-based provider report:

```powershell
npm run companion
npm run providers:check
```

The browser calls `GET /providers?refresh=1`. Each provider is reported as `ready`, `needs-key`, `needs-login`, `not-installed`, or `blocked`. A CLI is only ready when its executable runs, its supported local authentication-status command succeeds, and its structured-headless capability contract is current. Presence on `PATH` or authentication alone is not enough.

Codex CLI (`codex`), OpenAI API (`openai`), Claude Code CLI (`claude`), and Anthropic API (`anthropic`) are four independent availability paths. Provider scanning evaluates all four independently; a missing login, credential, executable, current version, network connection, or successful request on one path never changes another path's readiness or connection lock. Every creative job records a requested path and an actual path. Default `fallback` mode tries the requested path, the same vendor's alternate transport, the other vendor's matching transport, then the remaining ready path. `strict` mode runs only the exact requested path and is reserved for provider-specific tests, comparisons, or an explicit user lock.

Fallback is automatic but never silent. The durable job keeps `providerRoute` plus a `providerFailover` receipt containing the requested provider, actual provider, ordered attempts, sanitized failure summaries, and all usage receipts. It retries the exact same request only while the result remains an uncommitted proposal; a failed path cannot mutate the selected project. Caller timeouts do not authorize resubmission—retain and monitor the same job ID. Visual critique may switch only between CLI/API transports inside the provider family covered by that submission's explicit image consent. Prompt-directed image generation remains OpenAI-API-only until another installed path provides equivalent image output and measured provenance.

The headless `retry_prompt`, `start_ai_build`, `start_research`, and `start_visual_critique` commands accept `providerMode: "fallback" | "strict"`; omitting it uses `fallback`. The mouse UI uses fallback mode. For example, `{"op":"start_ai_build","provider":"claude","providerMode":"fallback"}` requests Claude CLI but can finish through Anthropic API, Codex CLI, or OpenAI API if earlier ready paths fail before a proposal is accepted. Read the returned job's `requestedProvider`, `provider`, `providerRoute`, and terminal `providerFailover` instead of assuming the requested path ran.

- Codex uses `codex login status`. The Connection Center can launch `codex login --device-auth`, which avoids requiring an API key for local Codex use.
- Claude uses `claude auth status`. The Connection Center can launch `claude auth login`. Its provider scan includes `looplab-claude-headless/v1` capability metadata and blocks versions older than 2.1.205 from structured runs instead of silently falling back to free-form text.

An external Claude Code session gets direct cross-project access through `npm run claude:status` and `npm run claude:setup -- "<games-root>"`. Setup registers the existing `looplab-core` and `looplab-live` stdio MCP profiles at private user scope with absolute paths and no provider credential. Status verifies exact definitions and synchronized skill bytes, then independently fetches the running editor's manifest and requires the current protocol; a connected MCP stdio process is not live-editor evidence. After setup or an upgrade, start LoopLab and run `npm run claude:smoke -- "<games-root>"`. That bounded proof fails before model launch with 0 tokens when preflight fails; otherwise it gives one nonpersistent Haiku session a strict temporary MCP config containing only synthetic-fixture `get_agent_brief` and public-query `list_agent_recipes`, with a default $0.25 CLI budget cap. Haiku is used only for this operability smoke, never selected by default for game creation. Real Claude Code creative work uses `LOOPLAB_CLAUDE_MODEL` or a task-specific research/vision override when configured, otherwise the CLI's current default; the resolved model comes from measured telemetry. The smoke never submits a user project or shared catalog.
- OpenAI API readiness means `OPENAI_API_KEY` is available to the companion from its process environment, Windows user environment, or Looplab's current-user DPAPI vault and succeeds against OpenAI's non-generation models endpoint.
- Anthropic API readiness means `ANTHROPIC_API_KEY` is available through the same server-only sources and succeeds against Anthropic's non-generation models endpoint.

Looplab cannot retrieve a newly created key from a provider website. When a direct API key is missing, the UI links to the official key page. The user copies the newly created key once, pastes it into Looplab's masked Connection Center field, and chooses Save key securely. The value travels only over loopback to the local companion, which encrypts it under `%LOCALAPPDATA%\Looplab\secrets` using Windows current-user DPAPI and immediately rescans the provider. A native password-masked Windows dialog remains available as a fallback. Standard user/process environment variables are also rediscovered on every forced scan without restarting the companion. Do not ask the user to paste a key into an AI prompt, project, console, exported build, or chat, and never automate extracting a key from a provider page.

Provider sign-in events stream from `/provider-connections/:id/events`. If a page reload or stream interruption occurs while the CLI is still authenticating, repeat `POST /providers/:provider/connect`; Looplab returns the same connection and replays its event history instead of launching a duplicate. `GET /health` lists non-secret `activeProviderConnections`, and `POST /provider-connections/:id/cancel` stops the scoped login process tree before a retry. Treat device codes and sign-in links as short-lived authentication material: show them only for the active user flow and do not persist them in the game project or exported build.

## Select the project and prompt draft

Never infer the loop target from a template-specific switch or from whichever project name appears in a prompt. Read `#looplab-project-library-state` or call `list_projects`, then explicitly call `select_project` with the desired library ID. The selected project is the sole baseline for the next one-pass generation or improvement loop. Folder and file imports become independent library entries. `load_template` also adds and selects a new entry instead of overwriting another library project.

Use `create_variation` when experimentation must not affect the base. It checkpoints and preserves the complete base entry, creates a renamed child candidate with its own library ID and iteration ID, and selects the copy. The base stays selectable. Do not simulate this by changing only `project.name`.

### Choose a complete playable foundation without hiding the alternatives

For a new game or a deliberate full-foundation replacement, inspect the program-owned foundation registry before asking a provider to invent technical scaffolding:

```js
const registry = (await api.run({ op: "list_game_foundations" })).result;
const doctor = (await api.run({ op: "get_doctor", profile: "prototype" })).doctor;
const search = (await api.run({
  op: "suggest_game_foundations",
  expectedSourceDigest: doctor.sourceDigest,
  maxCandidates: 5,
  allowReplacement: true, // only after create_variation
})).result;

if (search.automaticWinner !== null) throw new Error("Foundation search cannot choose the creative direction");
for (const candidate of search.candidates) {
  console.log(candidate.id, candidate.fit, candidate.preparedReadiness, candidate.preparedDoctor, candidate.preparedGapLedger);
}

const selected = search.candidates.find((candidate) => candidate.materializable);
const materialization = (await api.run(selected.materializationRequest)).result;
const preview = (await api.run(materialization.previewCommand)).result;
if (!preview.applicable) throw new Error("Prepared foundation preview failed its exact gates");
// Play and inspect the projected game, then send preview.applyCommand unchanged.
```

`list_game_foundations` derives reference maturity from the real platformer, top-down, systems/choice, connected kinetic, and exact dimetric 2.5D sources. A proven reference must have valid source, a blocker-free prototype Doctor, required authored roles, a state-changing loop, passing executable acceptance, deterministic replay, and completion proof. `suggest_game_foundations` re-evaluates the prepared candidate after carrying forward only the selected project's intended portable metadata. Read `preparedProofComplete`, `preparedDoctor`, and `preparedGapLedger` rather than assuming reference proof survives adaptation. Art, narrative, visual polish, balance, originality, and fun remain explicit gaps or judgments.

Search is deterministic, provider-free, read-only, and returns unlike brief-matched alternatives with `automaticWinner: null`. The loaded project is protected unless the agent first creates or selects an independent variation and explicitly passes `allowReplacement: true`. Unproven starters remain blocked unless `allowUnproven: true` is deliberately supplied after reviewing their exact ledger; that flag permits preview, not a proof claim. `materialize_game_foundation` is source- and candidate-digest-bound and returns one ordinary non-mutating `preview_batch` containing `replace_project`. Never skip exact preview/apply or silently rerecord acceptance/replay to make replacement pass. CLI equivalents are `npm run agent -- foundations <project.loop.json>`, `foundation-suggest`, and `foundation-materialize`.

The initial directed brief is deterministic **prepared provider input**, not AI output. Inspect it with `get_prompt_draft`. The visible **Retry prompt** button and the headless `retry_prompt` command both call `POST /prompt-drafts` on the loopback companion and require the selected authenticated OpenAI, Anthropic, Codex, or Claude provider. A successful response must preserve the user's exact description and every directed or arbitrary headless constraint, be materially different from the prior prompt, and record provider/model provenance. Empty, unchanged, or constraint-dropping results are rejected. If no provider is ready, report failure and leave the current prompt/project intact; never substitute a local template while claiming AI generation. Submit the exact current `designBrief.composedPrompt` to generation.

The visual Director is a convenience surface, not a capability boundary. Use `get_director_state`, `configure_director`, `retry_prompt`, `start_ai_build`, and `start_research` for browser automation. Headless clients may pass constraints and context that have no matching dropdown, or call the companion's `/prompt-drafts`, `/jobs`, and `/research-jobs` endpoints directly. Creative operations named Generate, Refine, Retry, Research, or Loop must cross a ready provider boundary; local deterministic code may compose inputs and validate outputs but may not be presented as AI work.

### Fuse context; do not let LoopLab certify itself

Use LoopLab as one live working-memory source beside the repository and authoring files, tests and replay fixtures, research Markdown, installed skill guidance, provider/usage receipts, iteration history, and the behavior observed in the real browser. Start a pass with `get_agent_brief`; read both current-authoring and production-release readiness, then request `get_director_state`, a full profile-specific `get_doctor`, `get_pending_requests`, `get_manifest`, or the full `get_project` only as needed. Do not treat those views as the only truth or turn a score into promotion eligibility. Reconcile their source digest and claims with the actual source, runtime, and browser evidence. If they disagree, report the drift and trust executable source and observed behavior over a self-authored metadata claim.

### Measure builder improvements with visible golden briefs

Use `list_builder_benchmarks` when a LoopLab change needs a reproducible cross-version check. The suite contains visible, digest-bound tasks for platformer, top-down, connected-world, and systems games; it is not a platformer-only score. Load a task's ordinary prompt and constraints through `configure_director`, generate through the same durable provider job used by normal projects, and call `evaluate_builder_benchmark` on the exact resulting project. The evaluator is provider-free and returns a source-bound `looplab-builder-benchmark-run/v1` receipt with every individual check, blocker, Doctor result, replay/acceptance observation, join/program observation, and exact standalone audit.

Use `compare_builder_benchmark_runs` only when task revision, provider, model, scaffold, strategy, and context budget match. A provider-free comparison is one deterministic before/after observation. A provider-backed comparison requires complete independent trial sets; never omit failures or duplicate trial indexes, and use at least three trials for even a provisional stochastic claim. Efficiency is withheld unless every run on both sides passes the same technical gate. Preserve the receipt JSON and comparison digest. The benchmark deliberately cannot certify fun, originality, visual composition, or art direction—finish with real browser playtest, screenshots, and appropriate human judgment.

```js
const suite = await api.run({ op: "list_builder_benchmarks" });
const task = suite.result.tasks.find((entry) => entry.id === "two-map-round-trip-journey");
await api.run({ op: "configure_director", userPrompt: task.prompt, campaignScope: task.campaignScope, loop: { enabled: false, conditions: task.ordinaryDirectorConstraints } });
// Run the ordinary Director/provider job, then deterministically grade the selected result.
const receipt = await api.run({ op: "evaluate_builder_benchmark", benchmarkId: task.id });
const comparison = await api.run({ op: "compare_builder_benchmark_runs", baselineRuns: [priorReceipt], candidateRuns: [receipt.result] });
```

### Resume from bounded semantic changes

Conversation context and live DOM notifications are not durable project memory. Store the opaque `currentCursor` returned by `get_agent_changes` outside transient console text. On a later run, send that cursor and follow `nextCursor` until `hasMore` is false:

```js
let changes = (await api.run({ op: "get_agent_changes", cursor: lastOpaqueCursor, limit: 32, compact: true })).result;
if (changes.resyncRequired) {
  const brief = await api.run({ op: "get_agent_brief", compact: true });
  const campaign = await api.run({ op: "get_project_context", view: "campaign", compact: true });
  // Discard stale assumptions and re-orient from these current source-bound reads.
}
while (changes.hasMore) {
  changes = (await api.run({ op: "get_agent_changes", cursor: changes.nextCursor, limit: 32, compact: true })).result;
}
lastOpaqueCursor = changes.currentCursor;
```

Omit `cursor` once on first contact to establish the present bookmark. A retained cursor returns only later changes; the current cursor returns none; an expired or foreign cursor returns `resyncRequired` and explicit `get_agent_brief` / campaign-context recovery commands. Never parse or invent a cursor.

The journal keeps at most 128 successful semantic mutations and coalesces an atomic batch or macro into one event. It names operation, category, channel, stable target IDs, and before/after source and work-ledger digests. It never stores raw commands, prompts, provider output, reasoning, credentials, embedded assets, snapshots, JSON patches, or HTML. The visible `#looplab-agent-change-feed` panel exposes the same workflow, and `looplab:agent-change-recorded` is only an advisory wake-up event. Feed entries are orientation—not project source, mutation input, verification evidence, or authority. Confirm current state through canonical reads and gates before editing.

Outside the browser use `npm run agent -- changes game.loop.json [--cursor=opaque-bookmark] [--limit=32]`. The source-controlled `resume-agent-session` playbook recipe carries the same stop conditions for Codex and Claude.

### Author executable gameplay systems

Use `get_gameplay_program` and `set_gameplay_program` for nontrivial mechanics. A gameplay program contains typed variables and deterministic rules triggered by declared input actions, runtime events, authored overlaps, or state predicates. Input rules support `phase: "pressed" | "held" | "released"` (default `pressed`); overlap rules support `edge: "enter" | "stay" | "exit"` (default `enter`). Use these shared runtime phases instead of project-specific latch variables. Effects may update variables, reveal or disable authored objects and paths, emit semantic events, transition maps, respawn, apply an impulse, collect an authored object, open or close a choice page, advance a named clock, evaluate a bounded integer formula, or finish the run. The editor preview, deterministic replay runner, and exported one-file HTML execute the same program; `get_state` and `get_gameplay_state` expose its variables, completed rule IDs, active actions, overlap contacts, modal decision state, clocks, and bound HUD headlessly. Project Doctor rejects unresolved references, unsafe direct event loops, unsafe formulas, empty required programs, and feature-contract prose presented as implementation.

#### Build systems games without choosing a movement genre

Choice/dialogue pages, clocks, integer formulas, and HUD bindings are genre-neutral. They can drive a trader, management game, narrative game, tactics encounter, RPG, deck/turn-based game, top-down world, platformer, or dimetric 2.5D project. They do not require a player object; a fixed simulation tick still processes declared input, rules, decisions, and state.

Use the built-in `systems` template (`load_template` with `template: "systems"`, or `npm run agent -- init <file.loop.json> systems`) when movement is not the game's organizing assumption. **Lantern Market Ledger** is a playerless reference: its economy, decision pages, day clock, formula effects, accessible HUD, acceptance checks, replay v4 fixture, preview, and one-file export all share the same authored state.

- `choicePages[]` owns player-facing `title`, `body`, and choices. Text may interpolate a declared variable as `{credits}`. Every choice references a declared semantic `actionId`; this keeps mouse buttons, keyboard/gamepad, replay, acceptance tests, and AI control on the same decision path.
- `visibleWhen` and `enabledWhen` use the normal bounded variable predicates. Modal pages freeze movement and clear held gameplay input. `nextPageId` chains pages; `close` returns to the underlying game.
- `clocks[]` names a deterministic counter such as a turn, round, day, phase, or wave. `advance-clock` is the only special behavior; narrative meaning remains in the project.
- `set-variable-expression` accepts a JSON expression tree, never JavaScript text. Leaves are safe integers or `{ "variableId": "credits" }`. Operators are `add`, `subtract`, `multiply`, `divide`, `modulo`, `min`, `max`, `clamp`, `abs`, and `negate`, with at most 64 nodes and depth 12. Division/modulo by zero deterministically yields zero and emits `gameplay.expression-fault`.
- `hudBindings[]` resolves text into `primary`, `secondary`, or `ticker` DOM regions with optional predicates and accessible labels.

In an exported game, inspect and drive these surfaces with `get_choice_state`, `get_hud_state`, and `choose_choice`, or the equivalent `window.looplabRuntime` methods. `choose_choice` queues the same authored choice selected by its semantic action; call `step` when driving a paused/headless artifact. New replay recordings use hash projection v4, while v1–v3 remain byte-for-byte compatible.

Author or replace semantic controls atomically with `set_project` and `changes.inputActions` before gameplay rules or verb architecture reference new action IDs. Each action requires a stable unique `id`, readable `label`, at least one concrete keyboard binding, and should declare `animationState`, `onboarding: true`, and `replayEvent: true`. This field is deliberately validated rather than treated as arbitrary metadata; an invalid action replacement rejects the whole command and preserves the prior project.

Every declared action must also be executable. Project Doctor's `inputActionLiveness` report classifies each action against real consumers: player control, an enabled gameplay input rule, or a choice. Animation labels, onboarding copy, replay flags, verb-architecture references, and disabled rules document intent but do not make an action live. A dead action is a prototype warning and a production error with the exact `actionId` and repair target. After export, call `window.looplabRuntime.getInputActionLiveness()` or the DOM bridge command `{"op":"get_input_action_liveness"}`. The browser harness verifies that the report matches the artifact source digest, then presses and releases **every** declared semantic action and records any observable player, variable, rule, choice, map, event, or terminal effect. State-gated actions may have no effect from the initial reset, but they must still route cleanly and have a statically executable consumer.

Bind verb-architecture `implementationIds` to actual input actions, gameplay rule IDs, authored objects, traversal paths, or maps. Feature contracts explain ownership and evidence but do not count as runtime implementation by themselves. Record replay fixtures that exercise each promised state change so a visually plausible but inert mechanic cannot pass.

### Design an executable verb system, not a mechanic quota

A phrase such as “two connected verbs” or “three verbs that combine in the finale” is an ideation seed, not evidence of depth. Author new work with `verbArchitecture.version: 2`:

1. Start from recurring player decisions and desired runtime dynamics. There is no required count: one deep verb is valid, while every additional verb must earn its input, attention, onboarding, implementation, and feedback cost.
2. Give every active verb a distinct purpose, role, activation mode, standalone/dependency truth, semantic input action, authored affordances, observable state changes, readable feedback IDs, runtime implementation IDs, and executable test IDs.
3. Connect only intentional relationships. Name whether each is a sequence, simultaneous action, modifier, state gate, resource loop, counterplay, or substitution; record the new consequence and whether it is recurring, situational, or mastery-only.
4. Author playable applications, not a finale checklist. Standalone verbs need an independent use. Recurring relationships need at least one teaching/practice/combine application and one pressure/mastery/recovery/expression application, with readable setup, success, failure, and recovery.
5. Model the repeatable core loop as stable observe/decide/act/resolve/feedback/recover/progress steps. Project Doctor requires at least decide, act, and feedback coverage.
6. Model important resources with a real runtime state ID, source verbs, sink verbs, pressure, recovery, implementation IDs, and executable proof.
7. Bind relationships, applications, loop steps, resource flows, and progression beats to the current authored source. A score matrix, prose test, named mechanic, or final encounter is never implementation evidence.

Inspect with `{ "op": "get_verb_architecture" }` and author with `{ "op": "set_verb_architecture", "architecture": { ... } }`. The report includes the interaction graph plus independent-use, relationship-reuse, feedback, recovery, runtime, and test coverage. Project Doctor gives specific production findings for finale-only relationships, missing standalone uses, incomplete feedback/recovery, broken core loops, resource-flow gaps, unresolved evidence, progression cycles, and false `verified` status. Existing version 1 projects remain readable and keep their original pair-matrix checks; materially revised systems should move to version 2.

This model follows three useful design observations: mechanics matter through the runtime dynamics and player experience they create; an interaction closes a decision → action → simulation → feedback → updated-player-model loop; and learned actions need repeated linked applications or they burn out. Resource mechanics additionally need explicit state influence, sources, sinks, and feedback rather than names alone.

Neutral templates may retain useful projection, collision, support, and depth examples, but not a prior game's semantics. When `templateProvenance.adaptationStatus` is `starter`, rename or repurpose its sample player, markers, goal, paths, and structures for the current brief, implement the resulting behavior, then set the status to `adapted`. Project Doctor reports both an unadapted status and unchanged neutral semantic labels. Never let convenient starter geometry silently choose the new game's genre.

Keep five prompt categories separate:

1. **User vision** — preserve the user's words and intended experience.
2. **Objective quality targets** — clarity, responsiveness, route flow, collision agreement, visual legibility, performance, replay, and packaging outcomes.
3. **Technical invariants** — authored collision, single-file offline output, source-bound evidence, and other implementation truths.
4. **Evidence requirements** — the Doctor, replay, runtime, and browser receipts that prove the outcome.
5. **Explicit style locks** — only visual rules the user deliberately freezes.

Quality targets do not silently choose a palette, setting, rendering style, material language, camera format, or character design. `artDirectionMode: "explore"` is the default. Use `"preserve"` when an existing project's visual identity should remain recognizable. Use `"locked"` only with non-empty, user-authored `styleLocks`; otherwise LoopLab falls back to exploration.

```js
await api.run({
  op: "configure_director",
  userPrompt: "Build a readable rollerblading route with expressive movement",
  loop: {
    artDirectionMode: "explore",
    styleLocks: [],
    conditions: [
      "Visible geometry and authored collision agree",
      "Every interaction has setup, landing, recovery, and a next decision"
    ]
  }
});
```

## Measure and search gameplay tuning without guessing

Use LoopLab's bounded tuning workflow when the open question is a numeric gameplay-feel tradeoff rather than a deterministic repair. The same implementation drives Fine Tune, the browser bridge, MCP, CLI, Codex, and Claude.

```js
const feel = (await api.run({ op: "get_feel_report" })).result;
console.log(feel.metrics, feel.limitations);

const prepared = (await api.run({
  op: "suggest_tuning_contract",
  maxCandidates: 12,
})).result;

// Review and edit prepared.contract. The suggestion preserves a nearby
// measured band; it is not a genre optimum or an AI judgment of fun.
const before = (await api.run({ op: "get_doctor", profile: "prototype" })).doctor;
await api.run({
  op: "set_tuning_contract",
  contract: prepared.contract,
  expectedSourceDigest: before.sourceDigest,
});

const current = (await api.run({ op: "get_doctor", profile: "prototype" })).doctor;
const search = (await api.run({
  op: "run_tuning_search",
  expectedSourceDigest: current.sourceDigest,
})).result;

if (search.automaticWinner !== null) throw new Error("Tuning search must not choose a creative winner");
for (const candidate of search.candidates) {
  console.log(candidate.id, candidate.assignments, candidate.safe, candidate.pareto, candidate.failedGateIds);
}
```

A versioned `looplab-tuning-contract/v1` contains one to five allowlisted numeric parameters, measured objectives, optional hard constraints, and a candidate budget from 2 through 24. Supported targets are documented `movementTuning.*` fields, project gravity, and declared numeric `gameplayVariable.<stable-id>.initial` values. Arbitrary object paths, JavaScript expressions, generated-art geometry, and renderer-owned state are rejected. The search includes the current baseline and uses an exhaustive grid when it fits the budget or deterministic stratified coverage when it does not.

Every candidate is evaluated against schema validation plus both prototype and production Doctor profiles. Acceptance, replay, completion, semantic-input liveness, and runtime joins remain hard no-regression gates. Failed candidates stay visible for diagnosis and receive no apply path. Search itself is source-bound, read-only, deterministic, and provider-free; its receipt must report zero tokens and `$0.00`.

`safe` and `pareto` mean only that a candidate passed the declared technical constraints and is not numerically dominated within this bounded sample. They do not establish fun, accessibility, originality, visual quality, genre correctness, or player preference. Keep `automaticWinner: null`. Preview and play more than one plausible tradeoff, use the user's stated vision and recorded human preference when choosing, and say evidence is insufficient when it is.

For a changed safe candidate:

1. Ensure the selected project is a protected variation created with `create_variation`; never apply tuning experiments to the base entry.
2. Run the candidate's exact returned `previewCommand`. This is the ordinary `preview_batch` gate and does not mutate.
3. Review current and production Doctor deltas, then play the relevant verbs in the browser harness.
4. Apply only the preview receipt's exact `applyCommand` while both source and preview digests still match.
5. Run Doctor, replay, acceptance, joins, and browser QA again. Never rerecord fixtures automatically to hide a behavioral change.

File CLI equivalents are `feel`, `tuning`, `tuning-suggest`, `tuning-set`, and `tuning-search`. Example:

```powershell
npm run agent -- feel game.loop.json
npm run agent -- tuning-suggest game.loop.json --max-candidates=12
Get-Content -Raw tuning-contract.json | npm run agent -- tuning-set game.loop.json
npm run agent -- doctor game.loop.json prototype
npm run agent -- tuning-search game.loop.json --source-digest=source-...
```

## Author sound and motion from gameplay events

Use the presentation program when a game is technically correct but lacks readable response, audio identity, or motion feedback. Do not add sound, particles, shake, flash, or squash directly to simulation code. Author one renderer-neutral, bounded `presentationProgram`; the editor preview, Canvas export, pinned Phaser canvas hook, headless runtime, and Project Doctor all consume the same source.

```js
const suggestion = (await api.run({
  op: "suggest_presentation_program",
  status: "draft",
})).result;

// Provider-free and genre-aware: review every event and aesthetic choice.
console.log(suggestion.report.metrics, suggestion.decisionBoundary);

const before = (await api.run({ op: "get_doctor", profile: "prototype" })).doctor;
await api.run({
  op: "set_presentation_program",
  program: suggestion.program,
  expectedSourceDigest: before.sourceDigest,
});

const authored = await api.run({ op: "get_presentation_program" });
const doctorReport = await api.run({ op: "get_presentation_report" });
console.log(authored.result.program, doctorReport.result);
```

The authored contract supports at most 32 audio cues, 32 motion cues, six effects per motion cue, 24 live voices, 320 live particles, and two seconds per cue. Unknown fields, unstable or duplicate IDs, unsupported effect kinds, and invalid limits fail closed. Suggestions use project evidence: platformer jump/land cues are never inferred merely because a top-down or systems game has a player.

Follow these boundaries:

1. Map stable runtime or authored `emit` event IDs; never derive collision from art or let presentation mutate gameplay.
2. Keep `reducedMotion: "respect"` unless the user explicitly requests a different accessible policy. Reduced motion skips particles, shake, and squash while retaining a static flash/status equivalent.
3. Accept input before attempting audio unlock. The runtime creates one `AudioContext` lazily after a real gesture, bounds voices and pending events, and contains unavailable/rejected audio without aborting play.
4. Treat `approved` as an authoring lifecycle state, not proof that the mix, rhythm, intensity, or feel is good. Preview and playtest it.
5. Run Doctor, deterministic replay, acceptance, completion, semantic-input liveness, and the hostile browser harness after changes. Presentation must leave the deterministic state and replay hashes unchanged.
6. Preserve the one-file boundary: procedural cues and the controller are embedded in the exported HTML and make no network request.

In an exported game, use `getPresentationProgram()`, `getPresentationReport()`, `getPresentationStatus()`, and `setAudioMuted(boolean)`. The DOM bridge equivalents are `get_presentation_program`, `get_presentation_report`, `get_presentation_status`, and `set_audio_muted`. The hostile browser harness deliberately rejects a suspended audio resume and passes only when the presentation controller contains that failure while semantic input remains operational.

To remove authored presentation deliberately:

```js
const current = (await api.run({ op: "get_doctor" })).doctor;
await api.run({
  op: "remove_presentation_program",
  expectedSourceDigest: current.sourceDigest,
});
```

## Search valid game structures before spending provider tokens

Use structural scaffold search when the open question is the dependency shape of a game system—not its prose, art, collision, map geometry, or renderer. LoopLab can generate and prove bounded quest networks, economy loops, and encounter progression through the same executable gameplay-program primitives used by exported games.

```js
const suggestion = (await api.run({
  op: "suggest_structural_scaffold_contract",
  families: ["quest-network", "economy-loop", "encounter-progression"],
  maxCandidates: 6,
})).result;
const currentDoctor = (await api.run({ op: "get_doctor" })).doctor;

// Review the hard constraints. Existing gameplay programs remain protected
// unless replace-explicit is deliberately authored on a project variation.
await api.run({
  op: "set_structural_scaffold_contract",
  contract: suggestion.contract,
  expectedSourceDigest: currentDoctor.sourceDigest,
});

const doctor = (await api.run({ op: "get_doctor" })).doctor;
const search = (await api.run({
  op: "run_structural_scaffold_search",
  expectedSourceDigest: doctor.sourceDigest,
})).result;

if (search.automaticWinner !== null) throw new Error("Structural search must not choose for the agent");
for (const candidate of search.candidates) {
  console.log(candidate.id, candidate.descriptors, candidate.safe, candidate.failedGateIds);
}

const selected = search.candidates.find((candidate) => candidate.materializable);
const slotValues = Object.fromEntries(selected.contentSlots.map((slot) => [slot.id, authorContent(slot)]));
const materialization = (await api.run({
  op: "materialize_structural_scaffold",
  candidateId: selected.id,
  expectedCandidateDigest: selected.candidateDigest,
  expectedSourceDigest: doctor.sourceDigest,
  slotValues,
})).result;

// This still does not mutate. Run materialization.previewCommand, review its
// Doctor deltas, then explicitly apply the preview receipt on unchanged source.
const preview = await api.run(materialization.previewCommand);
```

The search is deterministic and provider-free. Every candidate first satisfies the authored depth, branching, cycle, and choice-count bounds, then passes independent graph reachability, terminal, semantic-reference, gameplay-program, schema, input-liveness, acceptance, replay, map-join, and both-profile Doctor checks. Candidates are archived by branchiness, cyclicity, decision depth, and state breadth so unlike structures survive instead of being reduced to one misleading score.

Structure and expression remain separate. A candidate carries stable executable IDs plus required title, body, and choice-label slots. Materialization fails if any slot is missing, unknown, empty, or oversized; it re-creates the exact candidate from its source and contract digests and returns only ordinary `set_project` and `set_gameplay_program` operations inside `preview_batch`. It never edits art, collision, maps, engine choice, acceptance fixtures, or replay evidence, and it never claims that a technically feasible structure is fun, balanced, narratively good, visually coherent, or spatially playable.

File CLI equivalents are `scaffold`, `scaffold-suggest`, `scaffold-set`, `scaffold-search`, and `scaffold-materialize`.

## Search projection-correct map layouts before provider art

Use spatial layout search when the unresolved question is the authored shape of one side-view, top-down, or dimetric 2.5D map. This occurs before provider art: generated pixels may illustrate the selected structure, but they never define collision, support, navigation, traversal, depth, or evidence.

```js
// Protect the base before authorizing any geometry replacement.
await api.run({ op: "create_variation", name: "Spatial exploration" });

const suggested = (await api.run({
  op: "suggest_spatial_layout_contract",
  mapId: "map-main",
  maxCandidates: 6,
  allowReplacement: true,
})).result;

// Review the exact map/family, mandatory pins, clearance, route beats,
// branches, elevation layers, density, and replace-explicit policy.
const before = (await api.run({ op: "get_doctor", profile: "prototype" })).doctor;
await api.run({
  op: "set_spatial_layout_contract",
  contract: suggested.contract,
  expectedSourceDigest: before.sourceDigest,
});

const current = (await api.run({ op: "get_doctor", profile: "prototype" })).doctor;
const search = (await api.run({
  op: "run_spatial_layout_search",
  expectedSourceDigest: current.sourceDigest,
})).result;

if (search.automaticWinner !== null) throw new Error("Spatial search must not choose for the agent");
for (const candidate of search.candidates) {
  console.log(candidate.id, candidate.descriptors, candidate.safe, candidate.failedGateIds);
}

const selected = search.candidates.find((candidate) => candidate.safe && candidate.materializable);
const materialization = (await api.run({
  op: "materialize_spatial_layout",
  candidateId: selected.id,
  expectedCandidateDigest: selected.candidateDigest,
  expectedSourceDigest: current.sourceDigest,
})).result;

// Still read-only: inspect the one update_map projection and run its ordinary
// clone preview. Play and compare viable candidates before exact apply.
const preview = await api.run(materialization.previewCommand);
```

The contract is map-scoped and accepts only the projection-compatible family: `sideview-route`, `topdown-route`, or `dimetric-layered-route`. Its bounded axes are topology, route beats, branches, elevation layers, and density. Player, spawn, goal, portal, locked, and explicitly `spatialLayoutPinned` objects are mandatory byte-for-byte pins. Existing map geometry stays protected unless `replace-explicit` was deliberately authored on a protected variation.

Every candidate clone passes strict project validation, prototype and production Project Doctor, acceptance, replay, semantic-input liveness, and runtime-join non-regression gates. A platformer with accepted geometry-sensitive evidence should reject changed layouts instead of silently rerecording fixtures. A safe candidate is only technically feasible within the declared constraints; it does not prove pacing, route readability, composition, originality, fun, or art quality. Keep `automaticWinner: null`, inspect more than one candidate visually, play them, and make an explicit source-bound choice.

`materialize_spatial_layout` re-creates the candidate from the exact source and candidate digests and returns one ordinary `update_map` inside `preview_batch`. Search and materialization use zero provider tokens and never mutate the project. Apply only the exact preview receipt while the source remains current, then rerun Doctor, acceptance, replay, joins, and browser QA.

File CLI equivalents are `layout`, `layout-suggest`, `layout-set`, `layout-remove`, `layout-search`, and `layout-materialize`.

## Claim a prompt

```js
const { requests } = await api.run({ op: "get_pending_requests" });
const request = requests[0];
if (!request) throw new Error("No pending Looplab request");
```

A request includes:

- `prompt`: the user's creative goal;
- `track`: `creation` for Full game creation, or gameplay, maps/collision, character, assets, input/mobile, UI/devices, audio, or release for a focused pass;
- `provider`: requested connection;
- `route`: ordered Game Studio capability owners;
- `reuseGuide`: pinned renderer-independent architecture, movement templates, routed optional-system rules, and one-file exclusions;
- `boundaries`: simulation/render/UI/asset/test responsibilities;
- `loop`: strategy, condition list, iteration cap, stop score, and frozen evaluation profile.

### Start from a real game-shaped scaffold

Prefer the Playable foundation workflow above so the current brief can compare complete platformer, top-down, systems/choice, connected kinetic, and dimetric 2.5D shapes. When a skating, rollerblading, parkour, momentum, or traverse-chain brief specifically selects the connected kinetic family, the matching direct template command remains:

```js
const { project } = await api.run({ op: "load_template", template: "kinetic" });
```

It provides two connected 1280×720 maps, exact portal-to-spawn continuity, authored grind paths separated from rail artwork, an embedded palette-locked PNG character atlas, code-authored environment art, ground anchors, deterministic movement tuning, stable feature contracts, and acceptance-test IDs. It is provider input—not evidence that an AI already improved the project. Keep the user’s loaded project when it already contains authored maps, assets, or feature contracts; never silently replace completed work with this scaffold.

## Mandatory preflight

```js
const project = (await api.run({ op: "get_project" })).project;
const doctor = (await api.run({ op: "get_doctor", profile: project.doctorProfile })).doctor;
const route = (await api.run({ op: "route_work", prompt: request.prompt, track: request.track, framework: "auto" })).route;
const expectedSourceDigest = doctor.sourceDigest;
```

Read `doctor.nextActions`. Each item tells you the owning subsystem, concrete action, affected IDs, and required evidence. The Doctor digest is the baseline for regression comparison.

### Specialist build roster

`route_work` returns both a technical capability route and an `agentPlan`. The plan is intentionally honest: `agentExecution.providerInvocationsPerIteration` is `1` and `independentAgentProcesses` is `false`. The selected OpenAI, Anthropic, Codex, or Claude connection coordinates the provider-owned roles in one structured response. The response includes a concise coverage receipt for each required role; it does not include hidden reasoning.

Project Doctor Critic uses the deterministic Project Doctor implementation, and Playtest QA uses the real browser/Playwright evidence path. Neither may be marked covered by provider prose. Console events distinguish `specialist.roster.planned`, provider-owned `specialist.covered`, Project Doctor output, and browser evidence. If a provider omits coverage, the console reports `specialist.coverage.missing` instead of inventing activity.

### Select the 2D runtime from one shared policy

`route_work` also returns `looplab-game-studio-plan/v1` with a `looplab-runtime-selection-policy/v1` receipt. This is native LoopLab behavior; Codex and Claude do not need to load or request an external Game Studio skill while operating the program.

Use `framework: "auto"` for a new game unless the user chose a renderer. The receipt includes program-owned knowledge for Canvas, Phaser, PixiJS, and melonJS—`chooseWhen`, strengths, costs, patterns to absorb natively, composition policy, and evidence policy—so an agent does not need to request an external skill to make the decision. Auto considers concrete quality-fit evidence:

- Phaser gains weight from tilemaps, multiple scenes or maps, camera tooling, sprite/atlas animation, and Arcade Physics-style movement or overlap needs.
- PixiJS is the conceptual renderer-first fit for very large sprite counts, particles, filters, render groups, and WebGL batching. LoopLab absorbs its ticker, texture-lifecycle, culling, batching, and decoded-memory lessons even when Canvas or Phaser ships the game.
- melonJS is the conceptual integrated-engine fit for Tiled/TMX authoring, orthogonal tile layers, level loading, pooling, and stage lifecycle. LoopLab absorbs its Tiled-validation, pool-lifecycle, sparse-layer, and debug-overlay lessons without allowing visual map data to replace authored collision.
- Canvas gains weight from lean custom rendering, tight encoded-byte budgets, systems-first games, and custom dimetric x/y/z depth work that does not otherwise benefit from Phaser.
- Single-file delivery is neutral. Phaser remains eligible and uses LoopLab's pinned Phaser 3.90.0 browser script, embedded in the artifact and authenticated by exact SHA-256—never an ES-module path, CDN, or runtime fetch.
- Existing projects are sticky during improvement work. When another runtime looks better, the receipt sets `migrationRequiresOptIn: true`; do not silently replace the engine. An explicit `framework: "phaser"` or other supported choice overrides Auto.

Read `runtimeSelection.selectedFramework`, `recommendedFramework`, `bestFitFramework`, `selectionSource`, `confidence`, `signals`, `reasons`, `singleFile.delivery`, `adapterAvailability`, `requestedUnavailableFramework`, and `migrationRequiresOptIn`. Canvas and Phaser are release-ready. PixiJS and melonJS currently expose absorbed knowledge with `knowledge-integrated-adapter-pending`; requesting one preserves a ready adapter and returns an explicit fallback instead of pretending the engine was embedded. Use `set_runtime_profile` for an actual Canvas/Phaser change so runtime and release metadata change atomically.

The same compact receipt is supplied to OpenAI, Anthropic, Codex CLI, and Claude CLI inside `capabilityRoute`. Do not run a provider-specific engine heuristic or a second model call. Compose capabilities, not competing engines: one primary frame/render owner is allowed, while semantic input enters LoopLab's deterministic simulation, snapshots leave it for rendering, DOM owns text-heavy HUD/menu surfaces, authored map geometry owns collision, and Playwright verifies the exact generated artifact. A Phaser export exposes `getRuntimeAdapterInfo()` and `get_runtime_adapter`, including the selected framework, frame owner, embedded version, declared SHA-256, and actually loaded Phaser version.

`route_work.context.narrative` is a separate `looplab-narrative-routing/v1` receipt. In Auto mode it scores authored story, character/dialogue, quest/lore, environmental-storytelling, branching-choice, narrative-genre, and opening/ending-payoff signals. It also activates for the `narrative` workstream. `narrativeMode: "include"` forces narrative work and `"exclude"` keeps the pass mechanics-first. When `included` is true, the existing single provider invocation gains two ordered stages: the **Narrative Designer** owns causality, continuity, choices, stable state bindings, and ending payoff; the **Narrator & Dialogue Writer** owns narrator voice, dialogue, barks, tutorial copy, line continuity, and readable text equivalents. Both must return specialist receipts, but no second provider call or runtime state store is implied.

Use `set_narrative_contract` to author `looplab-narrative-contract/v1` over the existing deterministic `gameplayProgram`; use `get_narrative_contract` or `get_narrative_report` to inspect it. Required beats and endings must reference stable choice-page, choice, rule, event, variable, map, object, or feature IDs plus acceptance/replay IDs. Every declared proof reference must pass; one passing witness never hides a failed, stale, specified-only, or unknown sibling. Project Doctor derives `looplab-narrative-report/v1` with bounded structural reachability, shortest ending paths, unreachable beats/pages, blocking terminals, trap cycles, reference validity, readable-delivery checks, and current evidence status. The exported one-file runtime exposes `getNarrativeContract`, `getNarrativeReport`, and matching DOM commands. The report does not claim prose quality, emotional impact, pacing taste, or fun.

### Reuse-guide architecture contract

Looplab incorporates `HTML_2D_GAME_MAKER_REUSE_GUIDE.md` as manifest source `card-wind-runner-reuse-guide`, SHA-256 `9662eb78f40a6c6e74931485a5a9ff54a26345ae833ac4d2f2fefaa9fa560083`. Use its modular lessons, not its project scene or runner-specific content.

- Project schema `1.0.0` owns stable, serializable authored state. Renderer objects never enter save or simulation state.
- The preview and exported runtime step simulation at 60 Hz with a five-step catch-up cap. `get_preview_state.performance` and `window.looplabRuntime.getPerformance()` report p95 frame time, fixed steps, dropped catch-up events, and long frames.
- The directed brief includes `movementTemplate`: `kinetic-runner`, `traditional-platformer`, `top-down-action-rpg`, `twin-stick-shooter`, `tactics-grid`, `deck-combat-encounter`, or `exploration-narrative`. Templates compose systems; they are not maker-core inheritance.
- `route_work.reuseGuide.routedCapabilityContracts` contains the relevant high-speed collision, rail/path, camera, animation, continuous-world, effects, and profiler rules. Routing means available, not already implemented.
- Service workers, Cache API dependencies, runtime fetches, external sidecars, and multi-file PWA output are forbidden in the upload artifact. An optional sidecar becomes selected embedded project data or is omitted.

## Build an atomic candidate

Use commands instead of UI clicks. Common commands:

- `set_project` with `{ changes: { ...allowedProjectFields } }` for partial project updates
- `load_template` with `template: "kinetic"` for the polished connected-map starter, or `template: "dimetric"` for the explicit ground/deck/underpass 2.5D proof (`blank`, `platformer`, and `topdown` remain available)
- `replace_project` with `{ project }` for an intentional full-project replacement
- `add_object`, `update_object`, `remove_object`, `duplicate_object`, `reorder_object`
- `add_traversal_path`, `update_traversal_path`, `remove_traversal_path` for authored rail, grind, zipline, and route geometry
- `suggest_motion_body`, `set_motion_body`, and `remove_motion_body` for deterministic moving platforms, hazards, doors, carriers, and other authored objects
- `get_motion_body_report` for source-bound geometry, driver, collision, replay, and acceptance diagnostics
- `get_actor_program`, `get_actor_report`, `suggest_actor_program`, `set_actor_program`, and `remove_actor_program` for deterministic NPC, enemy, companion, guard, and cutscene behavior
- `set_map_projection` for orthographic or exact 128×64 dimetric authoring
- `add_navigation_layer`, `update_navigation_layer`, `remove_navigation_layer`
- `add_navigation_node`, `update_navigation_node`, `remove_navigation_node`
- `connect_navigation_nodes`, `update_navigation_link`, `remove_navigation_link`
- `add_navigation_area`, `update_navigation_area`, `remove_navigation_area`
- `test_navigation_route`, `import_path_editor_navigation`, `export_path_editor_navigation`
- `get_authored_route_document`, `set_authored_route_document`, `update_authored_route_actor`, `update_authored_route_step`, `update_authored_route_meeting`, `verify_authored_route_document`, `export_authored_route_document`
- `add_map`, `add_dimetric_map`, `update_map`, `switch_map`, `remove_map`
- `set_start_map`, `reorder_map`, `connect_maps` for the player-facing map sequence
- `import_html` for Looplab exports containing `#looplab-project-data`
- `inspect_supports`, `attach_to_support`
- `generate_tiles`, `generate_sprite`, `add_asset`, `update_asset`, `remove_asset`
- `get_asset_library_state`, `list_asset_packs`, `select_asset_pack`, `list_pack_assets`, `preview_pack_asset`, `select_pack_assets`, `import_pack_assets`
- `add_reference`, `find_reference`, `remove_reference`
- `begin_iteration`, `checkpoint_iteration`, `record_iteration_attempt`, `get_iteration_history`, `compare_iterations`, `restore_iteration`, `capture_visual_review`, `get_visual_review`, `select_visual_review_capture`, `collect_verification_evidence`, `verify_iteration`, `promote_iteration`
- `get_release_verification`, `verify_release`, `get_release_verification_job`, `cancel_release_verification_job` for exact-byte local release attestation and durable monitoring

Traversal paths are independent from artwork. Provide at least two in-bounds control points, `entryRadius`, `minimumEntrySpeed`, `direction`, `collisionOwner: "authored-map"`, optional acceleration/maximum speed/exit impulse/transfers, and bail behavior. Entry requires a fresh E/LOCK press. Link a production path to an acceptance test covering entry, travel, exit, transfer when present, and bail behavior.

Deterministic motion bodies are authored object capabilities, not renderer effects. Start with provider-free `suggest_motion_body` for the exact selected object and review its path choice before `set_motion_body`. The object must use a ground-contact anchor, an enabled authored collider, `collisionOwner: "authored-map"`, and one same-map authored path. Input-driven bodies consume the held phase of a declared replay-enabled semantic action; automatic bodies need no action. Both use explicit initial direction, `stop`, `loop`, or `ping-pong` endpoint behavior, bounded speed/acceleration/deceleration, `collisionResponse: "stop"`, and a measured snap tolerance. Use `loop` only when path endpoints close within that tolerance.

Version 1 remains readable with its original player-blocking behavior. Version 2 adds explicit `riderMode: "block" | "carry-player"`, bounded `carryTolerance`, and `crushResponse: "stop" | "respawn"`. Carry is intentionally limited to the player standing on a solid platform in platformer mode on a fixed-z path: the runtime transfers the platform's exact accepted substep delta before player control. If that transfer is blocked, `stop` transactionally restores both poses and holds until the rider leaves or the driver disengages; `respawn` uses the canonical spawn path and lets the platform continue. Do not use this contract for stacked bodies or 2.5D elevators—author a support-volume/elevation contract first.

The fixed simulation advances enabled bodies in stable object-ID order and resolves authored collision independently of rendering. Canvas, Phaser, Pixi, and melonJS consume the resulting canonical object pose instead of simulating separate bodies. Inspect `motion-body.started`, `motion-body.released`, `motion-body.blocked`, `motion-body.crushed`, `motion-body.completed`, and `motion-body.reversed`, plus `getMotionBodyStates()` or the exported `get_motion_body_states` bridge command. Block and crush events are contact-latched instead of repeating every tick.

Projects without motion bodies retain the exact runtime save-state v1 shape. Projects with them use save-state v2 and persist progress, speed, direction, blocker contact, and endpoint completion while clearing transient rider/contact engagement on restore. Replay v5 introduced the frozen legacy motion projection and v6 changed its digest to SHA-256; v1-v9 remain byte-compatible. Replay v10 adds rider ID, exact accepted delta, and crush state that can affect a later tick. Link each production body to executable acceptance evidence covering activation or automatic start, release where applicable, collision stop, rider carry and both authored crush behavior where applicable, endpoint behavior, map persistence, replay, and the exact standalone export.

Deterministic actors are authored simulation capabilities, not renderer AI. Start from provider-free `suggest_actor_program`, inspect `get_actor_report`, and persist only reviewed `looplab-actor-program/v1` source through `set_actor_program`. Each actor binds to one same-map object with a ground-contact anchor, enabled authored collider, `collisionOwner: "authored-map"`, explicit support height, an authored home node, and a connected directed navigation route. Reject self targets, cross-map actor targets, duplicate movement owners, missing/wrong-way links, and routes that only look connected in pixels.

The fixed simulation advances stable actor IDs and applies one priority chain per tick: cutscene override, visible-target response, remembered-target response, return, then hold/patrol base behavior. Chase, flee, and return use deterministic A* with bounded repath cadence; line of sight tests every authored solid collider and selects the nearest hit fraction with stable object-ID ties. Explicit arrival radii and overshoot-safe route progress prevent oscillation at nodes. Version 1 intentionally omits reciprocal crowd avoidance. Inspect `actor.mode-changed`, `actor.detected`, `actor.lost`, `actor.blocked`, `actor.node-reached`, and `actor.arrived`, plus `getActorStates()` / `get_actor_states`. Link production actors to executable `actor-state` acceptance evidence. Save-state v4 and replay v8 preserve latent actor state; earlier save/replay schemas remain readable and frozen.

Connected floors, slopes, terrain lips, and planar boundaries use optional strict map-owned `looplab-collision-geometry/v1` source. Inspect with `get_collision_geometry` and `get_collision_geometry_report`. `suggest_collision_geometry` is provider-free and read-only; it may derive candidates only from explicitly selected authored one-way collider tops and never from pixels, alpha, renderer bounds, or projected screen geometry. Persist reviewed source with `set_collision_geometry`; remove the complete map contract with `remove_collision_geometry`.

Each chain keeps stable chain and point IDs, explicit point order, `role`, `oneWay`, `frontFace: "right"`, and `zMin`/`zMax`. In y-down world coordinates the canonical right-hand normal is `(dy / length, -dx / length)`, so a left-to-right floor faces upward. Segments own their start endpoint and exclude their end except for the final open segment; equal-time contacts resolve by stable chain ID and segment index. Platformer response uses deterministic bounded sweeps, X before Y, foot-center floor sampling, grounded-only snap, bounded step-up, and explicit steep-surface stop/slide tuning. Top-down chains act as authored planar boundaries. Projection and draw order never decide elevation overlap.

Map Studio's Collision tool creates, selects, moves, classifies, and removes the same canonical chains while its overlay shows control-point order and normal direction. Replay v9 introduced ground chain/segment IDs, contact normals, and slope-slide state while v1–v8 remained byte-compatible; current v10 retains that projection and adds motion-body rider/crush state. Exported games expose read-only `getCollisionGeometry()` / `get_collision_geometry`, and ordinary runtime state exposes the current contact. Run Doctor, acceptance/replay, browser playtest, and exact one-file gates after every collision change.

Canonical repeated terrain uses optional map-owned `looplab-tile-program/v1` source. Read it with `get_tile_program` and `get_tile_program_report`; request only bounded cells through `get_tile_region`. `suggest_tile_program` is provider-free and may derive palette/frame references plus empty visual/collision layers only from explicitly selected embedded tileset assets. It never infers adjacency, terrain semantics, support, or collision from filenames or pixels.

Direct visual cells, authored terrain IDs, and collision profiles occupy separate sparse chunks. Terrain sets require exact eight-neighbor signatures; unresolved signatures are actionable Doctor blockers rather than approximate visual matches. Equivalent variants are selected from a stable hash of the map, layer, coordinate, terrain set, and variation seed, so paint order does not create texture drift. Collision profiles remain `authored-map` truth even when a palette frame or generated asset changes.

Preview every `looplab-tile-patch/v1` through `preview_tile_patch`. It clones the project, validates the projected tile program, runs current and production Doctor, and returns an apply command bound to the exact source, tile-program, and patch digests. Run only that unchanged `apply_tile_patch`; stale source, stale program, stale patch, locked layer, out-of-bounds cell, unauthorized transform, or new blocker must fail. Map Studio's Tiles tool uses these same commands for direct tile, terrain, and collision brushes. Orthographic cells match projection dimensions; dimetric artwork is exact 128×64 while logical coverage uses reversible world cells. The one-file runtime exposes `getTileProgram()` / `get_tile_program`, compiled `getTileRuntime()` / `get_tile_runtime`, and tile-owned rectangles inside `getCollisionGeometry()`.

A valid tile report proves authored references, exact signatures, collision ownership, bounds, and deterministic compilation; it does not prove a visual layer is perceptible. After material tile paint, inspect a clean browser capture at representative viewports and query the exact exported `getTileRuntime()` result. If a platform, terrain lip, or other authored object hides the painted cells, correct the visual layer/row/depth without moving collision merely to match the pixels, then invalidate and regenerate exact release evidence.

For large embedded-asset projects, send `compact: true` with browser mutation commands so the result and validation return without duplicating the complete project data URLs into the response. Use `update_asset` with a stable asset `id` and a `changes` object for anchor, frame, invariant, analysis, generator, or embedded-image changes. The command preserves `collisionPolicy: "authored-only"`; visual edits never replace map collision.

Platformer feel lives in serializable `movementTuning`, not in the canvas renderer. Preserve fixed-step `coyoteTicks`, `jumpBufferTicks`, variable-height `jumpCutVelocity`, apex/fall gravity scales, acceleration, and friction; render animation or particles from events such as `player.jumped` and `player.landed` without feeding those effects back into collision.

```js
const commands = [
  {
    op: "generate_sprite",
    kind: "hero",
    palette: "violet",
    seed: "approved-hero-v1",
    size: 32,
    place: true,
    x: 120,
    y: 380
  },
  {
    op: "add_object",
    kind: "goal",
    object: {
      id: "route-a-goal",
      name: "Route A goal",
      x: 820,
      y: 242,
      width: 48,
      height: 72,
      color: "#c8ff4d",
      solid: false,
      anchorMode: "ground",
      collisionOwner: "authored-map",
      collider: { "enabled": true, "offsetX": 4, "offsetY": 4, "width": 40, "height": 68, "trigger": true, "oneWay": false }
    }
  }
];

const preview = (await api.run({
  op: "preview_batch",
  expectedSourceDigest,
  summary: "Added a readable route and a cohesive sprite/terrain pass",
  commands
})).result;
if (!preview.applicable) throw new Error("Review the batch preview before applying");

const result = await api.run({
  op: "apply_previewed_batch",
  expectedSourceDigest: preview.sourceDigest,
  expectedPreviewDigest: preview.previewDigest,
  summary: "Added a readable route and a cohesive sprite/terrain pass",
  commands
});
if (!result.ok) throw new Error(result.error);
```

`preview_batch` strict-validates each nested command and runs the exact ordered sequence against a clone. It does not persist, call a provider, execute browser/session work, change coordination or lifecycle state, or grant mutation authority. Its receipt includes compact per-command outcomes, validation, both current-authoring and production Doctor before/after deltas, and a canonical SHA-256 `previewDigest`. Stable IDs are required for creates so the reviewed plan cannot depend on generated identity.

`apply_previewed_batch` is the preferred arbitrary-batch write. It re-creates the preview on the current source and commits atomically only when the unchanged commands, summary, Doctor profile, `expectedSourceDigest`, and `expectedPreviewDigest` still agree. A source change or any plan change—including command order—rejects the whole write. The preview is inapplicable when a nested command fails or either Doctor profile gains a blocker. Legacy `apply_batch` remains available for compatibility but does not provide this separate review receipt.

Outside the browser, pipe a JSON array or JSONL command document to `npm run agent -- batch-preview game.loop.json --source-digest=source-... --summary="..."`, review the JSON receipt, then pipe the unchanged document to `batch-apply` with the returned `--preview-digest`. The same operation contracts are exposed as native MCP tools to Codex and Claude.

### Repair deterministic Doctor mechanics without guessing

When Project Doctor reports a known mechanical invariant, preview `auto_repair` before writing handcrafted commands:

```js
const doctor = (await api.run({ op: "get_doctor" })).result;
const repair = (await api.run({
  op: "auto_repair",
  expectedSourceDigest: doctor.sourceDigest,
  maxRepairs: 16
})).result;

console.table(repair.repairs);
console.table(repair.residue);
if (repair.applicable) {
  const applied = await api.run(repair.applyCommand);
  if (!applied.ok) throw new Error(applied.error);
}
```

Dry run is the default and never persists. Eligible repairs are intentionally narrow: clamping an existing visual/collider union inside its map when it fits, restoring `authored-map`/`authored-only` collision authority, attaching a standing object to its unique authored support or floor, normalizing a declared dimetric projection to 128×64, requiring fresh socket input, setting exact culling overhang, marking signature art sparse, declaring the already-first map, and clamping finite existing traversal points. It never invents a route, support surface, collider, tuning value, map join, art treatment, or reachability solution.

The receipt includes exact canonical commands, both Doctor projections, validation, a SHA-256 `repairDigest`, and explicit residue with the reason each finding still needs judgment. Applying requires the unchanged `sourceDigest` and `repairDigest`; LoopLab rebuilds the plan from current truth and commits it as one authored event. Several repairable invalidities in an imported project may exist between nested commands, but only this dedicated planner permits such intermediate state and only inside its clone. The final projection must validate fully and introduce no blocker. Ordinary `preview_batch` remains strict after every nested command.

Use `converge` when one repair can reveal another mechanically eligible finding:

```js
const convergence = (await api.run({
  op: "converge",
  expectedSourceDigest: doctor.sourceDigest,
  maxRepairs: 16,
  maxPasses: 3
})).result;
console.log(convergence.stopReason, convergence.passes, convergence.residue);
if (convergence.applicable) await api.run(convergence.applyCommand);
```

Each pass repeats analyze → safe plan → clone execution → project validation → current/release Doctor comparison. The loop is bounded to six passes, tracks visited source digests, stops on a fixed point, judgment residue, cycle, rejection, or pass limit, and never calls a provider. A `max-passes` receipt can still represent a safe bounded improvement, but it states how many eligible repairs remain. After apply, run the affected replay, acceptance, visual, and browser gates; mechanical repair does not prove gameplay quality. The source-controlled `repair-doctor-mechanics` playbook recipe carries the same stop conditions and evidence requirements for Codex and Claude. CLI equivalents are `npm run agent -- repair ...` and `npm run agent -- converge ...`.

### Draft a source-bound plan from a short intent

Use `draft_agent_plan` after the warm-start brief and relevant map context. It is a deterministic local planner shared by Codex, Claude, CLI, MCP, the browser bridge, and the visible Agent API. It never calls a provider or mutates the project. A narrow request selects a proven command macro, exact Agent Playbook recipe, or guarded canonical editing workflow. Multiple independent requirements produce a composite plan whose `coverage` ledger and ordered `phases` are authoritative; no requirement may disappear behind the first phrase match.

Treat the agent contract—not the visible UI—as the capability boundary. For every coverage entry, confirm a status and phase reference. Resume from the first incomplete phase only while the plan definition, source lineage, and completed evidence remain valid. Redraft after an authored source change before calculating downstream exact commands. Reads may retry, durable work resumes by existing job ID, and an applied mutation receipt forbids automatic replay.

Prefer `compact:true` for plans. Compact plans keep authoritative coverage, phases, source bindings, retry/resume rules, and exact commands/preview receipts. They reduce flattened steps to IDs, status, operations, blockers, and exact commands, while repeated instructions, command schemas, macros, and recipes become stable `looplab://manifest` and `looplab://agent-playbook` references. Request full inline definitions only when the caller cannot use those published resources.

```js
const plan = (await api.run({
  op: "draft_agent_plan",
  intent: "Connect the station and market with safe forward and return portals",
  mapIds: ["station", "market"],
  compact: true
})).result;

console.log(plan.sourceDigest, plan.planDigest, plan.strategy);
console.log(plan.missingInputs, plan.parameterIssues);
```

If the intent matches a proven macro but lacks required structured parameters, the plan reports the exact missing fields and does not invent an apply command. With complete valid parameters, it embeds the real clone-based macro preview and a source/expansion-digest-pinned `apply_command_macro` command marked `review-required`; it still does not execute it. Recipe plans preserve stop conditions and required evidence. Generic plans identify where an agent must draft the smallest coherent canonical batch.

Treat every plan as stale after a source-digest change. Its `authority` block always states `nonExecuting`, `providerUsed: false`, `persistsProject: false`, and `grantsMutationAuthority: false`. Review remains mandatory, and every later mutation inherits the normal source/ledger/expansion digest, Project Doctor, replay, browser, provider, and export boundaries. Outside the browser use `npm run agent -- plan game.loop.json "intent" [--maps=id,id]`; complex macro parameters can be supplied with `--parameters-stdin`.

### Use the living Agent Playbook

LoopLab turns recurring, already-solved operating failures into a small immutable registry shared by Codex, Claude, the CLI, MCP, and the Agent API UI. `get_agent_brief` may return up to three compact relevant recipe references. Search the registry when the current issue or intent needs a known workflow, then retrieve one exact recipe:

```js
const matches = (await api.run({
  op: "list_agent_recipes",
  query: "replay mismatch",
  status: "active",
  limit: 3
})).result;
const exact = (await api.run({
  op: "get_agent_recipe",
  recipeId: matches.recipes[0].id
})).result;
console.log(exact.recipe.recipeDigest, exact.recipe.stopConditions, exact.recipe.evidence);
```

Recipes are read-only operational context, not scripts or alternate dispatchers. They can reference only canonical manifest commands. Reading one never mutates a project, starts a provider, writes a file, rewrites a replay, or claims evidence passed. Every listed step must still be issued explicitly and inherits the normal source-digest, Project Doctor, replay, provider, browser, and export boundaries.

The registry is source-controlled and schema-validated. Stable IDs and revisions make guidance reviewable; deprecated entries remain readable and name their replacement. A difficult solution should become a new recipe only after its reusable implementation and regression evidence exist. Use `npm run agent -- playbook [query]` and `npm run agent -- recipe <id>` outside the browser, or read the complete registry at the MCP resource `looplab://agent-playbook`.

### Publish live agent presence without confusing it with ownership

The running loopback companion maintains an ephemeral live-client directory so Codex, Claude, automation, and human-driven browser sessions can see who is active now. It is separate from editable project state and from the durable shared-work ledger.

```js
const registered = await api.run({
  op: "register_agent_presence",
  presenceId: "claude-main",
  clientKind: "claude",
  displayName: "Claude",
  status: "active",
  projectId: "kinetic-city-starter",
  operation: "Reviewing the map transition",
  workItemIds: ["repair-map-transition"],
  ttlSeconds: 45
});

// Retain registered.result.leaseToken locally and renew before
// registered.result.heartbeatAfterSeconds. Never put it in a project or handoff.
await api.run({
  op: "leave_agent_presence",
  presenceId: "claude-main",
  leaseToken: registered.result.leaseToken
});
```

`get_agent_presence` is a compact read; `register_agent_presence` creates or renews one server-timestamped TTL lease; `leave_agent_presence` releases it explicitly. An active ID can be renewed or left only with its opaque token. A competing token or changed identity receives a structured conflict instead of silently taking over. Crash/disconnect cleanup comes from expiry, and callers should heartbeat before one third of the granted TTL.

Every presence endpoint requires the launcher-owned companion session. Public list and DOM state never contain lease tokens. Bounded display name, status, operation, project ID, source digest, and work-item IDs are allowed; credentials, prompts, provider output, absolute paths, project source, and binary content are rejected or excluded.

Presence says **who is live**, not who owns work. It is companion-memory-only, disappears on restart, does not enter provider context, project JSON, undo history, source digests, exported HTML, or verification evidence, and cannot claim or complete a task. Use `get_work_ledger` plus its digest-bound renewable claims for durable ownership, handoff, blockers, landed results, and evidence.

The visible read-only summary is `#looplab-agent-presence`; machine-readable public state is `#looplab-agent-presence-state`; changes emit `looplab:agent-presence-changed`. The same three commands are browser-session MCP tools for Codex and Claude.

### Coordinate Codex and Claude with the shared work ledger

The editable project carries a bounded, structured work ledger so Codex, Claude, and the user can see ownership without relaying status through chat. Start with `get_work_ledger`. If an existing open, in-progress, or blocked item matches the subsystem, claim it before editing; if another active lease owns it, do not duplicate the work. Claims expire unless renewed, and an active takeover requires both `takeover: true` and a concrete reason.

```js
let ledger = (await api.run({ op: "get_work_ledger", status: "all", eventLimit: 10, compact: true })).result;
const added = (await api.run({
  op: "add_work_item",
  expectedLedgerDigest: ledger.ledgerDigest,
  actor: "codex",
  item: {
    id: "repair-map-transition",
    title: "Repair map transition",
    summary: "Preserve authored route metadata and prove both portal directions in the browser.",
    kind: "bug",
    priority: "high",
    scope: ["maps", "runtime-join", "browser-harness"]
  }
})).result;
const claimed = (await api.run({
  op: "claim_work_item",
  expectedLedgerDigest: added.ledgerDigest,
  id: "repair-map-transition",
  actor: "claude",
  leaseSeconds: 7200
})).result;
await api.run({
  op: "update_work_item",
  expectedLedgerDigest: claimed.ledgerDigest,
  id: "repair-map-transition",
  actor: "claude",
  changes: {
    status: "landed",
    resultSummary: "Rich route metadata now round-trips and both joins pass.",
    evidenceRefs: ["tests/runtime-join.test.mjs", ".looplab/browser-game/final.png"]
  }
});
```

Every ledger mutation uses the independent SHA-256 `expectedLedgerDigest`, not `expectedSourceDigest`. A stale writer receives `[stale-ledger]` and must reread and rebase. `landed` requires a result summary and evidence reference; `blocked` requires blockers; `rejected` requires a reason. Use `release_work_item` when handing work back without a lifecycle conclusion. The visible control surface is `#looplab-agent-work-ledger`, CLI reads use `npm run agent -- work game.loop.json`, and updates emit `looplab:work-ledger-changed`.

The ledger is coordination metadata only. It never executes a command, authorizes broader work, changes the Project Doctor source digest, enters gameplay undo history, satisfies verification, enters provider context, or ships in exported HTML. Store stable IDs, bounded summaries, scope, blockers, and evidence references—not prompts, responses, reasoning, credentials, session tokens, private keys, or provider transcripts.

### Reuse a proven command macro

LoopLab's built-in macros are versioned, typed shortcuts for command sequences that have already earned regression coverage. They are not scripts and do not expand the agent's authority. List the registry, preview an exact expansion against a clone, then apply only that source-bound SHA-256 plan:

```js
const registry = (await api.run({ op: "list_command_macros" })).result;
const parameters = {
  mapId: "station-main",
  objectId: "station-vending-machine",
  name: "Station vending machine",
  x: 760,
  y: 390,
  width: 48,
  height: 80,
  footprint: { offsetX: 8, offsetY: 58, width: 32, height: 22, collisionHeight: 1 },
  groundAnchor: { offsetX: 24, offsetY: 80 },
  supportMode: "auto",
  supportTolerance: 2
};
const plan = (await api.run({
  op: "preview_command_macro",
  macroId: "place-supported-prop",
  parameters,
  compact: true
})).result;
if (!plan.applicable) throw new Error(`Macro blocked: ${plan.doctor.newBlockers.map((issue) => issue.code).join(", ")}`);
const applied = await api.run({
  op: "apply_command_macro",
  macroId: "place-supported-prop",
  parameters,
  expectedSourceDigest: plan.sourceDigest,
  expectedExpansionDigest: plan.expansionDigest,
  compact: true
});
if (!applied.ok) throw new Error(applied.error);
```

The registry contains `place-supported-prop`, `connect-maps-round-trip`, and `protect-completion-witness`. The supported-prop macro requires the exact active `mapId`; switch maps deliberately before preview rather than relying on incidental editor state. `protect-completion-witness` requires a passed deterministic completion report, derives the exact start map/spawn and semantic input tape locally, and expands to the ordinary `record_replay_case` command. It defaults to one-tick checkpoints and refuses an existing fixture ID; an intentional replacement remains on the manual higher-`revision` plus non-empty `changeReason` path.

Preview executes the exact expanded canonical commands through normal validation and both current-authoring and production Project Doctor on a cloned project without persistence. Operation receipts are compact summaries by default so a replay with hundreds of checkpoints does not flood agent context; set `detail: "full"` or CLI `--detail=full` only when raw per-operation evidence is needed. Apply re-expands and rejects `[stale-source]`, `[stale-macro-plan]`, invalid output, or any newly introduced Doctor blocker before persistence. Unknown parameters and wrong nested JSON types are rejected. Macros cannot nest or contain provider, network, file, export, browser-input, or capture operations.

A macro never silently rerecords a deterministic fixture. When a legitimate gameplay edit makes an existing replay diverge, keep the preview blocked, intentionally revise and remeasure the affected fixture in the larger candidate workflow, and submit the expanded commands plus evidence change as one coherent reviewed pass. Do not bypass the macro gate or discard the old fixture history.

CLI discovery and plan/apply use the same core implementation:

```powershell
npm run agent -- macros
'{"mapId":"station-main","objectId":"station-vending-machine","x":760,"y":390,"width":48,"height":80,"footprint":{"offsetX":8,"offsetY":58,"width":32,"height":22},"groundAnchor":{"offsetX":24,"offsetY":80}}' | npm run agent -- macro-preview game.loop.json place-supported-prop
'{}' | npm run agent -- macro-preview game.loop.json protect-completion-witness
# Apply only with the exact sourceDigest and expansionDigest returned above.
```

## Open HTML projects and work across maps

Looplab exports embed the authoring project as JSON in `#looplab-project-data`. Import that authored metadata instead of reverse-engineering pixels, DOM nodes, or generated runtime code:

```js
const imported = await api.run({ op: "import_html", html: looplabHtmlSource });
// imported.result.mapCount reports the recovered maps.
await api.run({ op: "switch_map", id: imported.project.maps[0].id });
```

Every recovered map appears as its own editor tab. Arbitrary third-party HTML is intentionally rejected because artwork and markup are not trustworthy collision definitions. Keep editing the recovered authoring project and regenerate the HTML; never patch the export.

### Define the player-facing map route

`project.maps` is the ordered game route and `project.startMapId` identifies the first map the player experiences. Keep the start map at index 0. A connection is never just a drawn arrow: `connect_maps` authors a real portal on the source map, targets a stable spawn ID on the destination map, and enables an explicit `runtimeJoin` evidence contract by default.

Store promised campaign size as structured truth instead of leaving it only in prose. Set `campaignScope` on `set_game_brief` or `configure_director` to `single-map`, `two-connected-maps`, `three-connected-regions`, or `four-to-six-map-campaign` (`auto` leaves the choice to the provider). Prompt generation and Retry Prompt preserve this selection. Project Doctor reports `campaign-map-count` when the authored maps do not match; prototype work receives a warning and production receives a blocker. Once multiple maps exist, the normal spatial gate still requires the ordered route to be reachable through exact authored portal-to-spawn joins.

```js
await api.run({
  op: "set_game_brief",
  userPrompt: "A bell keeper crosses three distinct regions in order.",
  genre: "action-adventure",
  coreLoop: "explore-collect-unlock",
  movementTemplate: "top-down-action-rpg",
  format: "connected-rooms",
  progression: "level-campaign",
  campaignScope: "three-connected-regions"
});
```

```js
await api.run({ op: "set_start_map", id: "map-1" });
await api.run({ op: "reorder_map", id: "map-2", toIndex: 1 });
await api.run({
  op: "connect_maps",
  sourceMapId: "map-1",
  targetMapId: "map-2",
  portalId: "map-1-to-map-2",
  targetSpawnId: "map-2-entry",
  transition: "fade",
  runtimeJoin: {
    mode: "continuous",
    sourceEdge: "right",
    targetEdge: "left",
    overlapPixels: 32,
    sampleDepth: 12,
    minimumUniquePixelRatio: 0.02,
    maximumBoundaryColorDelta: 0.2
  }
});
const joinPlan = await api.run({ op: "get_runtime_join_plan" });
```

Project Doctor blocks an ordered route gap or a map that cannot be reached from `startMapId`. Preview and exported HTML start at `startMapId`, not whichever editor tab happened to be open last.

`get_runtime_join_plan` reports every enabled portal, exact destination spawn, capture edges, overlap, and thresholds without pretending that authored metadata is visual proof. `collect_verification_evidence` then drives the real fresh-press portal interaction for every device profile, checks the exact landing and authored collision clearance, hides the player in both source and target captures, and stores source-bound pixel hashes and ratios. It measures destination content beyond the declared overlap; matching a copied overlap strip is insufficient. Continuous joins also compare the outgoing and incoming boundary colors. A missing or failed portal/profile receipt blocks verification.

## Author 2.5D dimetric maps and route layers

This is still 2D authoring—not a 3D mode. Do not fake a rollerblading, isometric, or 2.5D map by manually skewing screen coordinates. Select the exact dimetric projection and keep simulation data in authored world x/y/z. The editor, hit-testing, drag placement, preview, standalone renderer, and headless API all use the same reversible 2D adapter. One world tile is 128 authored units by default and projects to an exact 128×64 diamond.

For the safest starting proof, load the dedicated template or add one beside an existing map. Both include separate z=0 and z=4 route layers, overlapping underpass/deck nodes at the same world x/y, authored traversal paths at both heights, blocked building footprints, floor-standing props, and non-overlapping raised-terrain depth slices:

```js
const starter = await api.run({ op: "load_template", template: "dimetric" });
// Or preserve the current project and add a connected workshop map:
const added = await api.run({ op: "add_dimetric_map", id: "district-2", name: "District 2", activate: true });
```

The visible equivalent is **Map Studio** in the top workspace switch. Its canvas-first toolbar exposes projection, rail/traversal drawing, layered navigation, walkable/blocked polygons, A* route testing, elevation, Path Editor exchange, and creation of another 2.5D map. Fine Tune remains available for individual object, support, collider, map-size, and route-sequence edits.

```js
await api.run({
  op: "set_map_projection",
  projection: {
    type: "dimetric-2:1",
    tileWidth: 128,
    tileHeight: 64,
    worldUnitsPerTile: 128,
    elevationStep: 32,
    originX: 480,
    originY: 96
  }
});
await api.run({ op: "add_navigation_layer", layer: { id: "ground", name: "Ground / underpass", zMin: 0, zMax: 1, color: "#555555" } });
await api.run({ op: "add_navigation_layer", layer: { id: "deck", name: "Viaduct deck", zMin: 4, zMax: 5, color: "#777777" } });
await api.run({ op: "add_navigation_node", node: { id: "ground-entry", x: 160, y: 220, z: 0, layerId: "ground", destinationId: "underpass-entry" } });
await api.run({ op: "add_navigation_node", node: { id: "ground-exit", x: 620, y: 220, z: 0, layerId: "ground", destinationId: "underpass-exit" } });
await api.run({ op: "connect_navigation_nodes", id: "underpass-line", a: "ground-entry", b: "ground-exit", layerId: "ground", cost: 1 });
const route = await api.run({ op: "test_navigation_route", from: "ground-entry", to: "ground-exit", layerIds: ["ground"] });
if (!route.result.route.ok) throw new Error(route.result.route.reason);
```

Navigation data describes intentional travel, not generated artwork. Use stable nodes and weighted, optionally one-way links for A* route tests. Looplab scales the A* heuristic by the graph's minimum usable cost, preserving admissibility even when links cost less than 1. Blocked-link validation uses exact segment/polygon crossing at overlapping heights rather than sparse samples. Use walkable and blocked polygons for plazas, buildings, landing zones, and route exclusions. Keep traversal paths as the separate authored owner of rail/grind behavior, with a `routeLayer` and an `entryZTolerance`; a ground player at z=0 must never capture a deck rail at z=4 merely because their projected x/y overlaps.

High and low routes at the same ground position require distinct route layers and non-overlapping z ranges. Visual z, support z, collider zMin/zMax, navigation layer, traversal route layer, and terrain depth slices are separate authoring decisions. Project Doctor reports ambiguous heights, missing endpoints/layers, blocked links, disconnected islands, duplicate destinations, failed saved routes, and links crossing blocked ground.

To reuse an existing Path Editor map from any local project, pass its exported v2 JSON without rewriting it by hand:

```js
await api.run({ op: "import_path_editor_navigation", data: pathEditorJson });
const exported = await api.run({ op: "export_path_editor_navigation" });
const pathEditorJsonWithHeights = exported.result.data;
```

Looplab converts Path Editor percentage coordinates into the active map's world bounds while retaining stable node/edge IDs, destinations, links, one-way direction, costs, names, layer locks, areas, and layer IDs. Export writes portable Path Editor v2 x/y plus the `looplab-rich-route-v2` extension. That extension retains exact projection, layer z-ranges, node/area z, and—when present—the complete original timed route document. Import reads it back. Never remove the extension from a raised or scheduled map; doing so would flatten deck/underpass data or discard behavior the visual graph does not expose. The original standalone editor is bundled at `/path-editor/` for manual editing, while the import/export commands expose the same exchange to Codex, Claude, and API agents. Inspect the converted graph on the map stage, run `test_navigation_route`, and rerun Doctor before treating it as playable. Locations, characters, portals, and gameplay objects remain Looplab objects; associate them with stable destination IDs instead of creating a second entity model inside navigation data.

### Preserve timed authored routes

Use `set_authored_route_document` to attach the original city/activity timeline or versioned route envelope. `get_authored_route_document` returns a summary or the complete source. The actor, step, and meeting update commands preserve unknown fields and stable IDs, so they can change a visible value without rebuilding a reduced schema. The Map Studio actor and schedule controls call these same commands.

The route envelope retains per-actor timings, move/wait points, facing, animation cues, meetings, events, world z, render-depth bias, loop bounds, and deterministic evidence receipts. Its `currentDigest` is canonical SHA-256 (`sha256-jcs-v1`). A no-op edit leaves the revision and evidence state unchanged. A material edit increments the revision and marks preserved evidence stale; it never silently rerecords a new hash.

After a material change, call `verify_authored_route_document` only with evidence for the exact current digest. Evidence must be a deterministic replay, render capture, runtime probe, or combined receipt containing stable paths and measured values. If a receipt value changes, supply an explicit simulation version and version-log reason. Export the versioned route package to retain the receipts, or export the original source JSON when another runtime needs the unwrapped source.

## Ground and raised-surface attachment

A floor-standing object has four independent concepts:

- `groundAnchor`: the visual point that must touch its support;
- `supportFootprint`: the base area used to decide whether it fits on that support;
- `supportContact`: the selected floor or raised surface, mode, offset, and tolerance;
- `collider`: authored gameplay geometry, which remains the only collision owner.

Inspect available support surfaces and the current contact before placing a vending machine, rail, ledge, bench, barrier, ramp, kiosk, lamp, building, terrain prop, or generated prop:

```js
const supports = await api.run({ op: "inspect_supports", id: "vending-machine" });
const attached = await api.run({
  op: "attach_to_support",
  id: "vending-machine",
  mode: "auto", // auto | floor | surface | free
  tolerance: 2
});
```

Use `surfaceId` when the object must sit on a particular raised route. In side-view maps, attachment aligns the visual ground anchor to the authored surface top. In top-down and dimetric maps, it resolves the base footprint and independent support z so a high route and its underpass remain separate. Never derive a collider from generated art.

## Visual asset generation

The same generators exposed in Fine Tune are available to agents:

```js
await api.run({ op: "generate_tiles", theme: "neon", tileSize: 32, seed: "district-a", attach: true });
await api.run({ op: "generate_sprite", kind: "hero", palette: "violet", size: 32, seed: "skater-v3", attach: true });
await api.run({ op: "generate_sprite", kind: "prop", palette: "ember", size: 32, seed: "vending-a", place: true, x: 480, y: 320, supportMode: "auto" });
await api.run({ op: "generate_sprite", kind: "effect", palette: "forest", size: 32, seed: "spark-v1", attach: true });
await api.run({ op: "generate_sprite", kind: "ui", palette: "mono", size: 32, seed: "lock-icon", attach: true });
```

Valid sprite roles are `hero`, `enemy`, `pickup`, `prop`, `effect`, and `ui`; palettes are `violet`, `ember`, `forest`, and `mono`; tile and sprite sizes are 16, 32, 48, or 64. World sprites use explicit ground anchors; effects and UI use center anchors. Generated props placed through the command are support-attached automatically. Always inspect the rendered result and decoded-memory ledger before accepting the pass.

Those commands are deterministic zero-provider fallbacks. For prompt-directed production art, submit one durable OpenAI Image job through the same headless bridge:

```js
const submitted = await api.run({
  op: "generate_ai_asset",
  role: "character", // character | enemy | pickup | prop | effect | ui | tileset | environment
  prompt: "A readable courier in a dark-grey utility jacket, side view, compact silhouette",
  identity: "courier-v7",
  actions: ["idle", "push", "coast", "brake"],
  targetFrameSize: 48,
  quality: "medium",
  background: "transparent",
  wait: false,
  attach: true
});

// Keep submitted.job.jobId. Never submit the same request again while it is active.
await api.run({ op: "get_ai_asset_job", jobId: submitted.job.jobId });
const completed = await api.run({ op: "generate_ai_asset", jobId: submitted.job.jobId, wait: true, attach: true });
```

`wait: true` monitors the retained job with no outer UI timeout. Resuming with `jobId` never creates a second provider request. Use `cancel_ai_asset_job` only for an explicit user cancellation. The result is split, neutral-matte-cleaned when required, shared-scale normalized, palette-locked, packed, measured, and provenance-stamped before attachment. `looplab-frame-analysis/v1` inspects both provider source cells and packed output for alpha bounds, empty cells, scale drift, source/final anchor variance, distant subject clusters, forbidden sprite-border occupancy, matte-halo signal, and tile opposing-edge deltas. Unmeasured or failed art is returned with `ok:false`, `rejected:true`, and stable `failedInvariants`; it stays downloadable for diagnosis but is not attached, placed, or described as game-ready. Provider pixels remain visual source art and can never own collision.

### Author and apply the project visual identity

Use the optional project `visualIdentity` contract when multiple assets or iterations need one inspectable visual baseline. It stores authored intent, role-scoped directives, project-asset references, and exclusions. It does not pick a house style, own gameplay geometry, or replace run-level `explore`, `preserve`, and explicit style-lock choices.

```js
const current = await api.run({ op: "get_visual_identity" });
await api.run({ op: "set_visual_identity", identity: authoredContract });
const report = await api.run({ op: "get_visual_identity_report" });
```

Read `manifest.visualIdentityRules` and the `set_visual_identity` command schema before authoring. Only a directive explicitly marked `userAuthored:true` may use `strength:"lock"`. Stable IDs must be unique, conflicting role/dimension locks are rejected, every reference must resolve to an existing project asset, and `remove_visual_identity` is always explicit. The provider may inherit or bypass the contract for one job; it may never adopt, remove, or rewrite it implicitly.

```js
const submitted = await api.run({
  op: "generate_ai_asset",
  prompt: "A readable four-action courier sheet",
  role: "character",
  useVisualIdentity: true,
  referenceConsent: true,
  wait: false
});
```

Inheritance is on by default. Set `useVisualIdentity:false` only for an intentional one-job exploration. A semantic reference adds its note without image bytes. An applicable `delivery:"image"` reference requires fresh `referenceConsent:true` for that exact job; prior consent and merely selecting the reference do not count. LoopLab rejects missing consent before provider submission, caps uploads at four embedded PNGs and 16 MiB decoded, uses multipart `/v1/images/edits`, and keeps public requests/receipts byte-free. Project Doctor validates the contract and exact generated-asset identity receipts, but it cannot prove taste, originality, licensing, or provider adherence. Grounded critique receives only bounded identity text/report context plus its separately consented captures. The identity contract is authoring-only and is omitted from standalone runtime payloads.

For new external game-art generation, use a flat light neutral grey matte (`#d9d9d9`) whenever transparency cannot be requested reliably. This is a temporary review/keying tool, never a required game palette, background, setting, or art-direction constraint. The accepted game sprite or tile must end with transparent alpha where no artwork exists. Do not request or use a green screen. Green spill can contaminate sprite edges and makes cleanup ambiguous. Extract only border-connected neutral matte pixels, then inspect hair, tires, wheels, shadows, pale highlights, and equipment before accepting transparency.

Generate one approved identity seed first, then create the entire animation strip in one request so equipment and proportions stay coherent. Give every frame a named runtime role such as idle, push, air, and grind. Normalize the whole strip with one shared scale and bottom-center ground anchor; do not resize each frame independently. Quantize last against the project palette, assert every opaque output pixel is on-palette, and record per-frame palette usage, encoded bytes, decoded RGBA bytes, source hash, measured anchor variance, review background, final alpha policy, and extraction policy. Inspect the sheet over checker, light-grey, and dark-grey surfaces. Tile cells intentionally may occupy edges and therefore use tile-specific opposing-edge evidence rather than sprite-transparent-border rejection. Use `scripts/normalize-light-gray-sprite-strip.py` for new artwork. `scripts/normalize-dark-gray-sprite-strip.py` remains only to reproduce older dark-matte sources exactly.

## Visual references

Users can drag-capture a map area. Looplab stores its image signature, exact map ID, and source coordinates. To locate the same area from a screenshot:

```js
const match = await api.run({ op: "find_visual_reference", dataUrl: screenshotDataUrl });
// match.match => { mapId, x, y, width, height, ... }
```

Use the returned map and bounds rather than guessing from screen position.

## Installed commercial-use asset packs

Read `/asset-packs/manifest.json` or `#looplab-asset-pack-state` for the installed library, then open `/asset-packs/index/{packId}.json` or use the headless commands. The admission policy remains stricter than itch.io's “Free” price filter: each included pack has individual CC0 1.0/public-domain evidence permitting commercial use, modification, redistribution, and no-attribution use. Preserve pack, archive, file path, SHA-256, license URL, verification date, and evidence on every import.

```js
await api.run({ op: "list_asset_packs", category: "tileset" });
await api.run({ op: "list_pack_assets", packId: "tiny-platformer-pack", kind: "image", query: "grass", limit: 24 });
await api.run({ op: "preview_pack_asset", packId: "tiny-platformer-pack", assetId: "<asset-id>", open: true });
await api.run({ op: "import_pack_assets", packId: "tiny-platformer-pack", assetIds: ["<asset-id>"], place: true, x: 320, y: 360 });
```

For sprite sheets, `import_pack_assets` also accepts exact `frameWidth`, `frameHeight`, and optional `frames`. Slices must divide the source dimensions exactly. Importing preserves the source palette; it does not falsely claim palette normalization. Run the Sprite/Palette pipeline before marking a multi-frame character palette-locked. The original `/cc0-asset-catalog.json` remains the admission/evidence catalog. The installed pack library is already local and browseable; only selected files are embedded into the authoring project and final HTML.

## Standard game shell and player lifecycle

Every production game needs an intentional, renderer-neutral player shell around the deterministic simulation: title/start, playing, pause/resume, settings, win, loss, and restart. This is authored as `project.gameShell` (`looplab-game-shell/v1`) and is not inferred from the renderer or generated art. A deliberately shell-free production artifact must carry an explicit reviewed waiver; absence alone is a Doctor blocker.

Claude, Codex, the mouse UI, CLI, MCP, and browser Agent API use the same canonical authoring operations:

```js
const shell = await api.run({ op: "get_game_shell" });
const report = await api.run({ op: "get_game_shell_report" });
const prepared = await api.run({ op: "suggest_game_shell" });
await api.run({
  op: "set_game_shell",
  expectedSourceDigest: report.result.sourceDigest,
  gameShell: prepared.result.gameShell,
});
```

Use `remove_game_shell` only for an explicit reviewed removal or waiver workflow. Shell labels, settings, and deterministic terminal bindings are source-owned. Win and loss overlays bind only to canonical runtime state such as `won`, `player-health-depleted`, or an explicitly named Boolean gameplay variable; pixels, animation state, wall-clock time, and provider prose never declare a terminal result.

The shell owns presentation lifecycle but not simulation truth. Starting or resuming unpauses the ordinary fixed-step runtime; pausing stops advancement without rewriting gameplay state; restart uses the canonical runtime reset. Focus loss, blur, or `visibilitychange` may pause an active game, but must never auto-resume it blindly. Reduced motion, mute, master volume, and touch-control size are session preferences coordinated through the existing presentation runtime and excluded from replay hashes and portable saves.

Before export, require `get_game_shell_report` plus production Doctor. In the exact one-file artifact, exercise `get_game_shell`, `get_game_shell_report`, `get_game_shell_state`, `start_game`, `pause`, `resume`, `restart`, `open_game_settings`, `close_game_settings`, `set_audio_muted`, `set_master_volume`, `set_reduced_motion`, and `set_touch_control_size` through `window.looplabRuntime` or the DOM bridge. Confirm meaningful focus movement, the native settings dialog, no simulation advance while paused, terminal overlays sourced from deterministic state, no touch UI for desktop-only projects, and no external requests.

## Project Doctor and verification

Run Doctor after every candidate:

```js
const after = (await api.run({ op: "get_doctor", profile: "production" })).doctor;
```

Project Doctor executes acceptance and replay fixtures; it does not treat prose or a hash-shaped string as proof. Start by inspecting the acceptance plan:

```js
const plan = await api.run({ op: "get_acceptance_plan" });
if (plan.result.missingIds.length || plan.result.verbSpecOnlyIds.length) {
  throw new Error(JSON.stringify({ missing: plan.result.missingIds, specOnly: plan.result.verbSpecOnlyIds }));
}
const acceptance = await api.run({ op: "run_acceptance_suite" });
if (acceptance.result.executableCount && !acceptance.result.passed) throw new Error(JSON.stringify(acceptance.result));
const completion = await api.run({ op: "get_completion_report", profile: "production" });
if (completion.result.target.required && !completion.result.passed) throw new Error(JSON.stringify(completion.result));
```

An acceptance record remains a specification unless a restricted deterministic driver executes and passes, a current replay passes, or a current source-bound behavior receipt explicitly contains the passed check ID. Deterministic cases use `runner: "looplab-deterministic-runtime"`, a bounded fixed-tick `driver` with semantic pressed/released inputs, and allowlisted `assertions` over gameplay variables, completed rules, emitted events, object state, runtime state, or traversal paths. Each case receives fresh runtime state. The runner rejects JavaScript, `eval`, arbitrary object paths, DOM selectors, storage, network, and shell commands. Providers may author a spec, but may never claim their own output passed. CLI equivalents are `npm run agent -- acceptance-plan game.loop.json` and `npm run agent -- acceptance game.loop.json [test-id]`.

The completion harness is genre-neutral. It looks for an authored goal or enabled `win` effect, reuses a passing `runtime.won` acceptance route first, and otherwise runs a bounded breadth-first search over live semantic actions in the same deterministic runtime. A pass includes a source-bound replay tape. `dead-end` proves only that the initial state has no state-changing executable action under the current macro model; `inconclusive` means the bound or abstraction did not find a witness and must never be reported as “unwinnable.” Projects explicitly designed without a terminal target may use `qualityContracts.completionMode: "open-ended"`. Production projects with a required target need a passing witness. The CLI equivalent is `npm run agent -- completion game.loop.json production`.

For orthographic platformers, Doctor measures the maximum jump rise by fork-stepping the shipped 60 Hz integrator, then builds a conservative support graph from authored colliders. An unreachable optional platform is diagnostic; a goal or connected-map portal with no route under the measured movement envelope blocks production. Repair geometry or intentionally retune `movementTuning`, then prove the route with a behavior-asserting acceptance case, a versioned replay, and a browser playtest. The Pocket Platformer starter carries the `pocket-route-completion` acceptance/replay pair as a protected example.

Replay snapshot schemas are versioned: fixtures without `hashVersion` retain the original v1 projection and FNV-1a-32 digest; v1-v5 fixtures remain byte-compatible. Version 6 introduced the `replay-sha256-` full SHA-256 digest, v7 added deterministic combat state, v8 added latent actor state, v9 added authored collision-chain contact, and current v10 adds moving-platform rider, accepted-delta, and crush state while preserving every earlier projection. Adding deterministic runtime state must add a new projection instead of silently invalidating accepted evidence. Record a short semantic-input route before polishing the implementation, then rerun it after every candidate:

```js
await api.run({
  op: "record_replay_case",
  id: "reach-first-ledge",
  name: "Reach the first ledge without tunneling",
  tickCount: 120,
  inputs: [
    { tick: 0, action: "move-right", pressed: true },
    { tick: 42, action: "jump", pressed: true },
    { tick: 48, action: "jump", pressed: false },
    { tick: 100, action: "move-right", pressed: false },
  ],
  checkpointInterval: 1,
});
const replay = await api.run({ op: "run_replay_suite" });
if (!replay.result.passed) throw new Error(JSON.stringify(replay.result.firstDivergence));
```

A consented Human Play Session remains browser-local observation and never becomes evidence automatically. Current `looplab-playtest-session/v2` records every resolved semantic press/release at the exact completed fixed-step boundary while retaining wall-clock timing only for descriptive heatmaps and feedback. UI refreshes, map inspection, and hidden time do not advance this tick. Legacy v1 wall-clock sessions remain readable and exportable but must never be rounded into replay ticks.

For an uninterrupted good v2 run that began from the authored reset state, use the same two-phase review/apply boundary as other protected authoring:

```js
const previewResponse = await api.run({ op: "preview_playtest_replay", sessionId: "playtest-…", compact: true });
if (!previewResponse.ok) throw new Error(previewResponse.error);
const preview = previewResponse.result;
if (!preview.eligible) throw new Error(JSON.stringify(preview.blockers));

const promotion = await api.run({
  op: "promote_playtest_replay",
  sessionId: "playtest-…",
  expectedSourceDigest: preview.sourceDigest,
  expectedSessionDigest: preview.sessionDigest,
  expectedPromotionDigest: preview.promotionDigest,
  compact: true,
});
if (!promotion.ok) throw new Error(promotion.error);
```

`preview_playtest_replay` is provider-free, read-only, and clone-executes the ordinary `record_replay_case` path. It returns the exact replay specification, immediate pinned-hash result, comparable canonical event-count differences, and source/session/promotion digests. `promote_playtest_replay` recomputes that review and applies only if all three digests still match. Stale source, legacy timing, a non-reset start, zero ticks, dropped semantic input or runtime events, recorder timeout, mid-run reset/map manipulation, unresolved actions, unsafe fixture replacement, replay failure, or event-count mismatch remains a visible blocker. Heatmaps, world samples, source-device labels, feedback, and wall-clock timing never enter the fixture. Once promoted, the result is an ordinary versioned replay case that Project Doctor and release gates rerun normally.

Inputs address zero-based simulation ticks; checkpoint hashes describe state after one-based ticks. Hashes use canonical nested simulation-only state, including active input/action and overlap-contact state that can change the next tick, while excluding artwork, camera, animation playback, audio, particles, shell lifecycle/preferences, and wall-clock values. A mismatch reports the first recorded divergent tick. Do not silently rerecord a changed result: replacing a fixture requires a higher `revision` and a non-empty `changeReason`. Automatic browser QA adds one source-bound replay evidence receipt when fixtures exist. CLI equivalents are `npm run agent -- replay game.loop.json [case-id]` and `<case-json> | npm run agent -- record-replay game.loop.json`. Exported runtime API 2.28 exposes `getSourceDigest()`, `getCollisionGeometry()`, `getTileProgram()`, `getTileRuntime()`, `getMotionBodyStates()`, `getActorStates()`, `getRuntimeAdapterInfo()`, `getInputActionLiveness()`, `getCompletionReport()`, `getCombatState()`, `getNarrativeContract()`, `getNarrativeReport()`, `getPresentationProgram()`, `getPresentationReport()`, `getPresentationStatus()`, `getGameShell()`, `getGameShellReport()`, `getGameShellState()`, `setAudioMuted(boolean)`, `setMasterVolume(number)`, `setReducedMotion(boolean)`, `setTouchControlSize(string)`, `startGame()`, `openGameSettings()`, `closeGameSettings()`, `getAcceptanceTests()`, `runAcceptanceTest(id)`, `runAcceptanceSuite()`, `getReplayCases()`, `runReplayCase(id)`, and `runReplaySuite()` plus matching DOM bridge commands, so the one-file artifact remains independently testable offline.

After the real browser playtest, render the complete visual review and pass its receipts unchanged into verification:

```js
const evidence = await api.run({ op: "capture_visual_review" });
if (!evidence.ok) throw new Error(evidence.error);
const review = await api.run({ op: "get_visual_review" });
const verified = await api.run({ op: "verify_iteration", evidenceRefs: evidence.evidenceRefs });
if (!verified.ok) throw new Error(verified.error);
await api.run({ op: "promote_iteration" });
```

The visible **Generate game** button automatically runs that browser evidence and verification sequence whenever the companion returns an accepted candidate. The button remains busy as **Testing candidate…** until the gate finishes, and the live console records `verification.automatic.started`, `.completed`, or `.failed`. A failed gate never discards the accepted build and never fabricates a verified state; it leaves the candidate unverified, opens Project Doctor, and gives the user or AI a concrete repair target. Promotion remains manual.

Headless browser clients should use the same one-call lifecycle rather than duplicating UI clicks:

```js
const qa = await api.run({ op: "run_post_generation_qa" });
if (!qa.ok) throw new Error(qa.error); // accepted source remains available and unverified on failure
// qa includes the verified project, evidenceRefs, counts, and source/Doctor digests
```

The companion and CLI expose `nextRequiredAction`: `none` when nothing changed, `run-browser-qa` for an accepted candidate without browser evidence, and `promote-or-export` after verification. A browser generation consumes `run-browser-qa` automatically; a CLI-only loop cannot manufacture browser screenshots and must leave that action pending.

Project Doctor now keeps technical status separate from measured visual readiness. Use:

```js
const visual = await api.run({ op: "get_visual_readiness" });
if (visual.visualReadiness.status === "needs-art-pass") {
  // Feed the failed check details into the next Art Director / asset pass.
}
```

For a directed generated game, this source-derived report checks four things the builder can prove without pretending to have taste: at least 75% primary gameplay-art coverage; one intentional multi-frame player identity across maps; shared style/art-direction/palette metadata; and source-bound palette, shared-scale, and ground-anchor proof for player or animated sprites. Failed checks are Project Doctor asset warnings, lower the loop score, and give the next generation pass concrete repair targets. The report status `measurably-ready` is deliberately narrower than “good-looking”: it does not judge composition, silhouette appeal, originality, environment storytelling, animation charm, or overall taste. Those require inspection of the actual visual-review images by the Art Director role, a vision-capable provider, or the user.

Evidence is not a label or free-form note. The browser collector first runs deterministic movement, map-load, depth-order, exact portal-spawn, and fresh-interaction checks. It then enters clean play mode, disables editor overlays, loads every authored map under every configured device profile, captures the displayed canvas at the profile capture scale, and records responsive HUD/touch measurements. The gate asserts the full map × profile matrix rather than a screenshot count. Desktop profiles must hide touch controls; touch profiles must expose contained controls with the configured minimum target size.

Every receipt carries the current Doctor `sourceDigest`, `mapId`/`profileId` where applicable, SHA-256, rendered bounds, and both `targetViewport` and the actual browser `viewport`. The target is an honest in-app simulation; it is never reported as if the browser window had been resized. `#looplab-visual-review-state` and `get_visual_review` expose receipt metadata without image bytes. Use `select_visual_review_capture` to open one review image; pass `includeThumbnails: true` to `get_visual_review` only when a headless client truly needs all ephemeral thumbnails. Screenshot data URLs are never written into the editable project or one-file export.

Empty arrays, legacy strings, failed checks, incomplete map/profile pairs, missing responsive profiles, and stale digests are rejected during verification, promotion, and final export. A protocol-1 legacy verification may still be opened as history, but it is stale for promotion/export until the matrix is recollected.

Do not promote when:

- a new blocker exists;
- a feature contract has dirty dependencies;
- a portal target or spawn is invalid;
- collision, support z, anchors, depth, routes, or culling disagree;
- sprite invariants drift;
- controls are ambiguous or missing linked animation/onboarding/replay state;
- replay hashes unintentionally change;
- tests use brittle global counts or ran against another build;
- the release has external requests, stale output, debug markers, offline/CSP failures, or exceeds its byte budget;
- required device, HUD, touch, reduced-motion, focus, audio, or accessibility evidence is missing.

Verification stores the Doctor digest and structured evidence receipts. Promotion must rerun Doctor, compare the digest, and revalidate the receipts. Any later authoring change starts a child candidate and invalidates the previous verification. A CLI loop can accept a Doctor-clean, deterministic-runtime-tested candidate, but it must remain `candidate` until a real browser collects screenshot evidence and `verify_iteration` succeeds.

## Loop strategies

Every LoopLab/Codex loop starts by identifying the current pass's highest-value uncertainty. Research is adaptive rather than tied to one button, fixed topic, or predetermined list: any creative, technical, product, workflow, tooling, documentation, licensing, security, cost, usability, architecture, performance, accessibility, testing, or unforeseen question that affects the outcome is eligible. When external evidence can materially improve the result, use the best available research path, implement supported findings in the same loop, and run the relevant verification gates. A research report is not the stopping point. Reject poorly supported suggestions, protected-baseline regressions, and any proposal that turns the 2D builder into a 3D product.

### Frozen cross-genre acceptance profile

Every build and loop uses `evaluationProfile: "auto" | "general" | "platformer" | "top-down" | "connected-world" | "systems"`. An explicit profile wins. `auto` selects once from the starting authored project—connected maps or campaign promise, deterministic gameplay program, then control mode—and remains frozen for every before/after comparison. The candidate cannot choose or change its own grader.

The receipt separates named `integrity`, `playability`, `evidence`, `world`, `campaign`, `systems`, and `presentation` dimensions from independent hard gates. A candidate is eligible only when its schema remains valid, Doctor/spatial/acceptance/replay/completion/input/join/gameplay-program gates do not regress, no applicable dimension falls, and the configured aggregate minimum delta is met. `presentation` is explicitly a measurable asset/label/pipeline-readiness proxy. The receipt records `aestheticApproval: "not-claimed"` and `funApproval: "not-claimed"`; browser playtest and human visual judgment remain separate.

```js
await api.run({ op: "configure_director", loop: { evaluationProfile: "systems" } });
await api.run({ op: "start_ai_build", evaluationProfile: "systems" });
```

Direct durable-terminal form: `npm run loop -- --provider codex --project game.loop.json --iterations 5 --evaluation-profile systems --goal "Improve the authored systems game"`.

### Improve

Each accepted candidate becomes the next parent. Rejected candidates remain evidence but never replace the best verified project.

### Explore

Generate alternatives from the current best verified parent. Compare the same frozen-profile dimensions and Doctor reports, then preview and play the viable candidates. Preserve variants, but continue only from the explicitly chosen regression-free candidate; LoopLab never turns a technical score into an automatic creative winner.

### Cycle

Focus on one condition per pass. Mark a condition satisfied only when its pass is accepted. Stop after all conditions, the score target, the iteration cap, or a genuine blocker.

### Provider context budget and bounded passes

Every generation job preflights its compact provider context. `POST /jobs` and headless `start_ai_build` accept `contextBudgetTokens`; the default is 96,000 rough tokens and the supported range is 8,000–200,000. Use 32k for narrow repairs, 64k for ordinary work, 96k for complex builds, and 120k–200k only when authoritative project and acceptance truth genuinely requires it. The estimate is character count divided by four and is planning evidence only. Completed provider receipts remain the only usage and dollar evidence.

A headless `start_ai_build.provider` value is authoritative for that job. LoopLab checks readiness for that exact provider and forwards it through the queued request, console receipt, companion payload, and returned job receipt; it never substitutes the provider currently selected in the mouse UI. Omit the field only when intentionally inheriting the visible selection.

LoopLab emits a content-light `looplab-provider-pass-plan/v1` receipt before any model call. Multiple explicit conditions become ordered dependent passes. Oversized multi-map work becomes complete selected-map passes followed by a runtime-join projection containing portals, spawns, and nearby landing-clearance geometry. Root-level active-map mirrors are omitted because `maps[]` is authoritative. If a scoped context still exceeds budget, `provider.context.blocked` occurs before `provider.requested`; no model ran and no usage may be claimed. Never raise the budget or truncate collision, replay, acceptance, or map truth to make a request fit.

OpenAI API requests put the stable developer instruction before dynamic project input and derive `prompt_cache_key` only from that non-private prefix. GPT-5.6-family and later models receive an explicit prefix breakpoint; older models do not receive unsupported breakpoint fields. Only measured cached/cache-write token fields prove cache behavior or savings.

## Iteration ledger and safe restore

Do not treat the live console as version history. Accepted passes, rejected attempts, verification, and promotion write bounded receipts into `iterationHistory`; restorable states also receive deduplicated snapshots in `iterationArchive`. Every provider-loop receipt records the exact frozen profile/digest, dimension vector, hard-gate comparison, Project Doctor `sourceDigest`, score type, Doctor score, blocker/warning counts, parent, condition, and outcome. The archive keeps at most 12 snapshots and 50 receipts so an editable handoff survives reloads without growing forever.

Use the browser bridge or generic CLI apply command:

```js
const ledger = await api.run({ op: "get_iteration_history" });
const comparison = await api.run({ op: "compare_iterations", ids: ["iteration-001", "iteration-002"] });
const restored = await api.run({ op: "restore_iteration", id: "iteration-001" });
```

`compare_iterations` returns `looplab-candidate-decision/v1` on every surface. Hard gates constrain feasibility; matching frozen-profile dimensions can establish `first-dominates`, `second-dominates`, `tradeoff`, or `equivalent`. Missing, stale, or mismatched receipts produce `insufficient-evidence`. `automaticWinner` is always `null` for this contract. A dominance result is technical evidence, not a claim about fun or art quality. Review the supplied play-feel, pacing, visual-composition, player-clarity, and overall-preference prompts, then explicitly keep the current candidate or restore the selected historical candidate as a new child.

Codex and Claude receive this exact packet through the same canonical command; neither provider gets a private ranking rule. If they reach different creative judgments, preserve the provider-attributed rationale and let the user's stated vision decide which source-bound snapshot continues.

Direct CLI shortcuts are also available:

```powershell
npm run agent -- iterations game.loop.json
npm run agent -- compare-iterations game.loop.json iteration-001 iteration-002
npm run agent -- restore-iteration game.loop.json iteration-001 --as=restored-layout
```

Only current or snapshotted entries can be compared or restored; rejected attempts retain evidence but no project snapshot. Restore never mutates the historical version. It checkpoints the current workspace, reconstructs the selected source including embedded assets, and creates a new unverified child candidate. Preview and verify that child again before promotion. The snapshot archive stays in the authoritative `.loop.json` handoff and is deliberately omitted from the shipped one-file HTML; lightweight iteration receipts may remain as provenance.

## Sprite and palette contract

- Use light neutral grey `#d9d9d9` only as a temporary game-art review/keying matte, then remove it to transparent alpha; it is not a required game color or style. Green and `#00ff00` are forbidden generation mattes.
- Lock an approved palette across the entire strip.
- Normalize frames with nearest-neighbor scaling and a shared bottom-center/ground anchor.
- Pack equal-size atlas slots and detect transparent gaps.
- Reject identity, silhouette, equipment, palette, character-count, anchor, or alpha-edge drift.
- Report encoded PNG bytes separately from decoded RGBA memory (`sheet width × sheet height × 4`).
- Runtime collision remains authored map data.

## Visual-first build loop

The AI owns the complete pass; user tweaks are optional. For each iteration: import or read the authored project, inspect every map tab, run Doctor, attach floor-standing objects, generate or normalize art, enter deterministic preview mode, capture the complete map × device visual matrix, inspect collision/support/depth overlays, playtest with Playwright, rerun Doctor, and preserve the strongest verified candidate. A numeric score without rendered evidence is not enough.

### Grounded AI visual critique requires per-job consent

`capture_visual_review` is local inspection. Sending any of its pixels to OpenAI API, Anthropic API, Codex CLI, or Claude CLI is a separate operation with a separate consent boundary. Before calling `start_visual_critique`, show or otherwise identify the exact current capture IDs and obtain explicit user approval for that one submission. A general request to use LoopLab, a prior critique, a selected provider, or an earlier capture is not consent. Never set `consent: true` on the user's behalf.

```js
const visualReview = await api.run({ op: "capture_visual_review" });
const exactCaptureIds = visualReview.visualReview.captures.map((capture) => capture.id).slice(0, 8);

if (!userApprovedTheseExactCaptureIds) {
  throw new Error("Visual critique requires explicit approval for this exact capture set.");
}

const started = await api.run({
  op: "start_visual_critique",
  provider: "codex",
  providerMode: "fallback",
  consent: true,
  captureIds: exactCaptureIds,
});

const jobId = started.job?.jobId ?? started.jobId;
let observed;
do {
  observed = await api.run({ op: "get_visual_critique_job", jobId, includeResult: true });
  if (!["completed", "failed", "cancelled"].includes(observed.job?.status)) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
} while (!["completed", "failed", "cancelled"].includes(observed.job?.status));

const current = await api.run({ op: "get_visual_critique" });
```

Retain and monitor the returned job ID; never submit another critique merely because a caller timed out. Use `cancel_visual_critique_job` only for that exact job. The companion accepts no more than eight captures, 4 MiB per capture, 16 MiB total, and 4096 pixels on either axis. It decodes and re-hashes PNG, JPEG, or WebP bytes, isolates temporary files, deletes them when the job reaches a terminal state, and serializes no image bytes in status, events, results, project state, exports, or documentation.

Read the byte-free current state from `#looplab-visual-critique-state` when a DOM snapshot is cheaper than another command. Every observation, strength, dimension, and issue must cite submitted capture IDs. A source-digest change, different capture set, or changed capture hash makes the critique stale. The result is advisory working context only: it cannot mutate a project, own collision, satisfy Doctor/replay/acceptance/browser/release evidence, select an automatic winner, or prove aesthetic quality. Turn accepted observations into an ordinary protected variation, preview the exact changes, and run the independent gates again.

## Playtest evidence

After implementation:

1. Use Playwright browser automation to boot the first actionable view. Use an equivalent browser driver only when Playwright is unavailable, and record that substitution.
2. Exercise every changed verb.
3. Test portal/scene transitions and respawn/goal state.
4. Run `capture_visual_review`; every authored map × configured device profile must have a clean-play screenshot receipt.
5. Review HUD/playfield obstruction independently from renderer correctness.
6. Test desktop, small laptop, 390×844 portrait, DPR2, safe areas, keyboard, touch, pause/focus, and reduced motion as applicable.
7. Keep frame pacing, render CPU, draw calls, asset loading, and throttled degradation as separate measurements.

The auto-routed `Playtest & QA · Playwright` workstream owns browser automation, input and transition checks, screenshots, responsive viewport coverage, and HUD/playfield review. A DOM-only assertion is not sufficient evidence for canvas or WebGL changes.

### Deterministic editor-preview control

Use the same canonical runtime that the editor canvas uses. Enter play mode with `{ op: "set_mode", mode: "play", focus: true }`; focused Preview hides the Director, Doctor, map tabs, and rule strip so browser input and screenshots evaluate the game rather than editor chrome. Pass `focus: false` when panel context is part of the test. `get_preview_state.workspace` reports the active focus state and viewport preset. Then wait until `get_preview_state` succeeds, pause real-time animation, reset, apply input, and advance an exact interval. `preview_step` requires a paused preview, subdivides up to 1,000 ms into 60 Hz simulation steps, and returns the resulting objects and events.

```js
await api.run({ op: "set_mode", mode: "play", focus: true });
await new Promise((resolve) => setTimeout(resolve, 50));
await api.run({ op: "preview_pause" });
await api.run({ op: "preview_reset" });
const before = await api.run({ op: "get_preview_state" });
await api.run({ op: "preview_input", action: "move-right", pressed: true });
const stepped = await api.run({ op: "preview_step", deltaMs: 200 });
await api.run({ op: "preview_input", action: "move-right", pressed: false });
```

Use `preview_load_map`, `preview_reset`, and fresh press/release pairs for portal setup. Use `preview_resume` only when returning the canvas to real-time player control. Never infer success from a final coordinate alone—inspect returned events so respawn, collection, goal, and map changes cannot masquerade as ordinary movement.

## Exported-game runtime contract

Export with `npm run agent -- export <project.loop.json> <game.html>`. The export command runs the single-file artifact gate before writing and returns `exportReceipt` alongside `artifactAudit`. Recheck any existing or externally moved artifact with `npm run agent -- audit-html <game.html>`. This static audit is a best-effort structural backstop against builder regressions, not a proof against deliberately obfuscated JavaScript; keep zero-request browser monitoring in the release evidence. The authoring project remains the source of truth; do not patch the generated HTML and do not infer collision from generated artwork.

Use `npm run agent -- prepare-export <project.loop.json> [game.html]` for the same compact receipt without writing or printing the HTML artifact.

In the browser bridge, call `{"op":"prepare_export","filename":"my-game.html"}` when you need the compact release receipt without transferring the full HTML through the DOM. Call `export_html` when you need both `html` and `receipt`. A receipt is valid only for the exact authored source identified by `receipt.source.sourceDigest`; compare that value with the current Project Doctor `sourceDigest` after every edit. Never describe a historical receipt as evidence for a changed project. Use `get_release_verification` to inspect the current exact-subject attestation and its validation errors.

Persistence is an explicit export-profile decision. Inspect it with `get_export_profile` and `get_save_report`; change it only through `set_export_profile` with the current `expectedSourceDigest`, so an agent cannot overwrite a newer authoring state. The default `strict` profile remains one-file, offline, network-free, and storage-free; it can embed deterministic, source-bound portable save codes without invoking a browser persistence API. The `hosted` profile remains one-file and network-free but permits exactly LoopLab's declared, versioned, SHA-256-pinned localStorage wrapper for automatic saves under a stable HTTP(S) origin. Project Doctor and the artifact audit reject any other storage implementation, a duplicate wrapper, a modified wrapper, or storage in a strict artifact.

Portable saves include only bounded authored gameplay state: active map and player state, collected IDs, completed rules, declared variables, authored object/path overrides, active choices, and the win state. They deliberately exclude input/replay internals, camera/presentation state, evidence, credentials, provider data, and authoring history. Restore is atomic and source-digest-bound; malformed, oversized, corrupt, or foreign-project codes leave the current runtime unchanged. A checksum detects accidental corruption but is not authentication. Hosted storage denial, an opaque sandbox, `file:` launch, or `SecurityError` must degrade safely to the portable-code path. At runtime use `get_save_status`, `export_save_code`, `inspect_save_code`, and `import_save_code`; hosted artifacts additionally support `persist_hosted_save` and `clear_hosted_save`.

The visible Export drawer uses the same builder and audit. **Verify exact build** starts a durable local companion job, streams the static-audit and hostile-browser stages into the live console, records the exact SHA-256 attestation only after every required check passes, and reports 0 provider tokens / $0.00. It can be cancelled without claiming a pass. Export downloads the HTML and enables **Open exact build** in a scripts-only in-app sandbox with an opaque origin. Save the adjacent `.loop.json` whenever future editing or AI looping must remain possible; the HTML is the playable release artifact, while the project file is the authoritative editable source.

The exported game is one self-contained, offline-playable HTML file. It embeds the runtime, CSS, every authored map and portal-to-spawn connection, collision data, keyboard/touch controls, project metadata, and every asset selected into the project as a data URL. It must open directly from disk in a modern browser without a server, package install, CDN, provider connection, or Looplab companion. Canvas 2D uses the built-in inline runtime. An explicitly selected Phaser runtime uses LoopLab's pinned Phaser 3.90.0 browser build as an inline script; the static audit checks its exact SHA-256 and the hostile browser harness rejects any actual external request. PixiJS and melonJS patterns are available to the decision and native-capability layer, but their engine exports remain blocked until an inline UMD/IIFE or tree-shaken IIFE adapter respectively passes the same gates. Module-only or network-loaded engine paths are release blockers. The larger installed CC0 library remains a builder resource; only chosen project assets belong in the exported game.

When production Doctor is blocked only by `offline-unverified`, run `npm run agent -- verify-release <project.loop.json> <game.html> --captures=.looplab/release-game`. This single canonical operation builds the exact verification subject, runs the static one-file audit and the complete 1,200-frame hostile-browser policy, writes the passed HTML, and atomically records `releaseVerification` in the editable project. The attestation binds the Project Doctor source digest, runtime/verifier/policy versions, required check results, input-receipt digests, and exact HTML SHA-256. A loose `release.offlineVerified` Boolean is never authority. Afterward collect current editor evidence, run `verify_iteration`, and export normally; lifecycle/evidence metadata is deliberately excluded from shipped runtime bytes, so the final exporter must reproduce the attested SHA-256 exactly.

Headless browser callers use `{"op":"verify_release","filename":"game.html","wait":false}` once, retain its job ID, inspect it with `get_release_verification_job`, and resume that exact ID with `{"op":"verify_release","jobId":"…","wait":true}`. Do not resubmit while it is running. `cancel_release_verification_job` closes the browser harness and leaves the project unchanged. Before applying a completed result, LoopLab rechecks the selected project's source digest and reproduces the final exporter bytes; a stale or byte-different result is rejected. This is a local digest-bound integrity receipt rooted in the trusted LoopLab runner, not a public signature against malicious project-JSON forgery.

The artifact gate inspects the generated bytes rather than trusting project flags. It requires one complete document, compiles each executable inline script without running it, rejects linked scripts/media/CSS, module imports, runtime network and persistent-storage calls, unembedded selected assets, and credential-shaped values, then reports HTML bytes, embedded payload bytes, and decoded RGBA image memory. The browser playtest remains a separate required gate because static inspection cannot prove gameplay feel, rendering, input, or transitions.

### Hostile platform emulation

For diagnostic runs against an existing artifact, run the exact exported bytes through the platform harness:

```powershell
npm run agent -- platform-harness game.loop.json game.html
```

The canonical run launches an installed Chrome or Edge through `playwright-core`, embeds the artifact in an opaque `sandbox="allow-scripts"` iframe under an inline-only CSP, rejects `AudioContext.resume()`, verifies the source-bound executable consumer graph, round-trips a source-bound portable save when enabled, requires a hosted profile to degrade safely when opaque-origin storage is blocked, exercises a real focused authored key binding, presses and releases every declared semantic action, steals focus and verifies every held input clears, steps 1,200 exact 16 ms frames with malformed input every eighth frame, runs the exported replay and acceptance suites, replays the source-bound completion witness inside the exact exported runtime, requires a reached terminal state, and observes all browser errors and dynamic external requests. It returns `looplab-platform-harness/v1`: Project Doctor-style findings bound to `sourceDigest` and the artifact SHA-256. Missing browser support is a failed actionable receipt, never a VM-only pass. This diagnostic command does not by itself mutate the project or create release authority; use `verify-release` for the canonical attestation workflow. Use `npm run harness:platform -- game.html` only when no editable project is available. Detailed research evidence is retained in the private local research archive rather than the public repository.

When Codex, Claude, or a human reviewer needs visual evidence, use the Browser Harness rather than attempting to automate a `file:///` URL:

```powershell
npm run agent -- browser-harness game.loop.json game.html --captures=.looplab/browser-game
```

It performs the same hostile platform checks and additionally writes `initial.png` and `final.png`, returning each PNG path and SHA-256 plus bounded DOM summaries of visible text, dialogs, controls, canvases, focus, and viewport. Agents must inspect those artifacts instead of inferring visual quality from a passing runtime receipt. For an interactive session, run `npm run preview:browser -- game.html`; LoopLab prints an unguessable per-run `gameUrl` and `harnessUrl`, binds only to loopback on an ephemeral port, disables caching, and blocks runtime network access with CSP. Keep that process alive while the browser is attached, then stop it. The standalone game still opens directly from disk for players; localhost exists only as a safe automation and review transport.

melonJS source and releases may be evaluated from its official repository. Awesome Canvas is a discovery catalog only: do not copy its list wholesale or assume linked projects share the catalog's own license. Inspect the original linked repository/site and verify its current license before adopting any implementation.

In the exported game, wait for `looplab-runtime-ready`, then read `window.looplabRuntime` when the page allows new window globals. Runtime API 2.28 also provides a hardened DOM transport for automation sandboxes where that global is unavailable: dispatch `looplab:runtime-command` on `document` and await `looplab:runtime-response`, or open `#looplab-runtime-bridge`, fill `#looplab-runtime-command`, activate `#looplab-runtime-submit`, and read `#looplab-runtime-result`. Read `getSourceDigest()` or send `get_source_digest` before accepting any browser receipt for the artifact; read `getCollisionGeometry()` / `get_collision_geometry` for the active map-owned chain and tile-collision source; read `getTileProgram()` / `get_tile_program` and `getTileRuntime()` / `get_tile_runtime` for canonical tile source and compiled render/collision inspection; read `getRuntimeAdapterInfo()` / `get_runtime_adapter` to prove which primary adapter and pinned vendor version actually booted; use `getInputActionLiveness()` / `get_input_action_liveness` for its exact consumer report, `getCompletionReport()` / `get_completion_report` for its source-bound terminal witness, `getCombatState()` / `get_combat_state` for deterministic health, teams, emitters, and fixed projectile slots, `getActorStates()` / `get_actor_states` for deterministic route, perception, transition, target, and blocker state, and `getNarrativeContract()` / `get_narrative_contract` plus `getNarrativeReport()` / `get_narrative_report` for story structure and current proof; use `getPresentationProgram()` / `get_presentation_program`, `getPresentationReport()` / `get_presentation_report`, `getPresentationStatus()` / `get_presentation_status`, and `setAudioMuted(boolean)` / `set_audio_muted` for event-driven sound and motion. Use `getGameShell()` / `get_game_shell`, `getGameShellReport()` / `get_game_shell_report`, and `getGameShellState()` / `get_game_shell_state` for the authored player lifecycle; control it with `startGame()` / `start_game`, `pause`, `resume`, `restart`, `openGameSettings()` / `open_game_settings`, `closeGameSettings()` / `close_game_settings`, and the explicit preference setters.

```js
await page.locator("#looplab-runtime-bridge > summary").click();
await page.locator("#looplab-runtime-command").fill(JSON.stringify({ op: "pause" }));
await page.locator("#looplab-runtime-submit").click();
await page.locator("#looplab-runtime-command").fill(JSON.stringify({ op: "set_input", action: "move-right", pressed: true }));
await page.locator("#looplab-runtime-submit").click();
await page.locator("#looplab-runtime-command").fill(JSON.stringify({ op: "step", deltaMs: 500 }));
await page.locator("#looplab-runtime-submit").click();
const stepped = JSON.parse(await page.locator("#looplab-runtime-result").inputValue());
```

The runtime exposes:

- `getState()` for the active map, player transform, score, pause state, persistent collectibles, and transition state;
- `getCompletionReport()` for the source-bound terminal target, proof status, search coverage, and semantic-action witness;
- `getObjects()`, `getTraversalPaths()`, `getNavigation()`, `getRuntimeJoinPlan()`, and `getCollisionBox(id)` for authored geometry, layered routes, and enabled transition-capture contracts;
- `setInput(action, pressed)` and `step(deltaMs)` for deterministic headless input and simulation;
- `loadMap(mapId, spawnId)`, `reset()`, `pause()`, and `resume()` for deterministic test setup;
- `getGameShell()`, `getGameShellReport()`, `getGameShellState()`, `startGame()`, `restart()`, `openGameSettings()`, `closeGameSettings()`, `setAudioMuted()`, `setMasterVolume()`, `setReducedMotion()`, and `setTouchControlSize()` for player-facing lifecycle and accessibility checks.

DOM command names are the snake-case equivalents: `get_completion_report`, `get_state`, `get_objects`, `get_traversal_paths`, `get_navigation`, `get_runtime_join_plan`, `get_collision_geometry`, `get_tile_program`, `get_tile_runtime`, `get_collision_box`, `get_game_shell`, `get_game_shell_report`, `get_game_shell_state`, `set_input`, `step`, `reset`, `load_map`, `start_game`, `pause`, `resume`, `restart`, `open_game_settings`, `close_game_settings`, `set_audio_muted`, `set_master_volume`, `set_reduced_motion`, and `set_touch_control_size`.

For every affected export, verify linked-map portals and target spawns, explicit collider offsets, ground anchors, z-separated high routes and underpasses, deterministic depth slices, persistent collection state, hazards/goals, keyboard controls, touch controls, page-visibility pause, focus, reduced motion, and zero unexpected external requests. A held interaction must not bounce between portals: each portal entry requires a fresh E/LOCK press.

## Completion response

Report:

- candidate and parent iteration IDs;
- user condition addressed;
- commands and systems changed;
- before/after quality and Doctor digests;
- rejected regressions, if any;
- playtest/replay/device/package evidence;
- whether the candidate is candidate, verified, or promoted;
- next unsatisfied condition.

Never describe an unrun check as passed.
