import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import {
  LOOPLAB_PROTOCOL_VERSION,
  applyAgentCommand,
  createTemplate,
  getAgentManifest,
} from "../lib/looplab-agent-core.mjs";
import {
  LOOPLAB_COMMAND_CONTRACT_SCHEMA,
  getLooplabCommandContracts,
  validateLooplabCommandInput,
  validateLooplabCommandContracts,
} from "../lib/looplab-agent-contracts.mjs";
import {
  LOOPLAB_AGENT_COMMANDS,
  LOOPLAB_BROWSER_SESSION_COMMANDS,
  LOOPLAB_CORE_COMMANDS,
} from "../lib/looplab-command-surfaces.mjs";
import { doctorSourceDigest } from "../lib/looplab-doctor.mjs";
import { resolveLooplabProjectPath } from "../lib/looplab-project-file.mjs";
import { createLooplabMcpServer, prepareBrowserMcpCommand } from "../lib/looplab-mcp-server.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const serverScript = join(projectRoot, "scripts", "looplab-mcp.mjs");

function createMcpClient(surface, workspaceRoot, { appUrl, onlyTools } = {}) {
  const client = new Client({ name: "looplab-test-client", version: "1.0.0" }, { capabilities: {} });
  const args = [serverScript, `--surface=${surface}`, `--workspace=${workspaceRoot}`];
  if (appUrl) args.push(`--app-url=${appUrl}`);
  if (onlyTools) args.push(`--only-tools=${onlyTools.join(",")}`);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args,
    cwd: projectRoot,
    stderr: "pipe",
  });
  return { client, transport };
}

test("agent manifest publishes one precise contract for every command surface", () => {
  const manifest = getAgentManifest();
  const contracts = getLooplabCommandContracts();
  const validation = validateLooplabCommandContracts();

  assert.equal(LOOPLAB_PROTOCOL_VERSION, "1.111.0");
  assert.equal(manifest.agentOperatingModel.headlessFirst, true);
  assert.match(manifest.agentOperatingModel.primaryConsumer, /Codex, Claude/);
  assert.match(manifest.agentOperatingModel.primarySurface, /canonical product surface/);
  assert.match(manifest.agentOperatingModel.humanUiRole, /secondary inspection/);
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.equal(validation.commandCount, LOOPLAB_AGENT_COMMANDS.length);
  assert.equal(contracts.length, 295);
  assert.equal(LOOPLAB_CORE_COMMANDS.length, 209);
  assert.equal(LOOPLAB_BROWSER_SESSION_COMMANDS.length, 295);
  assert.equal(manifest.commandContracts.schemaVersion, LOOPLAB_COMMAND_CONTRACT_SCHEMA);
  assert.deepEqual(manifest.commandContracts.commands, contracts);
  assert.equal(contracts.every((contract) => contract.schemaPrecision === "declared"), true);
  assert.equal(contracts.find((contract) => contract.op === "list_shared_projects").annotations.readOnlyHint, true);
  assert.equal(contracts.find((contract) => contract.op === "mount_shared_project").mutatesBuilderState, true);
  assert.equal(contracts.find((contract) => contract.op === "mount_shared_project").mutatesProject, false);
  assert.equal(contracts.find((contract) => contract.op === "save_shared_project").mutatesProject, true);
  assert.deepEqual(contracts.find((contract) => contract.op === "save_shared_project").inputSchema.required, ["id"]);
  assert.equal(contracts.find((contract) => contract.op === "save_shared_project").inputSchema.additionalProperties, false);
  assert.equal(contracts.find((contract) => contract.op === "save_shared_project").inputSchema.anyOf.length, 2);
  assert.deepEqual(contracts.find((contract) => contract.op === "save_shared_project").inputSchema.properties.metadata.additionalProperties, false);
  assert.equal(validateLooplabCommandInput({ op: "save_shared_project", id: "shared-project", expectedRevisionDigest: "revision-" + "a".repeat(64) }).valid, true);
  assert.equal(validateLooplabCommandInput({ op: "save_shared_project", id: "shared-project", expectedSourceDigest: "source-" + "a".repeat(64) }).valid, false);
  assert.equal(validateLooplabCommandInput({ op: "preview_shared_project_rebase", id: "shared-project", expectedBaseRevisionDigest: "revision-" + "a".repeat(64), expectedRemoteRevisionDigest: "revision-" + "b".repeat(64) }).valid, true);
  assert.equal(validateLooplabCommandInput({ op: "apply_shared_project_rebase", id: "shared-project", expectedBaseRevisionDigest: "revision-" + "a".repeat(64), expectedLocalRevisionDigest: "revision-" + "b".repeat(64), expectedRemoteRevisionDigest: "revision-" + "c".repeat(64), expectedRebaseDigest: "sha256:" + "d".repeat(64) }).valid, true);
  assert.equal(validateLooplabCommandInput({ op: "apply_shared_project_rebase", id: "shared-project", expectedBaseRevisionDigest: "revision-" + "a".repeat(64) }).valid, false);
  assert.equal(validateLooplabCommandInput({ op: "save_shared_project", id: "shared-project", createOnly: true }).valid, true);
  const missingSharedSavePrecondition = validateLooplabCommandInput({ op: "save_shared_project", id: "shared-project" });
  assert.equal(missingSharedSavePrecondition.valid, false);
  assert.match(missingSharedSavePrecondition.errors.join("\n"), /allowed field combination/);
  const falseCreateOnlySharedSave = validateLooplabCommandInput({ op: "save_shared_project", id: "shared-project", createOnly: false });
  assert.equal(falseCreateOnlySharedSave.valid, false);
  assert.match(falseCreateOnlySharedSave.errors.join("\n"), /allowed field combination/);
  assert.match(manifest.projectLibrary.staleWritePolicy, /412/);
  assert.equal(contracts.find((contract) => contract.op === "update_object").requiresSourceDigestInMcp, true);
  assert.equal(contracts.find((contract) => contract.op === "get_agent_brief").annotations.readOnlyHint, true);
  assert.equal(contracts.find((contract) => contract.op === "preview_batch").annotations.readOnlyHint, true);
  assert.equal(contracts.find((contract) => contract.op === "apply_previewed_batch").requiresSourceDigestInMcp, true);
  assert.equal(contracts.find((contract) => contract.op === "auto_repair").requiresSourceDigestInMcp, true);
  assert.equal(contracts.find((contract) => contract.op === "converge").inputSchema.properties.maxPasses.maximum, 6);
  assert.equal(contracts.find((contract) => contract.op === "list_builder_benchmarks").annotations.readOnlyHint, true);
  assert.deepEqual(contracts.find((contract) => contract.op === "evaluate_builder_benchmark").inputSchema.required, ["benchmarkId"]);
  assert.deepEqual(contracts.find((contract) => contract.op === "evaluate_builder_benchmark").inputSchema.properties.run.properties.provider.enum, ["none", "openai", "anthropic", "codex", "claude", "file"]);
  assert.deepEqual(contracts.find((contract) => contract.op === "compare_builder_benchmark_runs").inputSchema.required, ["baselineRuns", "candidateRuns"]);
  assert.equal(contracts.find((contract) => contract.op === "draft_agent_plan").annotations.readOnlyHint, true);
  assert.deepEqual(contracts.find((contract) => contract.op === "draft_agent_plan").inputSchema.required, ["intent"]);
  assert.equal(contracts.find((contract) => contract.op === "draft_agent_plan").inputSchema.additionalProperties, false);
  assert.equal(contracts.find((contract) => contract.op === "set_spatial_layout_contract").mutatesProject, true);
  assert.equal(contracts.find((contract) => contract.op === "set_spatial_layout_contract").requiresSourceDigestInMcp, true);
  assert.equal(contracts.find((contract) => contract.op === "set_spatial_layout_contract").annotations.readOnlyHint, false);
  assert.equal(contracts.find((contract) => contract.op === "remove_spatial_layout_contract").mutatesProject, true);
  assert.equal(contracts.find((contract) => contract.op === "remove_spatial_layout_contract").requiresSourceDigestInMcp, true);
  assert.equal(contracts.find((contract) => contract.op === "run_spatial_layout_search").annotations.readOnlyHint, true);
  assert.equal(contracts.find((contract) => contract.op === "materialize_spatial_layout").annotations.readOnlyHint, true);
  assert.deepEqual(contracts.find((contract) => contract.op === "route_work").inputSchema.properties.narrativeMode.enum, ["auto", "include", "exclude"]);
  assert.deepEqual(contracts.find((contract) => contract.op === "start_ai_build").inputSchema.properties.narrativeMode.enum, ["auto", "include", "exclude"]);
  assert.equal(contracts.find((contract) => contract.op === "start_research").inputSchema.properties.narrativeMode, undefined);
  assert.equal(contracts.find((contract) => contract.op === "get_project_context").annotations.readOnlyHint, true);
  assert.equal(contracts.find((contract) => contract.op === "get_agent_recipe").annotations.readOnlyHint, true);
  assert.equal(contracts.find((contract) => contract.op === "get_work_ledger").coordinationOnly, true);
  assert.equal(contracts.find((contract) => contract.op === "add_work_item").coordinationOnly, true);
  assert.equal(contracts.find((contract) => contract.op === "add_work_item").requiresSourceDigestInMcp, false);
  assert.equal(contracts.find((contract) => contract.op === "add_work_item").inputSchema.properties.item.additionalProperties, false);
  assert.deepEqual(contracts.find((contract) => contract.op === "get_release_verification").surfaces, ["core", "browser-session"]);
  assert.equal(contracts.find((contract) => contract.op === "get_release_verification").annotations.readOnlyHint, true);
  assert.deepEqual(contracts.find((contract) => contract.op === "verify_release").surfaces, ["browser-session"]);
  assert.deepEqual(contracts.find((contract) => contract.op === "verify_iteration").surfaces, ["browser-session"]);
  assert.deepEqual(contracts.find((contract) => contract.op === "promote_iteration").surfaces, ["browser-session"]);
  assert.equal(contracts.find((contract) => contract.op === "verify_iteration").inputSchema.properties.evidenceRefs, undefined);
  assert.equal(LOOPLAB_CORE_COMMANDS.includes("verify_iteration"), false);
  assert.equal(LOOPLAB_CORE_COMMANDS.includes("promote_iteration"), false);
  assert.deepEqual(contracts.find((contract) => contract.op === "get_release_verification_job").inputSchema.required, ["jobId"]);
  assert.deepEqual(contracts.find((contract) => contract.op === "cancel_release_verification_job").inputSchema.required, ["jobId"]);
});

test("browser MCP defaults reads and mutations to compact agent responses without overriding an explicit full request", () => {
  const contracts = new Map(getLooplabCommandContracts().map((contract) => [contract.op, contract]));

  assert.equal(prepareBrowserMcpCommand(contracts.get("draft_agent_plan"), { intent: "Verify the release" }).compact, true);
  assert.equal(prepareBrowserMcpCommand(contracts.get("update_object"), { id: "object-1", changes: { x: 10 } }).compact, true);
  assert.equal(prepareBrowserMcpCommand(contracts.get("get_project"), { compact: false }).compact, false);
});

test("get_agent_brief is bounded, source-bound, and reports changes since a digest", () => {
  let project = createTemplate("platformer");
  const firstDigest = doctorSourceDigest(project);
  const first = applyAgentCommand(project, {
    op: "get_agent_brief",
    sinceDigest: firstDigest,
    maxFindings: 2,
    maxNextActions: 2,
  }).result;

  assert.equal(first.schemaVersion, "looplab-agent-brief/v2");
  assert.equal(first.sourceDigest, firstDigest);
  assert.equal(first.changes.baselineStatus, "current");
  assert.equal(first.changes.changed, false);
  assert.equal(first.readiness.schemaVersion, "looplab-agent-readiness/v1");
  assert.equal(first.readiness.current.sourceDigest, firstDigest);
  assert.equal(first.readiness.release.sourceDigest, firstDigest);
  assert.ok(first.openFindings.length <= 2);
  assert.ok(first.nextActions.length <= 2);
  assert.doesNotMatch(JSON.stringify(first), /data:[^;]+;base64/i);

  const target = project.objects.find((object) => object.kind !== "player") ?? project.objects[0];
  project = applyAgentCommand(project, {
    op: "update_object",
    id: target.id,
    changes: { x: target.x + 1 },
    expectedSourceDigest: firstDigest,
  }).project;
  const second = applyAgentCommand(project, { op: "get_agent_brief", sinceDigest: firstDigest }).result;
  assert.equal(second.changes.changed, true);
  assert.notEqual(second.project.sourceDigest, firstDigest);
});

test("project-file resolution rejects traversal and non-project files", () => {
  const workspace = resolve(tmpdir(), "looplab-mcp-workspace-fixture");
  assert.equal(resolveLooplabProjectPath("games/demo.loop.json", workspace), resolve(workspace, "games", "demo.loop.json"));
  assert.throws(() => resolveLooplabProjectPath("../outside.loop.json", workspace), /stay inside/);
  assert.throws(() => resolveLooplabProjectPath("game.json", workspace), /end with \.loop\.json/);
});

test("MCP allowlists advertise only the exact bounded tool schemas requested by a caller", async (context) => {
  const workspace = await mkdtemp(join(tmpdir(), "looplab-mcp-bounded-"));
  const core = createMcpClient("core", workspace, { onlyTools: ["get_agent_brief"] });
  const browser = createMcpClient("browser", workspace, { onlyTools: ["list_agent_recipes"] });
  context.after(async () => {
    await core.client.close().catch(() => {});
    await browser.client.close().catch(() => {});
    await rm(workspace, { recursive: true, force: true });
  });

  await core.client.connect(core.transport);
  await browser.client.connect(browser.transport);
  assert.deepEqual((await core.client.listTools()).tools.map(({ name }) => name), ["get_agent_brief"]);
  assert.deepEqual((await browser.client.listTools()).tools.map(({ name }) => name), ["list_agent_recipes"]);
  assert.throws(
    () => createLooplabMcpServer({ surface: "core", workspaceRoot: workspace, toolAllowlist: ["list_projects"] }),
    /core surface does not expose allowed tool.*list_projects/,
  );
});

test("core MCP exposes typed resources and enforces optimistic file mutations", async (context) => {
  const workspace = await mkdtemp(join(tmpdir(), "looplab-mcp-core-"));
  const projectName = "game.loop.json";
  const projectPath = join(workspace, projectName);
  const project = createTemplate("platformer");
  await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
  const { client, transport } = createMcpClient("core", workspace);
  context.after(async () => {
    await client.close().catch(() => {});
    await rm(workspace, { recursive: true, force: true });
  });

  await client.connect(transport);
  const listed = await client.listTools();
  assert.equal(listed.tools.length, LOOPLAB_CORE_COMMANDS.length);
  assert.ok(listed.tools.some((tool) => tool.name === "get_agent_brief"));
  assert.ok(listed.tools.some((tool) => tool.name === "get_agent_changes"));
  assert.ok(listed.tools.some((tool) => tool.name === "draft_agent_plan"));
  assert.ok(listed.tools.some((tool) => tool.name === "get_project_context"));
  assert.ok(listed.tools.some((tool) => tool.name === "get_work_ledger"));
  assert.ok(listed.tools.some((tool) => tool.name === "get_release_verification"));
  assert.ok(listed.tools.some((tool) => tool.name === "preview_batch"));
  assert.ok(listed.tools.some((tool) => tool.name === "apply_previewed_batch"));
  assert.ok(listed.tools.some((tool) => tool.name === "list_builder_benchmarks"));
  assert.ok(listed.tools.some((tool) => tool.name === "evaluate_builder_benchmark"));
  assert.ok(listed.tools.some((tool) => tool.name === "compare_builder_benchmark_runs"));
  assert.equal(listed.tools.some((tool) => tool.name === "verify_release"), false);
  assert.equal(listed.tools.some((tool) => tool.name === "list_projects"), false);
  const updateTool = listed.tools.find((tool) => tool.name === "update_object");
  assert.ok(updateTool.inputSchema.required.includes("projectPath"));
  assert.ok(updateTool.inputSchema.required.includes("expectedSourceDigest"));
  assert.ok(updateTool.inputSchema.required.includes("changes"));
  const addWorkTool = listed.tools.find((tool) => tool.name === "add_work_item");
  assert.ok(addWorkTool.inputSchema.required.includes("expectedLedgerDigest"));
  assert.equal(addWorkTool.inputSchema.required.includes("expectedSourceDigest"), false);
  assert.equal(addWorkTool.inputSchema.properties.item.additionalProperties, false);

  const listedResources = await client.listResources();
  assert.deepEqual(
    listedResources.resources.map((resource) => resource.uri).sort(),
    ["looplab://agent-guide", "looplab://agent-guide-index", "looplab://agent-playbook", "looplab://capability-packs", "looplab://manifest", "looplab://mcp-setup"],
  );
  const manifestResource = await client.readResource({ uri: "looplab://manifest" });
  const resourceManifest = JSON.parse(manifestResource.contents[0].text);
  assert.equal(resourceManifest.protocolVersion, LOOPLAB_PROTOCOL_VERSION);
  assert.equal(resourceManifest.commandContracts.commands.length, LOOPLAB_AGENT_COMMANDS.length);
  const playbookResource = await client.readResource({ uri: "looplab://agent-playbook" });
  const resourcePlaybook = JSON.parse(playbookResource.contents[0].text);
  assert.equal(resourcePlaybook.schemaVersion, "looplab-agent-playbook/v1");
  assert.equal(resourcePlaybook.policy.autoExecution, false);
  assert.equal(resourcePlaybook.count, 10);
  const capabilityResource = await client.readResource({ uri: "looplab://capability-packs" });
  const resourceCapabilityPacks = JSON.parse(capabilityResource.contents[0].text);
  assert.equal(resourceCapabilityPacks.schemaVersion, "looplab-capability-pack-registry/v1");
  assert.equal(resourceCapabilityPacks.packCount, 6);
  assert.equal(resourceCapabilityPacks.capabilityCount, 28);
  assert.equal(resourceCapabilityPacks.calibration.valid, true);
  assert.equal(resourceCapabilityPacks.policy.executable, false);
  const guideIndexResource = await client.readResource({ uri: "looplab://agent-guide-index" });
  const resourceGuideIndex = JSON.parse(guideIndexResource.contents[0].text);
  assert.equal(resourceGuideIndex.schemaVersion, "looplab-agent-guide-index/v1");
  assert.equal(resourceGuideIndex.policy.authority, "orientation-only");
  assert.equal(resourceGuideIndex.source.headingCount, resourceGuideIndex.sections.length);
  assert.ok(resourceGuideIndex.recoveries.some((entry) => entry.id === "stale-source"));

  const recipesCall = await client.callTool({ name: "list_agent_recipes", arguments: { projectPath: projectName, query: "map transition" } });
  assert.equal(recipesCall.isError, undefined);
  assert.deepEqual(recipesCall.structuredContent.result.recipes.map((recipe) => recipe.id), ["connect-maps-round-trip"]);
  const recipeCall = await client.callTool({ name: "get_agent_recipe", arguments: { projectPath: projectName, recipeId: "connect-maps-round-trip" } });
  assert.equal(recipeCall.isError, undefined);
  assert.equal(recipeCall.structuredContent.result.recipe.id, "connect-maps-round-trip");
  const benchmarkListCall = await client.callTool({ name: "list_builder_benchmarks", arguments: { projectPath: projectName, category: "platformer" } });
  assert.equal(benchmarkListCall.isError, undefined);
  assert.deepEqual(benchmarkListCall.structuredContent.result.tasks.map((task) => task.id), ["platformer-completion-route"]);
  const benchmarkCall = await client.callTool({ name: "evaluate_builder_benchmark", arguments: { projectPath: projectName, benchmarkId: "platformer-completion-route" } });
  assert.equal(benchmarkCall.isError, undefined);
  assert.equal(benchmarkCall.structuredContent.result.schemaVersion, "looplab-builder-benchmark-run/v1");
  assert.equal(benchmarkCall.structuredContent.result.technicalFitness.requiredScore, 92);
  const benchmarkCompareCall = await client.callTool({ name: "compare_builder_benchmark_runs", arguments: { projectPath: projectName, baselineRuns: [benchmarkCall.structuredContent.result], candidateRuns: [benchmarkCall.structuredContent.result] } });
  assert.equal(benchmarkCompareCall.isError, undefined);
  assert.equal(benchmarkCompareCall.structuredContent.result.schemaVersion, "looplab-builder-benchmark-comparison/v1");
  assert.equal(benchmarkCompareCall.structuredContent.result.conclusion, "deterministic-delta");
  const planCall = await client.callTool({ name: "draft_agent_plan", arguments: { projectPath: projectName, intent: "Place a grounded vending machine" } });
  assert.equal(planCall.isError, undefined);
  assert.equal(planCall.structuredContent.result.schemaVersion, "looplab-agent-plan/v2");
  assert.equal(planCall.structuredContent.result.strategy.id, "place-supported-prop");
  assert.equal(planCall.structuredContent.result.authority.nonExecuting, true);
  assert.equal(planCall.structuredContent.result.authority.providerUsed, false);

  const briefCall = await client.callTool({ name: "get_agent_brief", arguments: { projectPath: projectName } });
  assert.equal(briefCall.isError, undefined);
  assert.equal(briefCall.structuredContent.ok, true);
  assert.equal(briefCall.structuredContent.result.schemaVersion, "looplab-agent-brief/v2");
  assert.equal(briefCall.structuredContent.result.readiness.release.profile, "production");
  const sourceDigest = briefCall.structuredContent.sourceDigest;
  const releaseCall = await client.callTool({ name: "get_release_verification", arguments: { projectPath: projectName } });
  assert.equal(releaseCall.isError, undefined);
  assert.equal(releaseCall.structuredContent.result.verification.valid, false);
  assert.equal(releaseCall.structuredContent.result.sourceDigest, sourceDigest);
  const contextCall = await client.callTool({ name: "get_project_context", arguments: { projectPath: projectName, view: "campaign" } });
  assert.equal(contextCall.isError, undefined);
  assert.equal(contextCall.structuredContent.result.schemaVersion, "looplab-agent-project-context/v1");
  assert.equal(contextCall.structuredContent.result.sourceDigest, sourceDigest);
  assert.equal(contextCall.structuredContent.result.mutationInput, false);
  assert.equal(contextCall.structuredContent.result.evidenceIndex.readiness.release.profile, "production");
  const initialChanges = await client.callTool({ name: "get_agent_changes", arguments: { projectPath: projectName } });
  assert.equal(initialChanges.isError, undefined);
  assert.equal(initialChanges.structuredContent.result.schemaVersion, "looplab-agent-change-feed/v1");
  assert.equal(initialChanges.structuredContent.result.returnedEventCount, 0);
  const initialChangeCursor = initialChanges.structuredContent.result.currentCursor;
  const target = project.objects.find((object) => object.kind === "platform");
  assert.ok(target);
  const reviewedColor = "#3f4046";

  const workRead = await client.callTool({ name: "get_work_ledger", arguments: { projectPath: projectName, eventLimit: 0 } });
  assert.equal(workRead.isError, undefined);
  assert.match(workRead.structuredContent.result.ledgerDigest, /^sha256:[a-f0-9]{64}$/);
  const emptyLedgerDigest = workRead.structuredContent.result.ledgerDigest;
  const workAdd = await client.callTool({
    name: "add_work_item",
    arguments: {
      projectPath: projectName,
      expectedLedgerDigest: emptyLedgerDigest,
      actor: "codex",
      item: { id: "mcp-shared-work", title: "MCP shared work", summary: "Prove independent shared-work persistence.", kind: "feature", priority: "high", scope: ["tests/mcp-server.test.mjs"] },
    },
  });
  assert.equal(workAdd.isError, undefined);
  assert.equal(workAdd.structuredContent.changed, true);
  assert.equal(workAdd.structuredContent.sourceDigest, sourceDigest, "coordination must not change gameplay source truth");
  const ledgerAfterAdd = workAdd.structuredContent.result.ledgerDigest;
  const staleWorkAdd = await client.callTool({
    name: "add_work_item",
    arguments: {
      projectPath: projectName,
      expectedLedgerDigest: emptyLedgerDigest,
      actor: "claude",
      item: { id: "stale-shared-work", title: "Stale shared work", summary: "This stale writer must be rejected." },
    },
  });
  assert.equal(staleWorkAdd.isError, true);
  assert.match(staleWorkAdd.structuredContent.error, /stale-ledger/);
  const workClaim = await client.callTool({ name: "claim_work_item", arguments: { projectPath: projectName, expectedLedgerDigest: ledgerAfterAdd, id: "mcp-shared-work", actor: "claude", leaseSeconds: 300 } });
  assert.equal(workClaim.isError, undefined);
  assert.equal(workClaim.structuredContent.result.item.claim.holder, "claude");

  const batchPreviewCall = await client.callTool({
    name: "preview_batch",
    arguments: {
      projectPath: projectName,
      expectedSourceDigest: sourceDigest,
      summary: "Recolor one platform through an exact reviewed MCP batch",
      commands: [{ op: "update_object", id: target.id, changes: { color: reviewedColor } }],
    },
  });
  assert.equal(batchPreviewCall.isError, undefined);
  assert.equal(batchPreviewCall.structuredContent.changed, false);
  assert.equal(batchPreviewCall.structuredContent.result.schemaVersion, "looplab-agent-batch-preview/v1");
  assert.equal(batchPreviewCall.structuredContent.result.applicable, true);
  assert.match(batchPreviewCall.structuredContent.result.previewDigest, /^sha256:[a-f0-9]{64}$/);
  const afterPreview = JSON.parse(await readFile(projectPath, "utf8"));
  assert.equal(afterPreview.objects.find((object) => object.id === target.id).color, target.color, "MCP preview must not persist its clone");

  const batchApplyCall = await client.callTool({
    name: "apply_previewed_batch",
    arguments: {
      projectPath: projectName,
      expectedSourceDigest: sourceDigest,
      expectedPreviewDigest: batchPreviewCall.structuredContent.result.previewDigest,
      summary: "Recolor one platform through an exact reviewed MCP batch",
      commands: [{ op: "update_object", id: target.id, changes: { color: reviewedColor } }],
    },
  });
  assert.equal(batchApplyCall.isError, undefined);
  assert.equal(batchApplyCall.structuredContent.changed, true);
  assert.equal(batchApplyCall.structuredContent.result.applied, true);
  assert.notEqual(batchApplyCall.structuredContent.sourceDigest, sourceDigest);
  const saved = JSON.parse(await readFile(projectPath, "utf8"));
  assert.equal(saved.objects.find((object) => object.id === target.id).color, reviewedColor);
  assert.equal(saved.agentWorkLedger.items.find((item) => item.id === "mcp-shared-work").claim.holder, "claude");
  const resumedChanges = await client.callTool({ name: "get_agent_changes", arguments: { projectPath: projectName, cursor: initialChangeCursor, limit: 16 } });
  assert.equal(resumedChanges.isError, undefined);
  assert.deepEqual(resumedChanges.structuredContent.result.events.map((event) => event.operation), ["add_work_item", "claim_work_item", "apply_previewed_batch"]);
  assert.equal(resumedChanges.structuredContent.result.resyncRequired, false);

  const staleMutation = await client.callTool({
    name: "update_object",
    arguments: {
      projectPath: projectName,
      expectedSourceDigest: sourceDigest,
      id: target.id,
      changes: { x: target.x + 8 },
    },
  });
  assert.equal(staleMutation.isError, true);
  assert.match(staleMutation.structuredContent.error, /stale-source/);
  const unchanged = JSON.parse(await readFile(projectPath, "utf8"));
  assert.equal(unchanged.objects.find((object) => object.id === target.id).x, target.x);
  assert.equal(unchanged.objects.find((object) => object.id === target.id).color, reviewedColor);

  const escaped = await client.callTool({ name: "get_agent_brief", arguments: { projectPath: "../escape.loop.json" } });
  assert.equal(escaped.isError, true);
  assert.match(escaped.structuredContent.error, /stay inside/);
});

test("browser MCP advertises the complete live-session surface without launching a browser", async (context) => {
  const workspace = await mkdtemp(join(tmpdir(), "looplab-mcp-browser-"));
  const { client, transport } = createMcpClient("browser", workspace);
  context.after(async () => {
    await client.close().catch(() => {});
    await rm(workspace, { recursive: true, force: true });
  });

  await client.connect(transport);
  const listed = await client.listTools();
  assert.equal(listed.tools.length, LOOPLAB_BROWSER_SESSION_COMMANDS.length);
  assert.ok(listed.tools.some((tool) => tool.name === "list_projects"));
  assert.ok(listed.tools.some((tool) => tool.name === "get_agent_brief"));
  assert.ok(listed.tools.some((tool) => tool.name === "get_agent_guide_index"));
  assert.ok(listed.tools.some((tool) => tool.name === "get_agent_changes"));
  assert.ok(listed.tools.some((tool) => tool.name === "get_project_context"));
  assert.ok(listed.tools.some((tool) => tool.name === "get_work_ledger"));
  assert.ok(listed.tools.some((tool) => tool.name === "claim_work_item"));
  assert.ok(listed.tools.some((tool) => tool.name === "preview_batch"));
  assert.ok(listed.tools.some((tool) => tool.name === "apply_previewed_batch"));
  assert.ok(listed.tools.some((tool) => tool.name === "start_ai_build"));
  assert.ok(listed.tools.some((tool) => tool.name === "verify_release"));
  assert.ok(listed.tools.some((tool) => tool.name === "get_release_verification_job"));
  assert.ok(listed.tools.some((tool) => tool.name === "cancel_release_verification_job"));
  const updateTool = listed.tools.find((tool) => tool.name === "update_object");
  assert.ok(updateTool.inputSchema.required.includes("expectedSourceDigest"));
});

const liveBrowserUrl = String(process.env.LOOPLAB_TEST_LIVE_URL ?? "").trim();

test("browser MCP drives the real running editor through one persistent page", { skip: !liveBrowserUrl }, async (context) => {
  const workspace = await mkdtemp(join(tmpdir(), "looplab-mcp-live-"));
  const { client, transport } = createMcpClient("browser", workspace, { appUrl: liveBrowserUrl });
  context.after(async () => {
    await client.close().catch(() => {});
    await rm(workspace, { recursive: true, force: true });
  });

  await client.connect(transport);
  const projectsCall = await client.callTool({ name: "list_projects", arguments: {} });
  assert.equal(projectsCall.isError, undefined);
  assert.equal(projectsCall.structuredContent.transport, "browser-session");
  assert.equal(projectsCall.structuredContent.response.ok, true);
  assert.ok(projectsCall.structuredContent.response.projects.length > 0);

  const briefCall = await client.callTool({ name: "get_agent_brief", arguments: { maxFindings: 3, maxNextActions: 3 } });
  assert.equal(briefCall.isError, undefined);
  assert.equal(briefCall.structuredContent.browser.connected, true);
  assert.equal(briefCall.structuredContent.browser.protocolVersion, LOOPLAB_PROTOCOL_VERSION);
  assert.equal(briefCall.structuredContent.response.result.schemaVersion, "looplab-agent-brief/v2");
  assert.equal(briefCall.structuredContent.response.result.readiness.release.profile, "production");
  assert.equal(briefCall.structuredContent.response.result.provider.source, "live-director-state");

  const guideCall = await client.callTool({ name: "get_agent_guide_index", arguments: { query: "stale source", category: "recovery", limit: 3 } });
  assert.equal(guideCall.isError, undefined);
  assert.equal(guideCall.structuredContent.response.index.entries[0].id, "stale-source");
  assert.equal(guideCall.structuredContent.response.index.policy.mayMutate, false);

  const contextCall = await client.callTool({ name: "get_project_context", arguments: { view: "campaign" } });
  assert.equal(contextCall.isError, undefined);
  assert.equal(contextCall.structuredContent.response.result.schemaVersion, "looplab-agent-project-context/v1");
  assert.equal(contextCall.structuredContent.response.result.mutationInput, false);
  assert.equal(contextCall.structuredContent.response.result.evidenceIndex.readiness.release.profile, "production");

  const macroRegistryCall = await client.callTool({ name: "list_command_macros", arguments: {} });
  assert.equal(macroRegistryCall.isError, undefined);
  assert.deepEqual(macroRegistryCall.structuredContent.response.result.macros.map((macro) => macro.id), ["place-supported-prop", "connect-maps-round-trip", "protect-completion-witness"]);
  const liveBrief = briefCall.structuredContent.response.result;
  const macroPreviewCall = await client.callTool({
    name: "preview_command_macro",
    arguments: {
      macroId: "place-supported-prop",
      parameters: {
        mapId: liveBrief.project.activeMapId,
        objectId: `mcp-live-preview-${process.pid}`,
        name: "MCP live preview prop",
        x: Math.max(0, liveBrief.project.size.width - 176),
        y: Math.max(0, liveBrief.project.size.height - 180),
        width: 48,
        height: 80,
        footprint: { offsetX: 8, offsetY: 58, width: 32, height: 22, collisionHeight: 1 },
        groundAnchor: { offsetX: 24, offsetY: 80 },
        supportMode: "auto",
        supportTolerance: 2,
      },
    },
  });
  assert.equal(macroPreviewCall.isError, undefined);
  const macroPlan = macroPreviewCall.structuredContent.response.result;
  assert.equal(macroPlan.sourceDigest, liveBrief.sourceDigest);
  assert.match(macroPlan.expansionDigest, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(macroPlan.commands.map((command) => command.op), ["add_object", "attach_to_support"]);
  const afterMacroBriefCall = await client.callTool({ name: "get_agent_brief", arguments: { maxFindings: 1, maxNextActions: 1 } });
  assert.equal(afterMacroBriefCall.structuredContent.response.result.sourceDigest, liveBrief.sourceDigest, "macro preview must not mutate the live editor");

  const captureCall = await client.callTool({ name: "capture_visual_review", arguments: {} });
  assert.equal(captureCall.isError, undefined);
  assert.equal(captureCall.structuredContent.response.ok, true);

  const compactCall = await client.callTool({ name: "get_visual_review", arguments: {} });
  const compactReport = compactCall.structuredContent.response.report;
  assert.equal(compactReport.version, 2);
  assert.ok(compactReport.captures.length > 0);
  assert.equal("dataUrl" in compactReport.captures[0], false);
  assert.equal("annotatedDataUrl" in compactReport.captures[0], false);
  assert.equal(compactReport.captures[0].perception.schemaVersion, "looplab-visual-perception/v1");
  assert.ok(compactReport.captures.every((capture) => capture.perception.annotations.every((annotation) => !("cropDataUrl" in annotation))));

  const richCall = await client.callTool({ name: "get_visual_review", arguments: { includeAnnotatedImages: true, includeCrops: true } });
  const richReport = richCall.structuredContent.response.report;
  assert.match(richReport.captures[0].annotatedDataUrl, /^data:image\/png;base64,/);
  const annotatedCapture = richReport.captures.find((capture) => capture.perception.annotations.length > 0);
  assert.ok(annotatedCapture);
  assert.match(annotatedCapture.perception.annotations.find((annotation) => annotation.cropDataUrl)?.cropDataUrl ?? "", /^data:image\/png;base64,/);

  const selectCall = await client.callTool({ name: "select_visual_review_capture", arguments: { captureId: annotatedCapture.id, includeAnnotatedImage: true, includeCrops: true } });
  assert.equal(selectCall.structuredContent.response.capture.id, annotatedCapture.id);
  assert.match(selectCall.structuredContent.response.capture.dataUrl, /^data:image\/png;base64,/);
  assert.match(selectCall.structuredContent.response.capture.annotatedDataUrl, /^data:image\/png;base64,/);
});
