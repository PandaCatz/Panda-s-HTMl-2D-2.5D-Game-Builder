Exit code: 0
Wall time: 0.3 seconds
Output:
Exit code: 0
Wall time: 0.3 seconds
Output:
# LoopLab MCP setup for Codex and Claude

LoopLab exposes its canonical authoring commands as first-class local MCP tools. The server is generated from the same `commandContracts` embedded in `public/agent-manifest.json`; it does not maintain a separate command list.

The MCP transport is additive. The CLI, `window.looplabAgent`, DOM bridge, local companion, Project Doctor, replay gates, and one-file exporter remain authoritative.

## Choose a surface

### Core file surface

Use this for deterministic work on editable `*.loop.json` files. Every path is restricted to the configured workspace. Gameplay mutations require the current Project Doctor `expectedSourceDigest`. Shared-work mutations instead require the independent `expectedLedgerDigest` returned by `get_work_ledger`. Both validate the result and replace the project atomically.

```powershell
node H:\path\to\LoopLab\scripts\looplab-mcp.mjs --surface=core --workspace=H:\path\to\your-games
```

Start with `get_agent_changes`. Pass the caller's last opaque cursor and follow `nextCursor` while `hasMore`, or omit the cursor once to establish a bookmark. An expired or foreign cursor returns `resyncRequired`; it never masquerades as an empty delta. Then call `get_agent_brief`, not `get_project`, unless complete embedded project data is actually needed. The brief includes compact relevant Agent Playbook references, bounded active shared work, and two source-identical Doctor summaries: `readiness.current` for the active authoring profile and `readiness.release` for the production target. Never treat a passing prototype/current profile as release readiness. Next call `get_project_context` with `view: "campaign"`, or use `view: "map"` plus stable `mapIds` for exact sanitized map documents. Every pack carries the Project Doctor source digest, the same dual-profile readiness index, and explicit omissions; it is orientation only, not mutation input or evidence. Use `draft_agent_plan` to convert the bounded intent into a provider-free, non-executing plan against that source. Treat its coverage ledger and ordered phases as authoritative, review exact contracts and source lineage, and confirm every detected requirement is accounted for before authoring. Read `looplab://agent-guide-index` to retrieve only the relevant invariant, lifecycle step, recovery signal, or section anchor before opening `looplab://agent-guide`; the index is generated from and digest-bound to the canonical guide. Use `list_agent_recipes` and `get_agent_recipe` for exact read-only guidance, and `get_work_ledger` for the current Codex/Claude claim state.

The browser MCP surface defaults every command to `compact:true` and removes the redundant outer embedded-project payload. Compact plans also reference command schemas, macros, recipes, and guide navigation in `looplab://manifest`, `looplab://agent-playbook`, and `looplab://agent-guide-index` instead of repeating those registries inline. The browser-only `get_agent_guide_index` tool mirrors the same bounded lookup for bridge parity. Explicitly request `compact:false` only when complete data is genuinely required; prefer the deliberate `get_project` operation for full state. This default applies to reads as well as mutations so planning and verification do not consume context merely because a caller omitted an optimization flag.

### Live browser surface

Use this for project-library selection, Game Director/provider work, visual review, preview input, asset jobs, and every other browser-session command. Start LoopLab first; MCP launches a private persistent Playwright page and calls the same browser bridge as the UI.

```powershell
node H:\path\to\LoopLab\scripts\looplab-mcp.mjs --surface=browser --app-url=http://127.0.0.1:3000/
```

The URL must be loopback HTTP. The server rejects remote hosts and requires the running app's protocol version to exactly match its own.

The live profile mounts the companion-owned `.looplab/projects/` store. Start with `list_shared_projects`, then `mount_shared_project` for the intended stable ID. The browser cache is recoverable state, not authority. `sourceDigest` covers Doctor/gameplay truth; `revisionDigest` covers the complete stored document. After mutation, `save_shared_project` requires the latest `expectedRevisionDigest`; new IDs require `createOnly:true`. On 412, preserve the draft, call `preview_shared_project_rebase` with exact base/remote revisions, resolve all reported conflicts, apply only the unchanged digest-bound receipt, run gates, then save explicitly against its returned remote revision.

The CLI shares the same bytes through `npm run agent -- projects`, `select-project`, and `publish-project`. Project summaries omit full objectives and embedded payloads. Companion metadata stays in a separate `metadata.json` and cannot alter Project Doctor, provider input, gameplay source, or exports.

## Claude Code

LoopLab ships an idempotent JSON setup/status command. User scope is private and makes both profiles available to Claude across game projects without storing provider credentials:

```powershell
npm run claude:status
npm run claude:setup -- "H:\path\to\your-games"
npm run claude:smoke -- "H:\path\to\your-games"
claude mcp list
```

Status is read-only and distinguishes registration, MCP-process connectivity, and actual editor readiness. It verifies each profile's exact scope, executable, arguments, configured workspace or app URL, and the byte identity of Claude's private cross-project LoopLab skill. When both stdio servers appear connected, status independently fetches `<app-url>/agent-manifest.json` and requires the exact current protocol; a green MCP process can no longer hide a stopped or stale editor. Setup reconciles stale definitions as well as missing ones and atomically synchronizes that user-level skill from the repository-owned source. `looplab-live` may be correctly registered while the app is stopped; start LoopLab instead of reinstalling it.

The smoke command is the executable Claude-operability proof. Its public npm form uses a positional games root because Windows npm can consume arbitrary named run-script options; direct Node invocation still accepts `--games-root=...`. Before provider launch it runs the same live manifest preflight, so an offline/stale app returns an exact 0-token/$0.00 receipt. A ready run creates a temporary blank template inside the configured core workspace plus a temporary MCP config. That config starts `looplab-core` with only `get_agent_brief` and `looplab-live` with only `list_agent_recipes`; Claude receives `--strict-mcp-config`, so installed user/project MCP catalogs are ignored instead of consuming context. The one nonpersistent session reads only the synthetic fixture and one bounded public recipe query, launches with exact `claude-opus-5` and `--effort max`, defaults to a $1 CLI budget cap, and deletes the fixture/config on every terminal path. It does not send a user project brief, shared-project catalog, provider transcript, asset, or credential. Success requires both real tool-use events, current core-file/browser-session envelopes, exact protocol versions, schema-bound output, and measured tokens/dollars. Monitor the one process instead of resubmitting it after a caller timeout.

Current model policy: the launch target is exact `claude-opus-5` with `--effort max`, including the smoke. This supersedes the older alias wording in the preceding paragraph. Visual critique uses Opus 5 unless `LOOPLAB_VISUAL_CRITIQUE_MODEL_BENCHMARK` points to a content-verified matched receipt proving an exact Sonnet model performs better; a bare digest does not qualify.

The official Claude CLI equivalents are below. Claude options precede the server name, and `--` separates them from LoopLab's arguments:

```powershell
claude mcp add --transport stdio --scope user looplab-core -- node "H:\path\to\LoopLab\scripts\looplab-mcp.mjs" --surface=core "--workspace=H:\path\to\your-games"
claude mcp add --transport stdio --scope user looplab-live -- node "H:\path\to\LoopLab\scripts\looplab-mcp.mjs" --surface=browser --app-url=http://127.0.0.1:3000/
```

Project scope is supported by Claude, but checked-in `.mcp.json` servers require one-time trust approval and machine-specific absolute paths are fragile on Windows. LoopLab therefore uses private user scope as its primary cross-project setup path.

## Codex

Add the servers to Codex's `config.toml` with Windows paths written using forward slashes:

```toml
[mcp_servers.looplab_core]
command = "node"
args = ["H:/path/to/LoopLab/scripts/looplab-mcp.mjs", "--surface=core", "--workspace=H:/path/to/your-games"]
startup_timeout_sec = 30
tool_timeout_sec = 120

[mcp_servers.looplab_live]
command = "node"
args = ["H:/path/to/LoopLab/scripts/looplab-mcp.mjs", "--surface=browser", "--app-url=http://127.0.0.1:3000/"]
startup_timeout_sec = 45
tool_timeout_sec = 300
```

Restart Codex after changing MCP configuration. Keep the core and live profiles separate: their server-name prefixes make the transport and state ownership explicit to the agent.

## Agent workflow

1. In the live profile, call `list_shared_projects` and `mount_shared_project` for the intended shared ID, then use `list_projects` to reconcile any browser-only draft/import. In the core profile, supply the workspace-relative `projectPath`, or use the shared-store CLI commands above.
2. Call `get_agent_changes` with the last stored cursor, or omit it once to establish the current bookmark. Follow every page. If `resyncRequired` is true, discard cached assumptions and perform the warm start below.
3. Call `get_agent_brief` for the selected project.
4. In the live profile, call `get_agent_presence`, then `register_agent_presence` with one stable caller ID. Retain the opaque lease token locally, renew before the returned heartbeat deadline, and call `leave_agent_presence` when finished. Presence is ephemeral liveness only.
5. Call `get_work_ledger`. Claim matching work before editing; do not duplicate another actor's active lease, and never use presence as a substitute for durable ownership.
6. Call `get_project_context` for the campaign, then request only the stable map IDs needed for this pass. Treat omitted fields as unknown. Use full `get_project` only when necessary.
7. Call `draft_agent_plan` with the bounded intent and exact map scope. Review coverage, ordered phases, retry/resume policy, exact contracts, and missing input. Preserve completed phase evidence, redraft downstream commands after mutation, resume durable jobs by ID, and never replay an applied receipt. Planning never executes, writes, spends provider tokens, or grants authority.
8. Inspect any relevant compact recipe reference. Search with `list_agent_recipes`, then read the exact revision with `get_agent_recipe`; recipes never execute commands.
9. Read Project Doctor and retain `sourceDigest`.
10. Create a variation before risky experimentation.
11. For a proven repeated sequence, call `list_command_macros`, then `preview_command_macro`. Apply only with `apply_command_macro` plus the returned `sourceDigest` and `expansionDigest` when `applicable` is true.
12. For an arbitrary coherent change, call `preview_batch` with the exact current `expectedSourceDigest`, stable-ID commands, and a non-empty summary. Review `applicable`, validation, per-command outcomes, both current/release Doctor deltas, and the canonical `previewDigest`.
13. Apply only by sending the unchanged commands, summary, source digest, and returned preview digest to `apply_previewed_batch`. Any source or plan drift rejects the whole write. Keep `apply_batch` only for legacy callers that deliberately do not use the review receipt.
14. Renew long-running claims. Finish shared work with `update_work_item` and evidence, or use `release_work_item` for a handoff; each uses the latest exact `expectedLedgerDigest`.
15. Re-read the brief/Doctor, run acceptance, completion, replay, runtime-join, and browser evidence gates. Store the latest `currentCursor` for the next session.
16. Export one self-contained offline HTML file only after the exact candidate passes its required gates.
17. Persist accepted shared work with `save_shared_project` and the exact latest full-document revision digest. On 412, preserve the draft and use the explicit preview/apply rebase workflow; do not force an overwrite or auto-save a rebase.

For builder-level regression work, both MCP profiles also expose `list_builder_benchmarks`, `evaluate_builder_benchmark`, and `compare_builder_benchmark_runs`. List the visible task contract first, generate through the ordinary Director/provider workflow, then evaluate the exact selected project. Provider-free receipts are deterministic single observations. Provider-backed comparisons require complete, comparable trial sets and at least three trials for a provisional stochastic claim. Never treat the technical proxy as evidence of fun or aesthetic quality.

## Safety boundaries

- Never place OpenAI or Anthropic keys in MCP configuration, tool arguments, project JSON, or exports.
- The browser surface talks only to a loopback LoopLab app.
- The core surface cannot read or write outside its configured workspace and accepts only `.loop.json` files.
- Generated pixels remain visual source art; authored maps remain the sole collision owner.
- Command macros are immutable built-ins that expand only to canonical core authoring commands. They reject stale source/plan digests and cannot run provider, network, file, export, input, or capture side effects.
- Arbitrary batch preview is also bounded to canonical core authoring commands. It runs on a clone, never persists or grants authority, and excludes provider, browser, coordination, lifecycle, nested macro, and nested batch operations. Exact apply re-creates the preview and requires the same source and preview digests.
- Agent recipes are versioned read-only context. They name canonical commands, stop conditions, and required evidence but cannot execute, mutate, call providers, access secrets, or bypass any command gate. The complete registry is available at `looplab://agent-playbook`.
- Agent intent plans are deterministic read-only artifacts. They bind to one `sourceDigest`, expose a canonical `planDigest`, and become stale when source changes. They never execute, persist, call a provider, or make a later mutation safe by themselves.
- Shared-work entries are bounded coordination metadata, not executable instructions or authorization. They are excluded from provider context, Project Doctor source truth, verification, gameplay undo history, and exported HTML. Never store credentials, session tokens, prompts, responses, reasoning, private keys, or provider transcripts in them.
- Agent change events are bounded resumable orientation, not editable source, verification evidence, or mutation authority. Cursors are opaque. The journal is excluded from provider context and one-file exports and rejects unsupported or credential-shaped metadata.
- Builder benchmark receipts expose raw blockers and exact digests but do not authorize mutation, promotion, or release. Benchmark IDs never alter provider behavior or unlock a privileged generation path.
- This MCP server equips external Codex and Claude sessions that operate LoopLab. LoopLab's own provider subprocesses remain schema-bound, nonpersistent, task-scoped, and MCP-free.
- MCP stdout contains protocol messages only. Diagnostics go to stderr.
