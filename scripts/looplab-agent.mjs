#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  LOOPLAB_PROTOCOL_VERSION,
  applyAgentCommand,
  applyCollectedVerificationEvidence,
  buildStandaloneArtifact,
  buildVerificationHtml,
  createTemplate,
  getAgentManifest,
  invalidateVerifiedAuthoring,
  promoteVerifiedIteration,
  summarizeProject,
  validateProject,
} from "../lib/looplab-agent-core.mjs";
import { SPRITE_KIND_NAMES, SPRITE_PALETTE_NAMES, TILE_THEME_NAMES, generateSpritePixels, generateTilesetPixels } from "../lib/looplab-pixel-generator.mjs";
import { encodePng } from "../lib/png-node.mjs";
import { authoredColliderForPlacement, visualBoundsForAsset } from "../lib/looplab-authored-collision.mjs";
import { analyzeProject, doctorSourceDigest } from "../lib/looplab-doctor.mjs";
import { routeGameStudioWork } from "../lib/looplab-capability-router.mjs";
import { listInstalledAssetPacks, listInstalledPackAssets, loadInstalledPackAssets } from "../lib/looplab-asset-library-node.mjs";
import { auditStandaloneHtml } from "../lib/looplab-single-file-audit.mjs";
import { composeDirectedGameBrief, directedGameSummary } from "../lib/looplab-game-director.mjs";
import { companionSessionHeaders, defaultCompanionSessionFile, readCompanionSession } from "../lib/looplab-companion-session.mjs";
import { runPlatformHarness } from "../lib/looplab-platform-harness.mjs";
import { getAgentRecipe, listAgentRecipes } from "../lib/looplab-agent-playbook.mjs";
import { validateReleaseVerification } from "../lib/looplab-release-verification.mjs";
import { runExactReleaseVerification } from "../lib/looplab-release-verification-runner.mjs";
import { compareBuilderBenchmarkRuns, listBuilderBenchmarks } from "../lib/looplab-builder-benchmark.mjs";
import { getLooplabCommandContract } from "../lib/looplab-agent-contracts.mjs";
import { createAgentJsonlSession } from "../lib/looplab-agent-session.mjs";
import { getSharedProject, listSharedProjects, putSharedProject, sharedProjectIdFromPath } from "../lib/looplab-shared-project-client.mjs";
import { npmArgumentForwardingGuidance, recoverLooplabNpmArguments } from "../lib/looplab-cli-args.mjs";

const [, , operation = "help", ...rawArgs] = process.argv;
const npmArgumentRecovery = recoverLooplabNpmArguments(rawArgs, process.env);
const args = npmArgumentRecovery.args;
const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const COMPANION_URL = process.env.LOOPLAB_COMPANION_URL ?? "http://127.0.0.1:4317";
const COMPANION_SESSION_FILE = process.env.LOOPLAB_COMPANION_SESSION_FILE ?? defaultCompanionSessionFile(projectDirectory);
const sharedReadRevisions = new Map();

async function companionMutationHeaders(headers = {}) {
  const configuredToken = String(process.env.LOOPLAB_COMPANION_TOKEN ?? "").trim();
  const session = configuredToken ? { token: configuredToken } : await readCompanionSession(COMPANION_SESSION_FILE);
  if (!session?.token) throw new Error("The Looplab companion session is unavailable. Start the program with npm run dev, then retry the headless command.");
  return { ...headers, ...companionSessionHeaders(session) };
}

async function companionJson(path, { method = "GET", body } = {}) {
  const headers = await companionMutationHeaders(body === undefined ? {} : { "Content-Type": "application/json" });
  const response = await fetch(`${COMPANION_URL}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let value;
  try { value = await response.json(); }
  catch { value = null; }
  if (!response.ok || !value) throw new Error(value?.error ?? `Looplab companion returned HTTP ${response.status}.`);
  return value;
}

function print(value) {
  const shouldReportForwarding = npmArgumentRecovery.recovered.length > 0 || npmArgumentRecovery.rejected.length > 0;
  const output = shouldReportForwarding && value?.argumentForwarding === undefined
    ? { ...value, argumentForwarding: npmArgumentForwardingGuidance(npmArgumentRecovery) }
    : value;
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

function usage() {
  return {
    ok: true,
    protocolVersion: LOOPLAB_PROTOCOL_VERSION,
    argumentForwarding: npmArgumentForwardingGuidance(npmArgumentRecovery),
    usage: {
      manifest: "npm run agent -- manifest",
      playbook: "npm run agent -- playbook [query] [--tag=collision] [--issue-code=code] [--status=active|deprecated|all] [--limit=20]",
      recipe: "npm run agent -- recipe <recipe-id>",
      macros: "npm run agent -- macros",
      projects: "npm run agent -- projects",
      selectProject: "npm run agent -- select-project <shared-project-id> [--full]",
      publishProject: "npm run agent -- publish-project <project.loop.json> [--id=stable-id] [--create-only|--revision-digest=revision-...]",
      init: "npm run agent -- init <project.loop.json> [blank|platformer|topdown|kinetic|dimetric|systems] [--force]",
      inspect: "npm run agent -- inspect <project.loop.json> [--compact|--full] [--since-digest=source-...]",
      query: "npm run agent -- query <project.loop.json> (--select=maps[0].objects[kind=portal] | --pointer=/maps/0/name [--pointer=/...]) [--full]",
      describeFrame: "npm run agent -- describe-frame <project.loop.json> [--map=id] [--objects=id,id] [--collision] [--max-entries=512] [--max-overlaps=256]",
      simulate: "npm run agent -- simulate <project.loop.json> --ticks=600 [--inputs=[...]] [--inputs-file=tape.json|--inputs-stdin] [--emit=state,events,positions] [--tick-rate=60] [--sample-every=10] [--fixture]",
      session: "npm run agent -- session <project.loop.json> --save-policy=explicit|on-mutation|never < commands.jsonl",
      brief: "npm run agent -- brief <project.loop.json> [--since-digest=source-...] [--since-timestamp=ISO] [--max-findings=8] [--max-actions=5]",
      changes: "npm run agent -- changes <project.loop.json> [--cursor=opaque-bookmark] [--limit=32]",
      plan: "npm run agent -- plan <project.loop.json> <intent> [--macro=id] [--recipe=id] [--maps=id,id] [--parameters-json={...}|--parameters-stdin]",
      context: "npm run agent -- context <project.loop.json> [map-id...] [--view=campaign|map] [--profile=prototype|production] [--limit=24]",
      work: "npm run agent -- work <project.loop.json> [query] [--status=open|in-progress|blocked|landed|rejected|all] [--kind=bug|feature|research|documentation|coordination|all] [--owner=codex] [--limit=50]",
      validate: "npm run agent -- validate <project.loop.json>",
      completion: "npm run agent -- completion <project.loop.json> [prototype|production]",
      botCohorts: "npm run agent -- bot-cohorts <project.loop.json> --source-digest=source-... [--ticks-per-run=720] [--max-runs=24] [--seeds=1,2,3] [--maps=map-a,map-b] [--no-completion-witness]",
      doctor: "npm run agent -- doctor <project.loop.json> [prototype|production]",
      privacy: "npm run agent -- privacy <project.loop.json> [prototype|production]",
      acceptancePlan: "npm run agent -- acceptance-plan <project.loop.json>",
      acceptance: "npm run agent -- acceptance <project.loop.json> [test-id]",
      replay: "npm run agent -- replay <project.loop.json> [case-id]",
      recordReplay: "<replay-case-json> | npm run agent -- record-replay <project.loop.json>",
      route: "npm run agent -- route <project.loop.json> <track> [--framework auto|canvas|phaser|pixi|melon] [--narrative auto|include|exclude] <goal>",
      retryPrompt: "npm run agent -- retry-prompt <project.loop.json> [openai|anthropic|codex|claude]",
      localCopilotStatus: "npm run agent -- local-copilot-status [--refresh]",
      localCopilot: "npm run agent -- local-copilot <project.loop.json> <summarize-context|critique-plan|identify-risks|suggest-next-actions> <task> [--model=id] [--context-json={...}|--context-file=context.json]",
      localCopilotJob: "npm run agent -- local-copilot-job <job-id> [--result]",
      localCopilotCancel: "npm run agent -- local-copilot-cancel <job-id>",
      iterations: "npm run agent -- iterations <project.loop.json>",
      compareIterations: "npm run agent -- compare-iterations <project.loop.json> <first-id> <second-id>",
      feel: "npm run agent -- feel <project.loop.json>",
      tuning: "npm run agent -- tuning <project.loop.json>",
      tuningSuggest: "npm run agent -- tuning-suggest <project.loop.json> [--max-candidates=12]",
      tuningSet: "<tuning-contract-json> | npm run agent -- tuning-set <project.loop.json>",
      tuningSearch: "npm run agent -- tuning-search <project.loop.json> --source-digest=source-...",
      foundations: "npm run agent -- foundations <project.loop.json>",
      foundationSuggest: "npm run agent -- foundation-suggest <project.loop.json> [--max-candidates=5] [--allow-replacement] [--allow-unproven]",
      foundationMaterialize: "<foundation-id/digest-json> | npm run agent -- foundation-materialize <project.loop.json> --source-digest=source-... --allow-replacement [--allow-unproven]",
      scaffold: "npm run agent -- scaffold <project.loop.json>",
      scaffoldSuggest: "npm run agent -- scaffold-suggest <project.loop.json> [--families=quest-network,economy-loop,encounter-progression] [--max-candidates=6] [--allow-replacement]",
      scaffoldSet: "<structural-scaffold-contract-json> | npm run agent -- scaffold-set <project.loop.json>",
      scaffoldSearch: "npm run agent -- scaffold-search <project.loop.json> --source-digest=source-...",
      scaffoldMaterialize: "<candidate-id/digest/slot-values-json> | npm run agent -- scaffold-materialize <project.loop.json> --source-digest=source-...",
      layout: "npm run agent -- layout <project.loop.json>",
      layoutSuggest: "npm run agent -- layout-suggest <project.loop.json> [--map=id] [--max-candidates=6] [--allow-replacement]",
      layoutSet: "<spatial-layout-contract-json> | npm run agent -- layout-set <project.loop.json>",
      layoutRemove: "npm run agent -- layout-remove <project.loop.json>",
      layoutSearch: "npm run agent -- layout-search <project.loop.json> --source-digest=source-...",
      layoutMaterialize: "<candidate-id/digest-json> | npm run agent -- layout-materialize <project.loop.json> --source-digest=source-...",
      restoreIteration: "npm run agent -- restore-iteration <project.loop.json> <iteration-id> [--as=new-id]",
      assetPacks: "npm run agent -- asset-packs [--category=tileset] [--query=town]",
      packAssets: "npm run agent -- pack-assets <pack-id> [--query=hero] [--kind=image] [--limit=120] [--offset=0]",
      importPack: "npm run agent -- import-pack <project.loop.json> <pack-id> <asset-id>... [--frame-width=32] [--frame-height=32] [--frames=8] [--place] [--x=120] [--y=120] [--scale=1]",
      apply: "<command-json> | npm run agent -- apply <project.loop.json>",
      batch: "<command-array-or-jsonl> | npm run agent -- batch <project.loop.json>",
      macroPreview: "<parameters-json> | npm run agent -- macro-preview <project.loop.json> <macro-id>",
      macroApply: "<parameters-json> | npm run agent -- macro-apply <project.loop.json> <macro-id> --source-digest=source-... --expansion-digest=sha256:...",
      batchPreview: "<command-array-or-jsonl> | npm run agent -- batch-preview <project.loop.json> --source-digest=source-... --summary=\"coherent pass\" [--profile=prototype|production]",
      batchApply: "<command-array-or-jsonl> | npm run agent -- batch-apply <project.loop.json> --source-digest=source-... --preview-digest=sha256:... --summary=\"coherent pass\" [--profile=prototype|production]",
      repair: "npm run agent -- repair <project.loop.json> --source-digest=source-... [--codes=code,code] [--max-repairs=16] [--apply --repair-digest=sha256:...]",
      converge: "npm run agent -- converge <project.loop.json> --source-digest=source-... [--codes=code,code] [--max-repairs=16] [--max-passes=3] [--apply --convergence-digest=sha256:...]",
      benchmarks: "npm run agent -- benchmarks [query] [--category=platformer|top-down|connected-world|systems|all] [--limit=24]",
      benchmarkEvaluate: "npm run agent -- benchmark-evaluate <project.loop.json> <benchmark-id> [--run-json={...}|--run-file=run.json] [--output=receipt.json]",
      benchmarkCompare: "npm run agent -- benchmark-compare <baseline-receipt.json> <candidate-receipt.json> [--output=comparison.json]",
      prepareExport: "npm run agent -- prepare-export <project.loop.json> [game.html]",
      export: "npm run agent -- export <project.loop.json> <game.html>",
      exportVerification: "npm run agent -- export-verification <project.loop.json> <candidate.html>",
      releaseVerification: "npm run agent -- release-verification <project.loop.json>",
      verifyRelease: "npm run agent -- verify-release <project.loop.json> <game.html> [--captures=directory] [--frames=1200] [--frame-ms=16] [--browser-channel=chrome] [--executable-path=path]",
      verifyEverything: "npm run agent -- verify-everything <project.loop.json> [game.html] [--captures=directory] [--receipt=receipt.json] [--promote] [--browser-channel=chrome] [--executable-path=path]",
      platformHarness: "npm run agent -- platform-harness <project.loop.json> <game.html> [--frames=1200] [--frame-ms=16] [--browser-channel=chrome] [--executable-path=path]",
      browserHarness: "npm run agent -- browser-harness <project.loop.json> <game.html> [--captures=directory] [--frames=1200] [--frame-ms=16]",
      auditHtml: "npm run agent -- audit-html <game.html>",
      generateTiles: `npm run agent -- generate-tiles <project.loop.json> <tiles.png> [theme=${TILE_THEME_NAMES.join("|")}] [size=16|32|48|64] [seed] [--attach] [--place]`,
      generateSprite: `npm run agent -- generate-sprite <project.loop.json> <sprite.png> [kind=${SPRITE_KIND_NAMES.join("|")}] [size=16|32|48|64] [palette=${SPRITE_PALETTE_NAMES.join("|")}] [seed] [--attach] [--place]`,
    },
  };
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readProject(path, { allowInvalid = false } = {}) {
  const sharedProjectId = sharedProjectIdFromPath(path, { workspaceRoot: projectDirectory });
  if (sharedProjectId) {
    const stored = await getSharedProject(sharedProjectId, { workspaceRoot: projectDirectory, companionUrl: COMPANION_URL, sessionFile: COMPANION_SESSION_FILE });
    sharedReadRevisions.set(resolve(path), stored.revisionDigest);
    return stored.project;
  }
  const text = await readFile(path, "utf8");
  const project = JSON.parse(text);
  const validation = validateProject(project);
  if (!allowInvalid && !validation.valid) throw new Error(`Invalid project: ${validation.errors.join(" ")}`);
  return project;
}

async function writeTextAtomic(path, text) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, text, "utf8");
  await rename(temporaryPath, path);
}

async function writeProject(path, project) {
  const sharedProjectId = sharedProjectIdFromPath(path, { workspaceRoot: projectDirectory });
  if (sharedProjectId) {
    const stored = await putSharedProject(sharedProjectId, project, { workspaceRoot: projectDirectory, companionUrl: COMPANION_URL, sessionFile: COMPANION_SESSION_FILE, expectedRevisionDigest: sharedReadRevisions.get(resolve(path)) });
    sharedReadRevisions.set(resolve(path), stored.revisionDigest);
    return;
  }
  await writeTextAtomic(path, `${JSON.stringify(project, null, 2)}\n`);
}

async function readStdin() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input.trim();
}

function parseCommands(input) {
  if (!input) throw new Error("No command JSON was provided on stdin.");
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object" && typeof parsed.op === "string") return [parsed];
    if (Array.isArray(parsed.commands)) return parsed.commands;
    return [parsed];
  } catch (error) {
    const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) throw error;
    return lines.map((line) => JSON.parse(line));
  }
}

async function requestProviderPrompt(project, command = {}) {
  const provider = ["openai", "anthropic", "codex", "claude"].includes(command.provider) ? command.provider : "openai";
  const current = project.designBrief ?? composeDirectedGameBrief(command);
  const baseBrief = composeDirectedGameBrief({ ...current, ...command });
  const requiredConstraints = Array.isArray(command.requiredConstraints) ? command.requiredConstraints.map((value) => String(value).trim()).filter(Boolean) : directedGameSummary(baseBrief);
  const currentPrompt = typeof command.currentPrompt === "string" && command.currentPrompt.trim() ? command.currentPrompt.trim() : current.composedPrompt ?? baseBrief.composedPrompt;
  const response = await fetch(`${COMPANION_URL}/prompt-drafts`, {
    method: "POST",
    headers: await companionMutationHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      provider,
      userPrompt: baseBrief.userPrompt,
      basePrompt: baseBrief.composedPrompt,
      currentPrompt,
      requiredConstraints,
      attempt: Number(command.attempt ?? 1),
      context: command.context ?? { projectName: project.name, source: "looplab-agent-cli" },
    }),
  });
  const body = await response.json();
  if (!response.ok || !body.draft) throw new Error(body.error ?? "The Looplab companion returned no AI prompt draft.");
  return { baseBrief, draft: { ...body.draft, comparisonPrompt: currentPrompt, requiredConstraints } };
}

async function main() {
  if (npmArgumentRecovery.rejected.length > 0) {
    throw new Error(`npm consumed ${npmArgumentRecovery.rejected.join(", ")}. For safety LoopLab did not recover ${npmArgumentRecovery.rejected.length === 1 ? "this option" : "these options"}; rerun with an extra -- immediately before the first listed option.`);
  }
  if (operation === "help" || operation === "--help" || operation === "-h") {
    print(usage());
    return;
  }

  if (operation === "manifest") {
    print({ ok: true, manifest: getAgentManifest() });
    return;
  }

  const optionValue = (name, fallback = undefined) => {
    const argument = args.find((entry) => entry.startsWith(`--${name}=`));
    return argument ? argument.slice(name.length + 3) : fallback;
  };

  if (operation === "projects" || operation === "list-projects") {
    const value = await listSharedProjects({ workspaceRoot: projectDirectory, companionUrl: COMPANION_URL, sessionFile: COMPANION_SESSION_FILE });
    print({ ok: true, operation, schemaVersion: value.schemaVersion, projects: value.projects, count: value.count, invalidCount: value.invalidCount, policy: value.policy });
    return;
  }

  if (operation === "select-project") {
    const id = args.find((argument) => !argument.startsWith("--"));
    if (!id) throw new Error("select-project requires a stable shared project ID from npm run agent -- projects.");
    const value = await getSharedProject(id, { workspaceRoot: projectDirectory, companionUrl: COMPANION_URL, sessionFile: COMPANION_SESSION_FILE });
    print({ ok: true, operation, selectedProjectId: value.summary.id, projectPath: value.summary.projectPath, sourceDigest: value.sourceDigest, revisionDigest: value.revisionDigest, summary: value.summary, ...(args.includes("--full") ? { project: value.project } : {}) });
    return;
  }

  if (operation === "publish-project") {
    const sourceArgument = args.find((argument) => !argument.startsWith("--"));
    if (!sourceArgument) throw new Error("publish-project requires a validated .loop.json source path.");
    const sourcePath = resolve(sourceArgument);
    const project = await readProject(sourcePath);
    const requestedId = optionValue("id");
    const defaultId = basename(sourcePath).replace(/\.loop\.json$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "shared-project";
    const id = requestedId ?? defaultId;
    const expectedRevisionDigest = optionValue("revision-digest");
    const createOnly = args.includes("--create-only") || !expectedRevisionDigest;
    const stored = await putSharedProject(id, project, {
      workspaceRoot: projectDirectory,
      companionUrl: COMPANION_URL,
      sessionFile: COMPANION_SESSION_FILE,
      expectedRevisionDigest,
      createOnly,
      metadata: { origin: "file", sourceLabel: basename(sourcePath) },
    });
    print({ ok: true, operation, selectedProjectId: stored.summary.id, projectPath: stored.summary.projectPath, sourceDigest: stored.sourceDigest, revisionDigest: stored.revisionDigest, created: stored.created, changed: stored.changed, idempotent: stored.idempotent, summary: stored.summary });
    return;
  }

  if (operation === "local-copilot-status") {
    const query = args.includes("--refresh") ? "?refresh=1" : "";
    const value = await companionJson(`/local-copilot${query}`);
    print({ ok: true, operation, localCopilot: value.localCopilot });
    return;
  }

  if (operation === "local-copilot-job") {
    const jobId = args.find((argument) => !argument.startsWith("--"));
    if (!jobId) throw new Error("local-copilot-job requires a durable job id.");
    const encoded = encodeURIComponent(jobId);
    const job = await companionJson(`/local-copilot/jobs/${encoded}/status`);
    const result = args.includes("--result") && job.status === "completed" ? await companionJson(`/local-copilot/jobs/${encoded}/result`) : null;
    print({ ok: true, operation, job, result, resume: job.status === "running" ? { operation: "local-copilot-job", jobId, includeResult: true } : null });
    return;
  }

  if (operation === "local-copilot-cancel") {
    const jobId = args.find((argument) => !argument.startsWith("--"));
    if (!jobId) throw new Error("local-copilot-cancel requires a durable job id.");
    const result = await companionJson(`/local-copilot/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
    print({ ok: true, operation, ...result });
    return;
  }

  if (operation === "macros") {
    print({ ok: true, operation, registry: getAgentManifest().commandMacros });
    return;
  }

  if (operation === "playbook") {
    const query = args.filter((argument) => !argument.startsWith("--")).join(" ");
    print({ ok: true, operation, registry: listAgentRecipes({
      query,
      tag: optionValue("tag"),
      issueCode: optionValue("issue-code"),
      status: optionValue("status", "active"),
      limit: Number(optionValue("limit", 20)),
    }) });
    return;
  }

  if (operation === "recipe") {
    const recipeId = args.find((argument) => !argument.startsWith("--"));
    if (!recipeId) throw new Error("recipe requires a stable recipe id.");
    print({ ok: true, operation, ...getAgentRecipe(recipeId) });
    return;
  }

  if (operation === "benchmarks" || operation === "benchmark-list") {
    const query = args.filter((argument) => !argument.startsWith("--")).join(" ");
    print({ ok: true, operation, registry: listBuilderBenchmarks({ query, category: optionValue("category", "all"), limit: Number(optionValue("limit", 24)) }) });
    return;
  }

  if (operation === "asset-packs") {
    const result = await listInstalledAssetPacks({ category: optionValue("category"), query: optionValue("query", "") });
    print({ ok: true, operation, ...result });
    return;
  }

  if (operation === "pack-assets") {
    const packId = args.find((argument) => !argument.startsWith("--"));
    if (!packId) throw new Error("pack-assets requires a pack id.");
    const result = await listInstalledPackAssets(packId, {
      query: optionValue("query", ""),
      kind: optionValue("kind", "all"),
      archiveId: optionValue("archive"),
      limit: Number(optionValue("limit", 120)),
      offset: Number(optionValue("offset", 0)),
      includeArchiveOnly: args.includes("--include-archive-only"),
    });
    print({ ok: true, operation, ...result });
    return;
  }

  if (operation === "audit-html") {
    const htmlArgument = args.find((argument) => !argument.startsWith("--"));
    if (!htmlArgument) throw new Error("audit-html requires an HTML file path.");
    const htmlPath = resolve(htmlArgument);
    const audit = auditStandaloneHtml(await readFile(htmlPath, "utf8"));
    print({ ok: audit.valid, operation, htmlPath, audit });
    if (!audit.valid) process.exitCode = 2;
    return;
  }

  if (operation === "benchmark-compare") {
    const baselinePath = args[0] && !args[0].startsWith("--") ? resolve(args[0]) : null;
    const candidatePath = args[1] && !args[1].startsWith("--") ? resolve(args[1]) : null;
    if (!baselinePath || !candidatePath) throw new Error("benchmark-compare requires baseline and candidate receipt JSON files.");
    const readReceiptSet = async (path, preferredKey) => {
      const parsed = JSON.parse(await readFile(path, "utf8"));
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.[preferredKey])) return parsed[preferredKey];
      if (Array.isArray(parsed?.runs)) return parsed.runs;
      if (parsed?.schemaVersion === "looplab-builder-benchmark-run/v1") return [parsed];
      throw new Error(`${path} must contain one benchmark receipt, an array, or a runs array.`);
    };
    const baselineRuns = await readReceiptSet(baselinePath, "baselineRuns");
    const candidateRuns = await readReceiptSet(candidatePath, "candidateRuns");
    const comparison = compareBuilderBenchmarkRuns(baselineRuns, candidateRuns);
    const requestedOutput = optionValue("output");
    const outputPath = requestedOutput ? resolve(requestedOutput) : null;
    if (outputPath) {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(comparison, null, 2)}\n`, "utf8");
    }
    print({ ok: true, operation, baselinePath, candidatePath, outputPath, comparison });
    return;
  }

  const projectArgument = args[0];
  if (!projectArgument) throw new Error(`${operation} requires a project file path.`);
  const projectPath = resolve(projectArgument);

  if (operation === "init") {
    const template = args.find((argument) => !argument.startsWith("--") && argument !== projectArgument) ?? "blank";
    const force = args.includes("--force");
    if (!force && await exists(projectPath)) throw new Error("Project already exists. Pass --force to replace it.");
    const project = createTemplate(template);
    await writeProject(projectPath, project);
    print({ ok: true, operation, path: projectPath, project: summarizeProject(project), validation: validateProject(project) });
    return;
  }

  let project = await readProject(projectPath, { allowInvalid: ["repair", "auto-repair", "converge"].includes(operation) });

  if (operation === "session") {
    const savePolicy = optionValue("save-policy");
    if (!savePolicy) throw new Error("session requires --save-policy=explicit|on-mutation|never so disk-write behavior is never implicit.");
    const session = createAgentJsonlSession({
      initialProject: project,
      savePolicy,
      applyCommand: applyAgentCommand,
      getCommandContract: getLooplabCommandContract,
      sourceDigest: doctorSourceDigest,
      persistProject: async (nextProject) => writeProject(projectPath, nextProject),
    });
    const lines = createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
    for await (const line of lines) print(await session.handleLine(line));
    return;
  }

  if (operation === "local-copilot") {
    const mode = args[1] && !args[1].startsWith("--") ? args[1] : "suggest-next-actions";
    const task = args.slice(2).filter((argument) => !argument.startsWith("--")).join(" ").trim();
    if (!task) throw new Error("local-copilot requires a bounded advisory task after the mode.");
    const contextJson = optionValue("context-json");
    const contextFile = optionValue("context-file");
    if (contextJson && contextFile) throw new Error("Use either --context-json or --context-file, not both.");
    const supplied = contextJson ? JSON.parse(contextJson) : contextFile ? JSON.parse(await readFile(resolve(contextFile), "utf8")) : null;
    if (supplied !== null && (!supplied || typeof supplied !== "object" || Array.isArray(supplied))) throw new Error("Local copilot context must be one JSON object.");
    const currentDoctor = analyzeProject(project, { profile: "prototype" });
    const releaseDoctor = analyzeProject(project, { profile: "production" });
    const context = {
      schemaVersion: "looplab-local-copilot-context/v1",
      project: summarizeProject(project),
      readiness: {
        current: { profile: currentDoctor.profile, score: currentDoctor.score, blocking: currentDoctor.gate.blocking, errors: currentDoctor.errorCount, warnings: currentDoctor.warningCount },
        release: { profile: releaseDoctor.profile, score: releaseDoctor.score, blocking: releaseDoctor.gate.blocking, errors: releaseDoctor.errorCount, warnings: releaseDoctor.warningCount },
      },
      supplied,
      omissions: ["embedded asset bytes", "provider credentials", "exported HTML", "browser images", "complete project source"],
    };
    const result = await companionJson("/local-copilot/jobs", { method: "POST", body: { task, mode, sourceDigest: currentDoctor.sourceDigest, model: optionValue("model"), context } });
    print({ ok: true, operation, projectPath, sourceDigest: currentDoctor.sourceDigest, job: result, resume: { operation: "local-copilot-job", jobId: result.jobId, includeResult: true } });
    return;
  }

  if (operation === "benchmark-evaluate") {
    const benchmarkId = args[1];
    if (!benchmarkId || benchmarkId.startsWith("--")) throw new Error("benchmark-evaluate requires a stable benchmark id after the project path.");
    const runJson = optionValue("run-json");
    const runFile = optionValue("run-file");
    if (runJson && runFile) throw new Error("Use either --run-json or --run-file, not both.");
    const run = runJson ? JSON.parse(runJson) : runFile ? JSON.parse(await readFile(resolve(runFile), "utf8")) : {};
    const outcome = applyAgentCommand(project, { op: "evaluate_builder_benchmark", benchmarkId, run });
    const requestedOutput = optionValue("output");
    const outputPath = requestedOutput ? resolve(requestedOutput) : null;
    if (outputPath) {
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(outcome.result, null, 2)}\n`, "utf8");
    }
    print({ ok: outcome.result.passed, operation, path: projectPath, outputPath, benchmark: outcome.result });
    if (!outcome.result.passed) process.exitCode = 2;
    return;
  }

  if (operation === "macro-preview" || operation === "macro-apply") {
    const macroId = args[1];
    if (!macroId || macroId.startsWith("--")) throw new Error(`${operation} requires a macro id after the project path.`);
    const inline = args[2] && args[2] !== "-" && !args[2].startsWith("--") ? args[2] : null;
    const raw = inline ?? await readStdin();
    const parameters = raw ? JSON.parse(raw) : {};
    if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) throw new Error("Macro parameters must be one JSON object.");
    const command = operation === "macro-preview"
      ? { op: "preview_command_macro", macroId, parameters, invocationId: optionValue("invocation-id"), detail: optionValue("detail") }
      : {
          op: "apply_command_macro",
          macroId,
          parameters,
          expectedSourceDigest: optionValue("source-digest"),
          expectedExpansionDigest: optionValue("expansion-digest"),
          invocationId: optionValue("invocation-id"),
          detail: optionValue("detail"),
        };
    const outcome = applyAgentCommand(project, command);
    if (outcome.changed) {
      project = outcome.project;
      await writeProject(projectPath, project);
    }
    print({ ok: true, operation, projectPath, changed: outcome.changed, result: outcome.result, validation: outcome.validation, summary: summarizeProject(project) });
    return;
  }

  if (operation === "platform-harness" || operation === "browser-harness") {
    const htmlArgument = args[1];
    if (!htmlArgument || htmlArgument.startsWith("--")) throw new Error(`${operation} requires an exported HTML path after the project path.`);
    const htmlPath = resolve(htmlArgument);
    const requestedCaptureDirectory = optionValue("captures");
    const captureDirectory = operation === "browser-harness" || requestedCaptureDirectory
      ? resolve(requestedCaptureDirectory ?? `${htmlPath}.browser-harness`)
      : undefined;
    const doctor = analyzeProject(project);
    const receipt = await runPlatformHarness({
      html: await readFile(htmlPath, "utf8"),
      expectedSourceDigest: doctor.sourceDigest,
      frameCount: optionValue("frames", 1_200),
      frameMs: optionValue("frame-ms", 16),
      browserChannel: optionValue("browser-channel"),
      executablePath: optionValue("executable-path"),
      captureDirectory,
    });
    print({ ok: receipt.passed, operation, projectPath, htmlPath, captureDirectory: captureDirectory ?? null, receipt });
    if (!receipt.passed) process.exitCode = 2;
    return;
  }

  if (operation === "import-pack") {
    const packId = args[1];
    const assetIds = args.slice(2).filter((argument) => !argument.startsWith("--"));
    if (!packId || assetIds.length === 0) throw new Error("import-pack requires a pack id and at least one asset id.");
    const imported = await loadInstalledPackAssets(packId, assetIds, {
      frameWidth: optionValue("frame-width"),
      frameHeight: optionValue("frame-height"),
      frames: optionValue("frames"),
    });
    const existingSources = new Set([
      ...(project.assets ?? []).map((asset) => asset.source?.assetId).filter(Boolean),
      ...(project.resources ?? []).map((resource) => resource.source?.assetId).filter(Boolean),
    ]);
    const assets = imported.assets.filter((asset) => !existingSources.has(asset.source.assetId));
    const resources = imported.resources.filter((resource) => !existingSources.has(resource.source.assetId));
    const before = project;
    const placed = [];
    for (const asset of assets) {
      project = applyAgentCommand(project, { op: "add_asset", asset }).project;
      if (args.includes("--place")) {
        const generatedKind = String(asset.generator.kind ?? "prop");
        const kind = asset.type === "tileset" ? "platform" : generatedKind === "hero" ? "player" : generatedKind === "enemy" ? "hazard" : generatedKind === "pickup" ? "coin" : "decor";
        const scale = Math.max(0.125, Math.min(16, Number(optionValue("scale", 1))));
        const outcome = applyAgentCommand(project, {
          op: "add_object",
          kind,
          object: {
            name: asset.name,
            x: Number(optionValue("x", 120)) + placed.length * Number(optionValue("spacing", 24)),
            y: Number(optionValue("y", 120)),
            width: asset.frameWidth * scale,
            height: asset.frameHeight * scale,
            assetId: asset.id,
            assetFrame: 0,
            anchorMode: asset.anchorMode ?? "ground",
            collisionOwner: "authored-map",
            role: ["prop", "effect", "ui"].includes(generatedKind) ? generatedKind : undefined,
            requiresSupport: generatedKind === "prop",
            groundAnchor: { offsetX: asset.anchorX * asset.frameWidth * scale, offsetY: asset.anchorY * asset.frameHeight * scale },
            visualBounds: visualBoundsForAsset(asset, asset.frameWidth * scale, asset.frameHeight * scale),
            collider: authoredColliderForPlacement({ kind, role: generatedKind, width: asset.frameWidth * scale, height: asset.frameHeight * scale }),
          },
        });
        project = outcome.project;
        let object = outcome.result.object;
        if (generatedKind === "prop") {
          const attached = applyAgentCommand(project, { op: "attach_to_support", id: object.id, mode: "auto", tolerance: 2 });
          project = attached.project;
          object = attached.result.object;
        }
        placed.push(object);
      }
    }
    if (resources.length) project = { ...project, resources: [...(project.resources ?? []), ...resources] };
    if (assets.length || resources.length) {
      project = invalidateVerifiedAuthoring(before, project, { reason: `Imported ${assets.length + resources.length} verified CC0 pack files` });
      await writeProject(projectPath, project);
    }
    print({
      ok: true,
      operation,
      path: projectPath,
      changed: assets.length + resources.length > 0,
      pack: imported.index.pack,
      assets: assets.map((asset) => ({ ...asset, dataUrl: "[embedded data URL]" })),
      resources: resources.map((resource) => ({ ...resource, dataUrl: "[embedded data URL]" })),
      placed,
      summary: summarizeProject(project),
    });
    return;
  }

  if (operation === "inspect") {
    const sinceDigest = optionValue("since-digest");
    const compact = args.includes("--full") ? false : args.includes("--compact") || Boolean(sinceDigest);
    const outcome = applyAgentCommand(project, { op: "get_project", compact, sinceDigest });
    print({ ok: true, operation, path: projectPath, validation: validateProject(project), ...outcome.result });
    return;
  }

  if (operation === "query") {
    const select = optionValue("select");
    const pointers = args.filter((argument) => argument.startsWith("--pointer=")).map((argument) => argument.slice("--pointer=".length));
    const outcome = applyAgentCommand(project, { op: "query_project", select, pointers, compact: !args.includes("--full") });
    print({ ok: true, operation, path: projectPath, query: outcome.result });
    return;
  }

  if (operation === "describe-frame" || operation === "frame") {
    const objectIds = String(optionValue("objects", "")).split(",").map((value) => value.trim()).filter(Boolean);
    const command = {
      op: "describe_frame",
      mapId: optionValue("map"),
      objectIds,
      includeCollision: args.includes("--collision"),
      ...(optionValue("max-entries") === undefined ? {} : { maximumEntries: Number(optionValue("max-entries")) }),
      ...(optionValue("max-overlaps") === undefined ? {} : { maximumOverlaps: Number(optionValue("max-overlaps")) }),
      ...(optionValue("max-hud-intrusions") === undefined ? {} : { maximumHudIntrusions: Number(optionValue("max-hud-intrusions")) }),
    };
    const outcome = applyAgentCommand(project, command);
    print({ ok: true, operation, path: projectPath, frame: outcome.result });
    return;
  }

  if (operation === "simulate") {
    const inlineInputs = optionValue("inputs") ?? optionValue("inputs-json");
    const inputsFile = optionValue("inputs-file");
    const inputsStdin = args.includes("--inputs-stdin");
    const inputSources = Number(inlineInputs !== undefined) + Number(inputsFile !== undefined) + Number(inputsStdin);
    if (inputSources > 1) throw new Error("Use only one of --inputs, --inputs-file, or --inputs-stdin.");
    const rawInputs = inlineInputs ?? (inputsFile ? await readFile(resolve(inputsFile), "utf8") : inputsStdin ? await readStdin() : "[]");
    const inputs = JSON.parse(rawInputs || "[]");
    if (!Array.isArray(inputs)) throw new Error("Simulation inputs must be one JSON array.");
    const emit = String(optionValue("emit", "state")).split(",").map((value) => value.trim()).filter(Boolean);
    const command = {
      op: "simulate",
      tickCount: Number(optionValue("ticks")),
      tickRate: Number(optionValue("tick-rate", 60)),
      startMapId: optionValue("start-map"),
      startSpawnId: optionValue("start-spawn"),
      inputs,
      emit,
      includeFixtureCandidate: args.includes("--fixture") || args.includes("--include-fixture"),
      ...(optionValue("sample-every") === undefined ? {} : { sampleEvery: Number(optionValue("sample-every")) }),
      ...(optionValue("max-position-samples") === undefined ? {} : { maximumPositionSamples: Number(optionValue("max-position-samples")) }),
    };
    const outcome = applyAgentCommand(project, command);
    print({ ok: true, operation, path: projectPath, simulation: outcome.result });
    return;
  }

  if (operation === "release-verification") {
    const doctor = analyzeProject(project, { profile: "production" });
    const verification = validateReleaseVerification(project.releaseVerification, { sourceDigest: doctor.sourceDigest });
    print({ ok: verification.valid, operation, projectPath, sourceDigest: doctor.sourceDigest, verification });
    if (!verification.valid) process.exitCode = 2;
    return;
  }

  if (operation === "verify-everything") {
    if (!project.iteration?.id) throw new Error("verify-everything requires an active candidate. Begin an iteration or create a protected variation before running the exact proof.");
    if (project.iteration.status === "promoted") throw new Error("verify-everything cannot rewrite a promoted snapshot. Create a child variation first.");
    const startedAt = new Date().toISOString();
    const previousDoctorProfile = project.doctorProfile ?? "prototype";
    project = { ...project, doctorProfile: "production" };
    const originalProjectBytes = await readFile(projectPath);
    const originalProjectSha256 = createHash("sha256").update(originalProjectBytes).digest("hex");
    const outputArgument = args[1] && !args[1].startsWith("--") ? args[1] : null;
    const defaultOutput = projectPath.replace(/(?:\.loop)?\.json$/i, "");
    const outputPath = resolve(outputArgument ?? `${defaultOutput === projectPath ? `${projectPath}.game` : defaultOutput}.html`);
    const captureDirectory = resolve(optionValue("captures", `${outputPath}.verify-everything`));
    const receiptPath = resolve(optionValue("receipt", `${outputPath}.verification.json`));
    const outcome = await runExactReleaseVerification(project, {
      filename: basename(outputPath),
      collectVerificationEvidence: true,
      browserChannel: optionValue("browser-channel"),
      executablePath: optionValue("executable-path"),
      captureDirectory,
    });
    if (!outcome.ok) {
      const exactArtifactEvidence = outcome.verificationEvidence ? { schemaVersion: outcome.verificationEvidence.schemaVersion, status: outcome.verificationEvidence.status, evidenceCount: outcome.verificationEvidence.evidenceRefs.length, captureCount: outcome.verificationEvidence.captures.length, validation: outcome.verificationEvidence.validation, browser: outcome.verificationEvidence.browser } : null;
      print({ ok: false, operation, projectPath, outputPath, receiptPath, captureDirectory, sourceDigest: outcome.sourceDigest, artifactAudit: outcome.audit, platformHarness: outcome.platformHarness, exactArtifactEvidence, findings: outcome.findings, usage: outcome.verificationEvidence?.usage ?? { provider: "local", totalTokens: 0, estimatedUsd: 0 } });
      process.exitCode = 2;
      return;
    }
    let verified;
    try {
      verified = applyCollectedVerificationEvidence(outcome.project, outcome.verificationEvidence.evidenceRefs);
    } catch (error) {
      const doctor = analyzeProject(outcome.project, { profile: "production" });
      print({
        ok: false,
        operation,
        stage: "candidate-verification",
        projectPath,
        outputPath,
        receiptPath,
        captureDirectory,
        sourceDigest: outcome.sourceDigest,
        error: error instanceof Error ? error.message : String(error),
        doctor: { profile: doctor.profile, score: doctor.score, errorCount: doctor.errorCount, warningCount: doctor.warningCount, issues: doctor.issues.map(({ severity, code, message, action }) => ({ severity, code, message, action: action ?? null })) },
        exactArtifactEvidence: { status: outcome.verificationEvidence.status, evidenceCount: outcome.verificationEvidence.evidenceRefs.length, captureCount: outcome.verificationEvidence.captures.length, validation: outcome.verificationEvidence.validation },
        usage: outcome.verificationEvidence.usage,
        writesApplied: false,
      });
      process.exitCode = 2;
      return;
    }
    let finalProject = verified.project;
    let promotion = null;
    if (args.includes("--promote")) {
      try {
        promotion = promoteVerifiedIteration(finalProject);
        finalProject = promotion.project;
      } catch (error) {
        const doctor = analyzeProject(finalProject, { profile: "production" });
        print({
          ok: false,
          operation,
          stage: "candidate-promotion",
          projectPath,
          outputPath,
          receiptPath,
          captureDirectory,
          sourceDigest: outcome.sourceDigest,
          error: error instanceof Error ? error.message : String(error),
          doctor: { profile: doctor.profile, score: doctor.score, errorCount: doctor.errorCount, warningCount: doctor.warningCount, issues: doctor.issues.map(({ severity, code, message, action }) => ({ severity, code, message, action: action ?? null })) },
          exactArtifactEvidence: { status: outcome.verificationEvidence.status, evidenceCount: outcome.verificationEvidence.evidenceRefs.length, captureCount: outcome.verificationEvidence.captures.length, validation: outcome.verificationEvidence.validation },
          usage: outcome.verificationEvidence.usage,
          writesApplied: false,
        });
        process.exitCode = 2;
        return;
      }
    }
    const currentProjectBytes = await readFile(projectPath);
    const currentProjectSha256 = createHash("sha256").update(currentProjectBytes).digest("hex");
    if (currentProjectSha256 !== originalProjectSha256) throw new Error("The project file changed while verify-everything was running. No HTML, receipt, or project update was written; rerun against the new source.");
    const finalDoctor = analyzeProject(finalProject, { profile: "production" });
    const completedAt = new Date().toISOString();
    const receipt = {
      schemaVersion: "looplab-verify-everything-receipt/v1",
      status: "passed",
      passed: true,
      operation,
      startedAt,
      completedAt,
      source: { projectPath, fileSha256: `sha256:${originalProjectSha256}`, sourceDigest: outcome.sourceDigest, doctorProfile: { previous: previousDoctorProfile, verified: "production" } },
      artifact: { outputPath, captureDirectory, audit: outcome.audit, platformHarness: outcome.platformHarness, platformReceipt: outcome.platformReceipt },
      exactArtifactEvidence: outcome.verificationEvidence,
      releaseAttestation: outcome.attestation,
      iteration: {
        id: finalProject.iteration?.id ?? null,
        status: finalProject.iteration?.status ?? null,
        verification: { changed: verified.changed, verifiedAt: finalProject.iteration?.verifiedAt ?? null, sourceDigest: finalProject.iteration?.verification?.sourceDigest ?? null, evidenceCount: finalProject.iteration?.verification?.evidenceRefs?.length ?? 0 },
        promotion: promotion ? { changed: promotion.changed, promotedAt: finalProject.iteration?.promotedAt ?? null } : null,
      },
      doctor: { profile: finalDoctor.profile, score: finalDoctor.score, errorCount: finalDoctor.errorCount, warningCount: finalDoctor.warningCount, digest: finalDoctor.digest, sourceDigest: finalDoctor.sourceDigest },
      usage: outcome.verificationEvidence.usage,
    };
    await writeTextAtomic(outputPath, outcome.html);
    await writeTextAtomic(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    await writeProject(projectPath, finalProject);
    project = finalProject;
    print({ ok: true, operation, projectPath, outputPath, receiptPath, captureDirectory, sourceDigest: outcome.sourceDigest, artifactSha256: outcome.verificationEvidence.artifactSha256, evidenceCount: outcome.verificationEvidence.evidenceRefs.length, captureCount: outcome.verificationEvidence.captures.length, iteration: { id: receipt.iteration.id, status: receipt.iteration.status, promoted: receipt.iteration.promotion !== null }, doctor: receipt.doctor, usage: receipt.usage });
    return;
  }

  if (operation === "verify-release") {
    const outputArgument = args[1];
    if (!outputArgument || outputArgument.startsWith("--")) throw new Error("verify-release requires an output HTML path after the project path.");
    const outputPath = resolve(outputArgument);
    const captureDirectory = resolve(optionValue("captures", `${outputPath}.browser-harness`));
    const outcome = await runExactReleaseVerification(project, {
      filename: basename(outputPath),
      frameCount: optionValue("frames", 1_200),
      frameMs: optionValue("frame-ms", 16),
      browserChannel: optionValue("browser-channel"),
      executablePath: optionValue("executable-path"),
      captureDirectory,
    });
    if (!outcome.ok) {
      print({ ok: false, operation, projectPath, outputPath, captureDirectory, sourceDigest: outcome.sourceDigest, platformHarness: outcome.platformHarness, findings: outcome.findings });
      process.exitCode = 2;
      return;
    }
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, outcome.html, "utf8");
    await writeProject(projectPath, outcome.project);
    project = outcome.project;
    print({
      ok: true,
      operation,
      projectPath,
      outputPath,
      captureDirectory,
      sourceDigest: outcome.sourceDigest,
      artifactAudit: outcome.audit,
      platformHarness: outcome.platformHarness,
      attestation: outcome.attestation,
      doctor: outcome.doctor,
      nextAction: "Collect current editor evidence and run verify_iteration; the final export must reproduce this attested SHA-256.",
    });
    return;
  }

  if (operation === "brief" || operation === "agent-brief") {
    const outcome = applyAgentCommand(project, {
      op: "get_agent_brief",
      profile: optionValue("profile"),
      sinceDigest: optionValue("since-digest"),
      sinceTimestamp: optionValue("since-timestamp"),
      maxFindings: optionValue("max-findings"),
      maxNextActions: optionValue("max-actions"),
    });
    print({ ok: true, operation, path: projectPath, brief: outcome.result });
    return;
  }

  if (operation === "changes" || operation === "agent-changes") {
    const outcome = applyAgentCommand(project, {
      op: "get_agent_changes",
      cursor: optionValue("cursor"),
      limit: Number(optionValue("limit", 32)),
    });
    print({ ok: true, operation, path: projectPath, changes: outcome.result });
    return;
  }

  if (operation === "context" || operation === "project-context") {
    const mapIds = args.slice(1).filter((argument) => !argument.startsWith("--"));
    const view = optionValue("view", mapIds.length ? "map" : "campaign");
    const outcome = applyAgentCommand(project, {
      op: "get_project_context",
      view,
      mapIds,
      profile: optionValue("profile"),
      mapLimit: Number(optionValue("limit", 24)),
    });
    print({ ok: true, operation, path: projectPath, context: outcome.result });
    return;
  }

  if (operation === "plan" || operation === "draft-plan") {
    const intent = args.slice(1).filter((argument) => !argument.startsWith("--")).join(" ").trim();
    if (!intent) throw new Error("plan requires a short authoring intent after the project path.");
    const parametersJson = optionValue("parameters-json");
    const parametersInput = args.includes("--parameters-stdin") ? await readStdin() : parametersJson;
    const parameters = parametersInput ? JSON.parse(parametersInput) : {};
    if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) throw new Error("Plan parameters must be one JSON object.");
    const mapIds = String(optionValue("maps", "")).split(",").map((value) => value.trim()).filter(Boolean);
    const outcome = applyAgentCommand(project, {
      op: "draft_agent_plan",
      intent,
      mapIds,
      macroId: optionValue("macro"),
      recipeId: optionValue("recipe"),
      parameters,
      profile: optionValue("profile"),
      maxMatches: Number(optionValue("max-matches", 3)),
    });
    print({ ok: true, operation, path: projectPath, plan: outcome.result });
    return;
  }

  if (operation === "work" || operation === "work-ledger") {
    const query = args.slice(1).filter((argument) => !argument.startsWith("--")).join(" ");
    const outcome = applyAgentCommand(project, {
      op: "get_work_ledger",
      query,
      status: optionValue("status", "all"),
      kind: optionValue("kind", "all"),
      owner: optionValue("owner"),
      limit: Number(optionValue("limit", 50)),
      eventLimit: Number(optionValue("event-limit", 20)),
    });
    print({ ok: true, operation, path: projectPath, ledger: outcome.result });
    return;
  }

  if (operation === "validate") {
    print({ ok: true, operation, path: projectPath, validation: validateProject(project), summary: summarizeProject(project) });
    return;
  }

  if (operation === "doctor") {
    const profile = args[1] ?? project.doctorProfile ?? "prototype";
    const doctor = analyzeProject(project, { profile });
    print({ ok: !doctor.gate.blocking, operation, path: projectPath, doctor });
    if (doctor.gate.blocking) process.exitCode = 2;
    return;
  }

  if (operation === "privacy") {
    const profile = args[1] ?? project.doctorProfile ?? "production";
    const privacy = applyAgentCommand(project, { op: "get_privacy_report", profile }).result;
    print({ ok: privacy.status === "clear", operation, path: projectPath, profile, privacy });
    if (privacy.status !== "clear") process.exitCode = 2;
    return;
  }

  if (operation === "completion") {
    const profile = args[1] ?? project.doctorProfile ?? "prototype";
    const outcome = applyAgentCommand(project, { op: "get_completion_report", profile });
    print({ ok: outcome.result?.passed === true, operation, path: projectPath, profile, completion: outcome.result });
    if (outcome.result?.passed !== true) process.exitCode = 2;
    return;
  }

  if (operation === "bot-cohorts") {
    const expectedSourceDigest = String(optionValue("source-digest", "")).trim();
    if (!expectedSourceDigest) throw new Error("bot-cohorts requires --source-digest from the exact Project Doctor report inspected before simulation.");
    const numericOption = (name) => optionValue(name) === undefined ? undefined : Number(optionValue(name));
    const listOption = (name) => String(optionValue(name, "")).split(",").map((entry) => entry.trim()).filter(Boolean);
    const seedValues = listOption("seeds").map(Number);
    const mapIds = listOption("maps");
    const command = {
      op: "run_bot_cohorts",
      expectedSourceDigest,
      ...(numericOption("ticks-per-run") === undefined ? {} : { ticksPerRun: numericOption("ticks-per-run") }),
      ...(numericOption("idle-ticks") === undefined ? {} : { idleTicks: numericOption("idle-ticks") }),
      ...(numericOption("action-hold-ticks") === undefined ? {} : { actionHoldTicks: numericOption("action-hold-ticks") }),
      ...(numericOption("decision-ticks") === undefined ? {} : { decisionTicks: numericOption("decision-ticks") }),
      ...(numericOption("cell-size") === undefined ? {} : { spatialCellSize: numericOption("cell-size") }),
      ...(numericOption("max-runs") === undefined ? {} : { maxRuns: numericOption("max-runs") }),
      ...(seedValues.length ? { seeds: seedValues } : {}),
      ...(mapIds.length ? { mapIds } : {}),
      includeCompletionWitness: !args.includes("--no-completion-witness"),
    };
    const outcome = applyAgentCommand(project, command);
    print({ ok: true, operation, path: projectPath, report: outcome.result });
    return;
  }

  if (operation === "replay") {
    const outcome = applyAgentCommand(project, { op: "run_replay_suite", caseId: args[1] });
    print({ ok: outcome.result.passed, operation, path: projectPath, replay: outcome.result });
    if (!outcome.result.passed) process.exitCode = 2;
    return;
  }

  if (operation === "acceptance-plan") {
    const outcome = applyAgentCommand(project, { op: "get_acceptance_plan" });
    print({ ok: true, operation, path: projectPath, acceptancePlan: outcome.result });
    return;
  }

  if (operation === "acceptance") {
    const outcome = applyAgentCommand(project, { op: "run_acceptance_suite", testId: args[1] });
    print({ ok: outcome.result.passed, operation, path: projectPath, acceptance: outcome.result });
    if (!outcome.result.passed) process.exitCode = 2;
    return;
  }

  if (operation === "record-replay") {
    const inline = args[1] && args[1] !== "-" ? args[1] : null;
    const input = inline ?? await readStdin();
    if (!input) throw new Error("record-replay requires replay-case JSON on stdin or as the second argument.");
    const specification = JSON.parse(input);
    const outcome = applyAgentCommand(project, { ...specification, op: "record_replay_case" });
    await writeProject(projectPath, outcome.project);
    print({ ok: true, operation, path: projectPath, recorded: outcome.result, summary: summarizeProject(outcome.project) });
    return;
  }

  if (operation === "route") {
    const track = args[1] ?? "gameplay";
    const promptParts = [];
    let framework = "auto";
    let narrativeMode = "auto";
    for (let index = 2; index < args.length; index += 1) {
      if (args[index] === "--framework" && args[index + 1]) {
        framework = args[index + 1];
        index += 1;
      } else if (args[index].startsWith("--framework=")) {
        framework = args[index].slice("--framework=".length);
      } else if (args[index] === "--narrative" && args[index + 1]) {
        narrativeMode = args[index + 1];
        index += 1;
      } else if (args[index].startsWith("--narrative=")) {
        narrativeMode = args[index].slice("--narrative=".length);
      } else {
        promptParts.push(args[index]);
      }
    }
    const runtimePreference = ["auto", "canvas", "phaser", "pixi", "melon"].includes(framework) ? framework : "auto";
    const narrativePreference = ["auto", "include", "exclude"].includes(narrativeMode) ? narrativeMode : "auto";
    const prompt = promptParts.join(" ") || "Improve the current game.";
    print({ ok: true, operation, path: projectPath, route: routeGameStudioWork(project, { track, prompt, framework: runtimePreference, narrativeMode: narrativePreference }) });
    return;
  }

  if (operation === "retry-prompt") {
    const provider = args[1] ?? "openai";
    const generated = await requestProviderPrompt(project, { provider });
    const outcome = applyAgentCommand(project, { op: "retry_prompt", draft: generated.draft });
    await writeProject(projectPath, outcome.project);
    print({ ok: true, operation, path: projectPath, provider, promptGeneration: outcome.result.promptGeneration, designBrief: outcome.result.designBrief, summary: summarizeProject(outcome.project) });
    return;
  }

  if (operation === "iterations") {
    const outcome = applyAgentCommand(project, { op: "get_iteration_history" });
    print({ ok: true, operation, path: projectPath, ledger: outcome.result });
    return;
  }

  if (operation === "compare-iterations") {
    const firstId = args[1];
    const secondId = args[2];
    if (!firstId || !secondId) throw new Error("compare-iterations requires two iteration ids.");
    const outcome = applyAgentCommand(project, { op: "compare_iterations", ids: [firstId, secondId] });
    print({ ok: true, operation, path: projectPath, comparison: outcome.result });
    return;
  }

  if (operation === "restore-iteration") {
    const id = args[1];
    if (!id) throw new Error("restore-iteration requires an iteration id.");
    const outcome = applyAgentCommand(project, { op: "restore_iteration", id, restoreAsId: optionValue("as") });
    await writeProject(projectPath, outcome.project);
    print({ ok: true, operation, path: projectPath, restored: outcome.result, summary: summarizeProject(outcome.project), project: outcome.project });
    return;
  }

  if (operation === "prepare-export") {
    const requestedFilename = args[1];
    const artifact = buildStandaloneArtifact(project, { filename: requestedFilename ? basename(requestedFilename) : undefined });
    print({ ok: true, operation, projectPath, summary: summarizeProject(project), exportReceipt: artifact.receipt });
    return;
  }

  if (operation === "export") {
    const outputArgument = args[1];
    if (!outputArgument) throw new Error("export requires an output HTML path.");
    const outputPath = resolve(outputArgument);
    await mkdir(dirname(outputPath), { recursive: true });
    const artifact = buildStandaloneArtifact(project, { filename: basename(outputPath) });
    await writeFile(outputPath, artifact.html, "utf8");
    print({ ok: true, operation, projectPath, outputPath, summary: summarizeProject(project), artifactAudit: artifact.audit, exportReceipt: artifact.receipt });
    return;
  }

  if (operation === "export-verification") {
    const outputArgument = args[1];
    if (!outputArgument) throw new Error("export-verification requires an output HTML path.");
    const outputPath = resolve(outputArgument);
    await mkdir(dirname(outputPath), { recursive: true });
    const html = buildVerificationHtml(project);
    const audit = auditStandaloneHtml(html);
    await writeFile(outputPath, html, "utf8");
    print({ ok: true, operation, projectPath, outputPath, summary: summarizeProject(project), artifactAudit: audit, releaseStatus: "verification-only-not-shippable" });
    return;
  }

  if (operation === "generate-tiles" || operation === "generate-sprite") {
    const positional = args.filter((argument) => !argument.startsWith("--"));
    const outputArgument = positional[1];
    if (!outputArgument) throw new Error(`${operation} requires an output PNG path.`);
    const outputPath = resolve(outputArgument);
    const attach = args.includes("--attach") || args.includes("--place");
    const place = args.includes("--place");
    const valueFor = (flag, fallback) => {
      const match = args.find((argument) => argument.startsWith(`${flag}=`));
      return match ? match.slice(flag.length + 1) : fallback;
    };
    let generated;
    let label;
    if (operation === "generate-tiles") {
      const theme = positional[2] ?? "meadow";
      const tileSize = Number(positional[3] ?? 32);
      const seed = positional[4] ?? "looplab";
      generated = generateTilesetPixels({ theme, tileSize, seed });
      label = `${theme[0].toUpperCase()}${theme.slice(1)} tiles`;
    } else {
      const kind = positional[2] ?? "hero";
      const size = Number(positional[3] ?? 32);
      const palette = positional[4] ?? "violet";
      const seed = positional[5] ?? "looplab";
      generated = generateSpritePixels({ kind, size, palette, seed });
      label = `${kind[0].toUpperCase()}${kind.slice(1)} sprite`;
    }
    const png = encodePng(generated);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, png);

    let asset = null;
    let placedObject = null;
    if (attach) {
      const assetId = `${generated.kind}-${randomUUID()}`;
      asset = {
        id: assetId,
        name: label,
        type: generated.kind,
        dataUrl: `data:image/png;base64,${png.toString("base64")}`,
        width: generated.width,
        height: generated.height,
        frameWidth: generated.frameWidth,
        frameHeight: generated.frameHeight,
        frames: generated.frames,
        columns: generated.columns,
        anchorX: generated.anchorX,
        anchorY: generated.anchorY,
        opaqueBounds: generated.opaqueBounds,
        collisionPolicy: "authored-only",
        anchorMode: generated.kind === "tileset" || !["effect", "ui"].includes(generated.spriteKind) ? "ground" : "center",
        invariants: generated.kind === "sprite" ? { identityReference: generated.seed, palette: generated.palette, facingDirection: "right", frameCount: generated.frames, sharedScale: true, groundAnchor: !["effect", "ui"].includes(generated.spriteKind), transparentBackground: true, maxSilhouetteDrift: 0.14, maxAnchorVariance: 1 } : undefined,
        analysis: generated.kind === "sprite" ? { silhouetteDrift: 0, anchorVariance: 0, characterCountMax: 1, haloPixelRatio: 0, failedInvariants: [] } : undefined,
        generator: Object.fromEntries(Object.entries(generated).filter(([key]) => !["pixels", "names", "width", "height", "frameWidth", "frameHeight", "frames", "columns", "rows", "anchorX", "anchorY"].includes(key))),
      };
      project = applyAgentCommand(project, { op: "add_asset", asset }).project;
      if (place) {
        const scale = Number(valueFor("--scale", generated.kind === "tileset" ? 2 : 2));
        const frame = Number(valueFor("--frame", 0));
        const objectKind = generated.kind === "tileset" ? (args.includes("--decor") ? "decor" : "platform") : generated.spriteKind === "hero" ? "player" : generated.spriteKind === "enemy" ? "hazard" : generated.spriteKind === "pickup" ? "coin" : "decor";
        const generatedRole = generated.kind === "tileset" ? null : generated.spriteKind;
        const usesGroundAnchor = !["effect", "ui"].includes(generatedRole);
        const outcome = applyAgentCommand(project, {
          op: "add_object",
          kind: objectKind,
          object: {
            name: label,
            x: Number(valueFor("--x", 120)),
            y: Number(valueFor("--y", 120)),
            width: generated.frameWidth * scale,
            height: generated.frameHeight * scale,
            assetId,
            assetFrame: frame,
            anchorMode: usesGroundAnchor ? "ground" : "center",
            collisionOwner: "authored-map",
            role: ["prop", "effect", "ui"].includes(generatedRole) ? generatedRole : undefined,
            requiresSupport: generatedRole === "prop",
            groundAnchor: { offsetX: generated.anchorX <= 1 ? generated.anchorX * generated.frameWidth * scale : generated.anchorX * scale, offsetY: generated.anchorY <= 1 ? generated.anchorY * generated.frameHeight * scale : generated.anchorY * scale },
            visualBounds: visualBoundsForAsset(asset, generated.frameWidth * scale, generated.frameHeight * scale),
            collider: authoredColliderForPlacement({ kind: objectKind, role: generatedRole, width: generated.frameWidth * scale, height: generated.frameHeight * scale }),
          },
        });
        project = outcome.project;
        placedObject = outcome.result.object;
        if (generatedRole === "prop") {
          const attached = applyAgentCommand(project, { op: "attach_to_support", id: placedObject.id, mode: "auto", tolerance: 2 });
          project = attached.project;
          placedObject = attached.result.object;
        }
      }
      await writeProject(projectPath, project);
    }

    print({
      ok: true,
      operation,
      projectPath,
      outputPath,
      attached: attach,
      placed: place,
      asset: asset ? { ...asset, dataUrl: undefined } : null,
      object: placedObject,
      generated: { ...generated, pixels: undefined },
      summary: summarizeProject(project),
    });
    return;
  }

  if (["batch-preview", "preview-batch", "batch-apply", "apply-previewed-batch"].includes(operation)) {
    const inline = args[1] && args[1] !== "-" && !args[1].startsWith("--") ? args[1] : null;
    const input = inline ?? await readStdin();
    const commands = parseCommands(input);
    const expectedSourceDigest = String(optionValue("source-digest", "")).trim();
    const summary = String(optionValue("summary", "")).trim();
    if (!expectedSourceDigest) throw new Error(`${operation} requires --source-digest from the exact Project Doctor report inspected before drafting.`);
    if (!summary) throw new Error(`${operation} requires --summary describing the coherent pass.`);
    const apply = operation === "batch-apply" || operation === "apply-previewed-batch";
    const expectedPreviewDigest = String(optionValue("preview-digest", "")).trim();
    if (apply && !expectedPreviewDigest) throw new Error(`${operation} requires --preview-digest from batch-preview.`);
    const outcome = applyAgentCommand(project, {
      op: apply ? "apply_previewed_batch" : "preview_batch",
      commands,
      summary,
      expectedSourceDigest,
      ...(optionValue("profile") ? { profile: optionValue("profile") } : {}),
      ...(optionValue("detail") ? { detail: optionValue("detail") } : {}),
      ...(apply ? { expectedPreviewDigest } : {}),
    });
    if (outcome.changed) await writeProject(projectPath, outcome.project);
    print({ ok: true, operation, path: projectPath, changed: outcome.changed, sourceDigest: doctorSourceDigest(outcome.project), result: outcome.result, validation: outcome.validation, summary: summarizeProject(outcome.project) });
    return;
  }

  if (operation === "feel") {
    const outcome = applyAgentCommand(project, { op: "get_feel_report" });
    print({ ok: true, operation, path: projectPath, feel: outcome.result });
    return;
  }

  if (operation === "tuning") {
    const outcome = applyAgentCommand(project, { op: "get_tuning_contract" });
    print({ ok: outcome.result.errors?.length === 0, operation, path: projectPath, tuning: outcome.result });
    if (outcome.result.errors?.length) process.exitCode = 2;
    return;
  }

  if (operation === "tuning-suggest") {
    const maxCandidates = optionValue("max-candidates");
    const outcome = applyAgentCommand(project, { op: "suggest_tuning_contract", ...(maxCandidates ? { maxCandidates: Number(maxCandidates) } : {}) });
    print({ ok: outcome.result.available === true, operation, path: projectPath, suggestion: outcome.result });
    if (!outcome.result.available) process.exitCode = 2;
    return;
  }

  if (operation === "tuning-set") {
    const inline = args[1] && args[1] !== "-" && !args[1].startsWith("--") ? args[1] : null;
    const input = inline ?? await readStdin();
    if (!input) throw new Error("tuning-set requires a Tuning Contract JSON object on stdin or as the second argument.");
    const outcome = applyAgentCommand(project, { op: "set_tuning_contract", contract: JSON.parse(input) });
    await writeProject(projectPath, outcome.project);
    print({ ok: true, operation, path: projectPath, tuning: outcome.result, summary: summarizeProject(outcome.project) });
    return;
  }

  if (operation === "tuning-search") {
    const expectedSourceDigest = String(optionValue("source-digest", "")).trim();
    if (!expectedSourceDigest) throw new Error("tuning-search requires --source-digest from the exact Project Doctor report inspected before search.");
    const outcome = applyAgentCommand(project, { op: "run_tuning_search", expectedSourceDigest });
    print({ ok: true, operation, path: projectPath, search: outcome.result });
    return;
  }

  if (operation === "foundations") {
    const outcome = applyAgentCommand(project, { op: "list_game_foundations" });
    print({ ok: true, operation, path: projectPath, registry: outcome.result });
    return;
  }

  if (operation === "foundation-suggest") {
    const maxCandidates = optionValue("max-candidates");
    const outcome = applyAgentCommand(project, {
      op: "suggest_game_foundations",
      ...(maxCandidates ? { maxCandidates: Number(maxCandidates) } : {}),
      allowReplacement: args.includes("--allow-replacement"),
      allowUnproven: args.includes("--allow-unproven"),
    });
    print({ ok: outcome.result.candidates.length > 0, operation, path: projectPath, suggestion: outcome.result });
    return;
  }

  if (operation === "foundation-materialize") {
    const expectedSourceDigest = String(optionValue("source-digest", "")).trim();
    if (!expectedSourceDigest) throw new Error("foundation-materialize requires --source-digest from the exact Project Doctor report inspected before materialization.");
    if (!args.includes("--allow-replacement")) throw new Error("foundation-materialize requires --allow-replacement after selecting a protected variation.");
    const inline = args[1] && args[1] !== "-" && !args[1].startsWith("--") ? args[1] : null;
    const input = inline ?? await readStdin();
    if (!input) throw new Error("foundation-materialize requires foundationId and expectedCandidateDigest JSON on stdin.");
    const request = JSON.parse(input);
    const outcome = applyAgentCommand(project, {
      op: "materialize_game_foundation",
      ...request,
      expectedSourceDigest,
      allowReplacement: true,
      allowUnproven: args.includes("--allow-unproven"),
    });
    print({ ok: true, operation, path: projectPath, materialization: outcome.result });
    return;
  }

  if (operation === "scaffold") {
    const outcome = applyAgentCommand(project, { op: "get_structural_scaffold_contract" });
    print({ ok: outcome.result.errors?.length === 0, operation, path: projectPath, scaffold: outcome.result });
    if (outcome.result.errors?.length) process.exitCode = 2;
    return;
  }

  if (operation === "scaffold-suggest") {
    const families = String(optionValue("families", "")).split(",").map((family) => family.trim()).filter(Boolean);
    const maxCandidates = optionValue("max-candidates");
    const outcome = applyAgentCommand(project, {
      op: "suggest_structural_scaffold_contract",
      ...(families.length ? { families } : {}),
      ...(maxCandidates ? { maxCandidates: Number(maxCandidates) } : {}),
      allowReplacement: args.includes("--allow-replacement"),
    });
    print({ ok: outcome.result.available === true, operation, path: projectPath, suggestion: outcome.result });
    return;
  }

  if (operation === "scaffold-set") {
    const inline = args[1] && args[1] !== "-" && !args[1].startsWith("--") ? args[1] : null;
    const input = inline ?? await readStdin();
    if (!input) throw new Error("scaffold-set requires a structural scaffold contract JSON object on stdin or as the second argument.");
    const outcome = applyAgentCommand(project, { op: "set_structural_scaffold_contract", contract: JSON.parse(input) });
    await writeProject(projectPath, outcome.project);
    print({ ok: true, operation, path: projectPath, scaffold: outcome.result, summary: summarizeProject(outcome.project) });
    return;
  }

  if (operation === "scaffold-search") {
    const expectedSourceDigest = String(optionValue("source-digest", "")).trim();
    if (!expectedSourceDigest) throw new Error("scaffold-search requires --source-digest from the exact Project Doctor report inspected before search.");
    const outcome = applyAgentCommand(project, { op: "run_structural_scaffold_search", expectedSourceDigest });
    print({ ok: outcome.result.status === "completed", operation, path: projectPath, search: outcome.result });
    if (outcome.result.status !== "completed") process.exitCode = 2;
    return;
  }

  if (operation === "scaffold-materialize") {
    const expectedSourceDigest = String(optionValue("source-digest", "")).trim();
    if (!expectedSourceDigest) throw new Error("scaffold-materialize requires --source-digest from the exact Project Doctor report inspected before materialization.");
    const inline = args[1] && args[1] !== "-" && !args[1].startsWith("--") ? args[1] : null;
    const input = inline ?? await readStdin();
    if (!input) throw new Error("scaffold-materialize requires candidateId, expectedCandidateDigest, and slotValues JSON on stdin.");
    const request = JSON.parse(input);
    const outcome = applyAgentCommand(project, { op: "materialize_structural_scaffold", ...request, expectedSourceDigest });
    print({ ok: true, operation, path: projectPath, materialization: outcome.result });
    return;
  }

  if (operation === "layout") {
    const outcome = applyAgentCommand(project, { op: "get_spatial_layout_contract" });
    print({ ok: outcome.result.errors?.length === 0, operation, path: projectPath, layout: outcome.result });
    if (outcome.result.errors?.length) process.exitCode = 2;
    return;
  }

  if (operation === "layout-suggest") {
    const mapId = String(optionValue("map", "")).trim();
    const maxCandidates = optionValue("max-candidates");
    const outcome = applyAgentCommand(project, {
      op: "suggest_spatial_layout_contract",
      ...(mapId ? { mapId } : {}),
      ...(maxCandidates ? { maxCandidates: Number(maxCandidates) } : {}),
      allowReplacement: args.includes("--allow-replacement"),
    });
    print({ ok: outcome.result.available === true, operation, path: projectPath, suggestion: outcome.result });
    if (!outcome.result.available) process.exitCode = 2;
    return;
  }

  if (operation === "layout-set") {
    const inline = args[1] && args[1] !== "-" && !args[1].startsWith("--") ? args[1] : null;
    const input = inline ?? await readStdin();
    if (!input) throw new Error("layout-set requires a spatial layout contract JSON object on stdin or as the second argument.");
    const outcome = applyAgentCommand(project, { op: "set_spatial_layout_contract", contract: JSON.parse(input) });
    await writeProject(projectPath, outcome.project);
    print({ ok: true, operation, path: projectPath, layout: outcome.result, summary: summarizeProject(outcome.project) });
    return;
  }

  if (operation === "layout-remove") {
    const outcome = applyAgentCommand(project, { op: "remove_spatial_layout_contract" });
    if (outcome.changed) await writeProject(projectPath, outcome.project);
    print({ ok: true, operation, path: projectPath, changed: outcome.changed, layout: outcome.result, summary: summarizeProject(outcome.project) });
    return;
  }

  if (operation === "layout-search") {
    const expectedSourceDigest = String(optionValue("source-digest", "")).trim();
    if (!expectedSourceDigest) throw new Error("layout-search requires --source-digest from the exact Project Doctor report inspected before search.");
    const outcome = applyAgentCommand(project, { op: "run_spatial_layout_search", expectedSourceDigest });
    print({ ok: outcome.result.status === "completed", operation, path: projectPath, search: outcome.result });
    if (outcome.result.status !== "completed") process.exitCode = 2;
    return;
  }

  if (operation === "layout-materialize") {
    const expectedSourceDigest = String(optionValue("source-digest", "")).trim();
    if (!expectedSourceDigest) throw new Error("layout-materialize requires --source-digest from the exact Project Doctor report inspected before materialization.");
    const inline = args[1] && args[1] !== "-" && !args[1].startsWith("--") ? args[1] : null;
    const input = inline ?? await readStdin();
    if (!input) throw new Error("layout-materialize requires candidateId and expectedCandidateDigest JSON on stdin.");
    const request = JSON.parse(input);
    const outcome = applyAgentCommand(project, { op: "materialize_spatial_layout", ...request, expectedSourceDigest });
    print({ ok: true, operation, path: projectPath, materialization: outcome.result });
    return;
  }

  if (["repair", "auto-repair", "converge"].includes(operation)) {
    const expectedSourceDigest = String(optionValue("source-digest", "")).trim();
    if (!expectedSourceDigest) throw new Error(`${operation} requires --source-digest from the exact Project Doctor report inspected before planning.`);
    const apply = args.includes("--apply");
    const findingCodes = String(optionValue("codes", "")).split(",").map((code) => code.trim()).filter(Boolean);
    const isConvergence = operation === "converge";
    const command = {
      op: isConvergence ? "converge" : "auto_repair",
      expectedSourceDigest,
      apply,
      ...(optionValue("profile") ? { profile: optionValue("profile") } : {}),
      ...(findingCodes.length ? { findingCodes } : {}),
      ...(optionValue("max-repairs") ? { maxRepairs: Number(optionValue("max-repairs")) } : {}),
      ...(isConvergence && optionValue("max-passes") ? { maxPasses: Number(optionValue("max-passes")) } : {}),
      ...(apply && isConvergence ? { expectedConvergenceDigest: String(optionValue("convergence-digest", "")).trim() } : {}),
      ...(apply && !isConvergence ? { expectedRepairDigest: String(optionValue("repair-digest", "")).trim() } : {}),
    };
    if (apply && isConvergence && !command.expectedConvergenceDigest) throw new Error("converge --apply requires --convergence-digest from the exact dry run.");
    if (apply && !isConvergence && !command.expectedRepairDigest) throw new Error("repair --apply requires --repair-digest from the exact dry run.");
    const outcome = applyAgentCommand(project, command);
    if (outcome.changed) await writeProject(projectPath, outcome.project);
    print({
      ok: true,
      operation,
      path: projectPath,
      changed: outcome.changed,
      sourceDigest: doctorSourceDigest(outcome.project),
      result: outcome.result,
      validation: outcome.validation,
      summary: summarizeProject(outcome.project),
    });
    return;
  }

  if (operation === "apply" || operation === "batch") {
    const inline = args[1] && args[1] !== "-" ? args[1] : null;
    const input = inline ?? await readStdin();
    const commands = parseCommands(input);
    let current = project;
    let changed = false;
    const results = [];
    for (const command of commands) {
      const resolvedCommand = command.op === "retry_prompt" && !command.draft && !command.generatedPrompt
        ? { ...command, draft: (await requestProviderPrompt(current, command)).draft }
        : command;
      const outcome = applyAgentCommand(current, resolvedCommand);
      current = outcome.project;
      changed ||= outcome.changed;
      results.push({ op: command.op, changed: outcome.changed, result: outcome.result, validation: outcome.validation });
    }
    if (changed) await writeProject(projectPath, current);
    print({ ok: true, operation, path: projectPath, changed, commandCount: commands.length, results, summary: summarizeProject(current), project: current });
    return;
  }

  throw new Error(`Unknown operation: ${operation}`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, operation, error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
});
