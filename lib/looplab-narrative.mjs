import { canonicalSha256 } from "./looplab-canonical-digest.mjs";

export const LOOPLAB_NARRATIVE_CONTRACT_SCHEMA = "looplab-narrative-contract/v1";
export const LOOPLAB_NARRATIVE_REPORT_SCHEMA = "looplab-narrative-report/v1";

export const LOOPLAB_NARRATIVE_CONTRACT_POLICY = Object.freeze({
  contractSchemaVersion: LOOPLAB_NARRATIVE_CONTRACT_SCHEMA,
  reportSchemaVersion: LOOPLAB_NARRATIVE_REPORT_SCHEMA,
  sourceField: "narrativeContract",
  runtimeOwner: "gameplayProgram",
  roles: Object.freeze([
    Object.freeze({
      id: "narrative-designer",
      owns: Object.freeze(["story structure", "branching causality", "character continuity", "quest and ending state bindings"]),
    }),
    Object.freeze({
      id: "narrator-dialogue-writer",
      owns: Object.freeze(["narrator voice", "dialogue", "barks", "tutorial copy", "readable text equivalents"]),
    }),
  ]),
  inclusionPolicy: "The two narrative roles are routed together only when narrative work is explicitly requested or detected from authored intent. Mechanics-only work does not acquire mandatory story scope.",
  executionPolicy: "Both roles are stages inside the same selected-provider request. They do not create a second provider call or a second runtime state store.",
  implementationBoundary: "The contract annotates the deterministic gameplayProgram and authored maps; it never replaces them. Required beats and endings must resolve to stable runtime IDs and current acceptance evidence.",
  accessibilityBoundary: "Essential story information must have readable text. Audio may supplement that text but cannot be its only delivery path.",
  proofBoundary: "The report proves schema/reference validity, bounded structural reachability, and linked acceptance status. It does not claim prose quality, emotional impact, pacing taste, or fun.",
});

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const DELIVERY = new Set(["text", "audio", "text-and-audio", "environmental", "visual"]);
const VOICE_ROLES = new Set(["narrator", "character", "system", "environment"]);
const BEAT_KINDS = new Set(["setup", "character", "quest", "reveal", "choice", "consequence", "tutorial", "climax", "ending", "ambient", "custom"]);
const ENDING_KINDS = new Set(["success", "failure", "alternate", "open"]);
const STATUS = new Set(["draft", "implemented", "verified"]);

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const stableId = (value) => typeof value === "string" && STABLE_ID.test(value);
const cleanString = (value) => typeof value === "string" ? value.trim() : "";
const cleanOptionalString = (value) => {
  const normalized = cleanString(value);
  return normalized || undefined;
};
const cleanIdList = (value) => Array.isArray(value)
  ? [...new Set(value.map((entry) => cleanString(entry)).filter(Boolean))]
  : [];

function normalizeCharacter(character = {}) {
  return {
    ...clone(character),
    id: cleanString(character.id),
    name: cleanString(character.name ?? character.id),
    role: cleanOptionalString(character.role),
    description: cleanOptionalString(character.description),
  };
}

function normalizeLine(line = {}) {
  return {
    ...clone(line),
    id: cleanString(line.id),
    speakerId: cleanOptionalString(line.speakerId),
    voiceRole: VOICE_ROLES.has(line.voiceRole) ? line.voiceRole : line.speakerId ? "character" : "narrator",
    text: cleanString(line.text),
    textEquivalent: cleanOptionalString(line.textEquivalent),
    audioAssetId: cleanOptionalString(line.audioAssetId),
    delivery: DELIVERY.has(line.delivery) ? line.delivery : line.audioAssetId ? "text-and-audio" : "text",
    essential: line.essential === true,
  };
}

function normalizeBeat(beat = {}) {
  return {
    ...clone(beat),
    id: cleanString(beat.id),
    label: cleanString(beat.label ?? beat.id),
    kind: BEAT_KINDS.has(beat.kind) ? beat.kind : "custom",
    required: beat.required === true,
    essential: beat.essential === true,
    delivery: DELIVERY.has(beat.delivery) ? beat.delivery : "text",
    pageId: cleanOptionalString(beat.pageId),
    choiceId: cleanOptionalString(beat.choiceId),
    ruleId: cleanOptionalString(beat.ruleId),
    event: cleanOptionalString(beat.event),
    mapId: cleanOptionalString(beat.mapId),
    objectId: cleanOptionalString(beat.objectId),
    featureId: cleanOptionalString(beat.featureId),
    variableIds: cleanIdList(beat.variableIds),
    lineIds: cleanIdList(beat.lineIds),
    acceptanceTestIds: cleanIdList(beat.acceptanceTestIds),
  };
}

function normalizeEnding(ending = {}) {
  return {
    ...clone(ending),
    id: cleanString(ending.id),
    label: cleanString(ending.label ?? ending.id),
    kind: ENDING_KINDS.has(ending.kind) ? ending.kind : "alternate",
    pageId: cleanOptionalString(ending.pageId),
    choiceId: cleanOptionalString(ending.choiceId),
    ruleId: cleanOptionalString(ending.ruleId),
    beatId: cleanOptionalString(ending.beatId),
    acceptanceTestIds: cleanIdList(ending.acceptanceTestIds),
  };
}

export function normalizeNarrativeContract(input = {}) {
  return {
    ...clone(input),
    version: 1,
    status: STATUS.has(input.status) ? input.status : "draft",
    premise: cleanOptionalString(input.premise),
    entryPageIds: cleanIdList(input.entryPageIds),
    continuityTerms: cleanIdList(input.continuityTerms),
    characters: Array.isArray(input.characters) ? input.characters.map(normalizeCharacter) : [],
    lines: Array.isArray(input.lines) ? input.lines.map(normalizeLine) : [],
    beats: Array.isArray(input.beats) ? input.beats.map(normalizeBeat) : [],
    endings: Array.isArray(input.endings) ? input.endings.map(normalizeEnding) : [],
  };
}

function authoredMaps(project) {
  return Array.isArray(project?.maps) && project.maps.length
    ? project.maps
    : [{ id: project?.activeMapId ?? "map-main", objects: project?.objects ?? [] }];
}

function addIssue(collection, severity, code, message, context = {}) {
  collection.push({ severity, code, message, ...context });
}

function validateUniqueIds(records, field, issues) {
  const ids = new Set();
  for (const [index, record] of records.entries()) {
    const path = `narrativeContract.${field}[${index}]`;
    if (!stableId(record.id)) addIssue(issues, "error", "narrative-id-invalid", `${path}.id must be a stable non-empty ID.`, { field, index });
    else if (ids.has(record.id)) addIssue(issues, "error", "narrative-id-duplicate", `${path}.id duplicates ${record.id}.`, { field, index, id: record.id });
    else ids.add(record.id);
  }
  return ids;
}

function buildChoiceGraph(program) {
  const pages = Array.isArray(program?.choicePages) ? program.choicePages : [];
  const pageById = new Map(pages.filter((page) => stableId(page?.id)).map((page) => [page.id, page]));
  const choiceById = new Map();
  const choiceOwner = new Map();
  const adjacency = new Map([...pageById.keys()].map((id) => [id, []]));
  const exits = [];
  const blockingTerminals = [];
  let edgeCount = 0;
  for (const page of pages) {
    if (!stableId(page?.id)) continue;
    for (const choice of page.choices ?? []) {
      if (stableId(choice?.id)) {
        choiceById.set(choice.id, choice);
        choiceOwner.set(choice.id, page.id);
      }
      if (stableId(choice?.nextPageId) && pageById.has(choice.nextPageId)) {
        adjacency.get(page.id).push({ choiceId: choice.id, targetPageId: choice.nextPageId });
        edgeCount += 1;
      } else if (choice?.close !== false) exits.push({ pageId: page.id, choiceId: choice.id });
      else blockingTerminals.push({ pageId: page.id, choiceId: choice.id });
    }
  }
  return { pages, pageById, choiceById, choiceOwner, adjacency, exits, blockingTerminals, edgeCount };
}

function entryPages(program, contract, graph) {
  const entries = [];
  const add = (pageId, source) => {
    if (!stableId(pageId) || !graph.pageById.has(pageId) || entries.some((entry) => entry.pageId === pageId)) return;
    entries.push({ pageId, source });
  };
  for (const pageId of contract.entryPageIds) add(pageId, "narrative-contract");
  add(program?.initialChoicePageId, "gameplay-program-initial");
  for (const rule of program?.rules ?? []) {
    if (rule?.enabled === false) continue;
    for (const effect of rule?.effects ?? []) if (effect?.type === "open-choice-page") add(effect.pageId, `gameplay-rule:${rule.id}`);
  }
  return entries;
}

function shortestPagePaths(graph, entries) {
  const paths = new Map();
  const queue = [];
  for (const entry of entries) {
    if (!paths.has(entry.pageId)) {
      paths.set(entry.pageId, [{ type: "page", id: entry.pageId }]);
      queue.push(entry.pageId);
    }
  }
  while (queue.length) {
    const pageId = queue.shift();
    const path = paths.get(pageId);
    for (const edge of graph.adjacency.get(pageId) ?? []) {
      if (paths.has(edge.targetPageId)) continue;
      paths.set(edge.targetPageId, [...path, { type: "choice", id: edge.choiceId }, { type: "page", id: edge.targetPageId }]);
      queue.push(edge.targetPageId);
    }
  }
  return paths;
}

function pagesThatCanReachResolution(graph, endingPageIds, endingChoiceIds) {
  const reverse = new Map([...graph.pageById.keys()].map((id) => [id, []]));
  for (const [source, edges] of graph.adjacency) for (const edge of edges) reverse.get(edge.targetPageId)?.push(source);
  const seeds = new Set(endingPageIds);
  for (const choiceId of endingChoiceIds) {
    const owner = graph.choiceOwner.get(choiceId);
    if (owner) seeds.add(owner);
  }
  for (const exit of graph.exits) seeds.add(exit.pageId);
  const queue = [...seeds];
  const reachable = new Set(seeds);
  while (queue.length) {
    const pageId = queue.shift();
    for (const source of reverse.get(pageId) ?? []) if (!reachable.has(source)) {
      reachable.add(source);
      queue.push(source);
    }
  }
  return reachable;
}

function stronglyConnectedComponents(graph, reachablePageIds) {
  let nextIndex = 0;
  const indexes = new Map();
  const lowLinks = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];
  const visit = (pageId) => {
    indexes.set(pageId, nextIndex);
    lowLinks.set(pageId, nextIndex);
    nextIndex += 1;
    stack.push(pageId);
    onStack.add(pageId);
    for (const edge of graph.adjacency.get(pageId) ?? []) {
      const target = edge.targetPageId;
      if (!reachablePageIds.has(target)) continue;
      if (!indexes.has(target)) {
        visit(target);
        lowLinks.set(pageId, Math.min(lowLinks.get(pageId), lowLinks.get(target)));
      } else if (onStack.has(target)) lowLinks.set(pageId, Math.min(lowLinks.get(pageId), indexes.get(target)));
    }
    if (lowLinks.get(pageId) !== indexes.get(pageId)) return;
    const component = [];
    while (stack.length) {
      const member = stack.pop();
      onStack.delete(member);
      component.push(member);
      if (member === pageId) break;
    }
    components.push(component.sort());
  };
  for (const pageId of reachablePageIds) if (!indexes.has(pageId)) visit(pageId);
  return components;
}

function acceptanceStatusMap(options) {
  const map = new Map();
  for (const item of options?.acceptancePlan?.items ?? []) if (stableId(item?.id)) map.set(item.id, item.status);
  for (const id of options?.passingTestIds ?? []) if (stableId(id)) map.set(id, "passed");
  return map;
}

function evidenceStatus(ids, statusById) {
  if (!ids.length) return "missing";
  const statuses = ids.map((id) => statusById.get(id) ?? "unknown");
  if (statuses.some((status) => status === "failed" || status === "invalid")) return "failed";
  if (statuses.some((status) => status === "stale")) return "stale";
  if (statuses.every((status) => status === "passed")) return "passed";
  if (statuses.some((status) => status === "specified" || status === "recordable")) return "specified";
  if (statuses.some((status) => status === "passed")) return "partial";
  return "unknown";
}

function beatStructuralStatus(beat, graph, shortestPaths, indexes, evidence) {
  if (evidence === "passed") return "evidence-passed";
  if (beat.pageId) return shortestPaths.has(beat.pageId) ? "reachable" : "unreachable";
  if (beat.choiceId) {
    const owner = graph.choiceOwner.get(beat.choiceId);
    return owner && shortestPaths.has(owner) ? "reachable" : "unreachable";
  }
  if (beat.ruleId && indexes.ruleIds.has(beat.ruleId)) return "runtime-bound-unproven";
  if (beat.event || beat.mapId || beat.objectId || beat.featureId || beat.variableIds.length) return "runtime-bound-unproven";
  return "content-only-unbound";
}

export function inspectNarrativeContract(project, input = project?.narrativeContract, options = {}) {
  const required = project?.qualityContracts?.narrativeContractRequired === true;
  const sourceDigest = options.sourceDigest ?? null;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    const absent = {
      schemaVersion: LOOPLAB_NARRATIVE_REPORT_SCHEMA,
      contractSchemaVersion: LOOPLAB_NARRATIVE_CONTRACT_SCHEMA,
      present: false,
      required,
      status: required ? "missing" : "absent",
      sourceDigest,
      contractDigest: null,
      contract: null,
      errors: [],
      warnings: [],
      issues: [],
      metrics: { characterCount: 0, lineCount: 0, beatCount: 0, requiredBeatCount: 0, endingCount: 0, reachableEndingCount: 0, pageCount: project?.gameplayProgram?.choicePages?.length ?? 0, reachablePageCount: 0, unreachablePageCount: 0, trapCycleCount: 0 },
      analysis: { status: "not-run", complete: true, method: "bounded-structural-choice-graph", nodeBudget: 128, edgeBudget: 2048, examinedNodes: 0, examinedEdges: 0 },
      entries: [],
      pages: { reachableIds: [], unreachableIds: [], exits: [], blockingTerminals: [] },
      beats: [],
      endings: [],
      trapCycles: [],
      shortestEndingPaths: [],
      proofBoundary: LOOPLAB_NARRATIVE_CONTRACT_POLICY.proofBoundary,
    };
    return { ...absent, digest: canonicalSha256(absent) };
  }

  const contract = normalizeNarrativeContract(input);
  const issues = [];
  const max = { characters: 64, lines: 512, beats: 256, endings: 32, pages: 128, edges: 2048 };
  if (input.version !== 1) addIssue(issues, "error", "narrative-version-invalid", "narrativeContract.version must be 1.");
  for (const [field, maximum] of [["characters", max.characters], ["lines", max.lines], ["beats", max.beats], ["endings", max.endings]]) {
    if (!Array.isArray(input[field])) addIssue(issues, "error", "narrative-collection-invalid", `narrativeContract.${field} must be an array.`, { field });
    else if (input[field].length > maximum) addIssue(issues, "error", "narrative-collection-limit", `narrativeContract.${field} must contain at most ${maximum} records.`, { field, maximum });
  }

  const characterIds = validateUniqueIds(contract.characters, "characters", issues);
  const lineIds = validateUniqueIds(contract.lines, "lines", issues);
  const beatIds = validateUniqueIds(contract.beats, "beats", issues);
  validateUniqueIds(contract.endings, "endings", issues);

  const program = project?.gameplayProgram ?? {};
  const graph = buildChoiceGraph(program);
  const maps = authoredMaps(project);
  const mapIds = new Set(maps.map((map) => map?.id).filter(stableId));
  const objectOwners = new Map();
  for (const map of maps) for (const object of map?.objects ?? []) if (stableId(object?.id)) {
    if (!objectOwners.has(object.id)) objectOwners.set(object.id, []);
    objectOwners.get(object.id).push(map.id);
  }
  const indexes = {
    variableIds: new Set((program.variables ?? []).map((entry) => entry?.id).filter(stableId)),
    ruleIds: new Set((program.rules ?? []).map((entry) => entry?.id).filter(stableId)),
    pageIds: new Set(graph.pageById.keys()),
    choiceIds: new Set(graph.choiceById.keys()),
    mapIds,
    featureIds: new Set((project?.featureContracts ?? []).map((entry) => entry?.id).filter(stableId)),
    acceptanceIds: new Set([...(project?.acceptanceTests ?? []), ...(project?.replay?.cases ?? [])].map((entry) => entry?.id).filter(stableId)),
  };

  for (const [index, pageId] of contract.entryPageIds.entries()) if (!indexes.pageIds.has(pageId)) addIssue(issues, "error", "narrative-entry-page-missing", `narrativeContract.entryPageIds[${index}] references missing choice page ${pageId}.`, { pageId });
  for (const [index, character] of contract.characters.entries()) if (!character.name) addIssue(issues, "warning", "narrative-character-name-missing", `narrativeContract.characters[${index}] has no player-facing name.`, { characterId: character.id });
  for (const [index, line] of contract.lines.entries()) {
    const path = `narrativeContract.lines[${index}]`;
    if (line.speakerId && !characterIds.has(line.speakerId)) addIssue(issues, "error", "narrative-speaker-missing", `${path}.speakerId references missing character ${line.speakerId}.`, { lineId: line.id, characterId: line.speakerId });
    const readable = Boolean(line.text || line.textEquivalent);
    if (!readable) addIssue(issues, line.essential ? "error" : "warning", "narrative-line-not-readable", `${path} has no readable text or textEquivalent.`, { lineId: line.id });
    if (["audio", "text-and-audio"].includes(line.delivery) && !line.audioAssetId) addIssue(issues, "warning", "narrative-audio-asset-missing", `${path} declares audio delivery without an audioAssetId.`, { lineId: line.id });
  }

  const validateAcceptanceRefs = (ids, path, context) => {
    for (const id of ids) if (!indexes.acceptanceIds.has(id)) addIssue(issues, "error", "narrative-acceptance-missing", `${path} references missing acceptance or replay test ${id}.`, { ...context, testId: id });
  };
  const validateRuntimeRefs = (record, path, context) => {
    if (record.pageId && !indexes.pageIds.has(record.pageId)) addIssue(issues, "error", "narrative-page-missing", `${path}.pageId references missing choice page ${record.pageId}.`, { ...context, pageId: record.pageId });
    if (record.choiceId && !indexes.choiceIds.has(record.choiceId)) addIssue(issues, "error", "narrative-choice-missing", `${path}.choiceId references missing choice ${record.choiceId}.`, { ...context, choiceId: record.choiceId });
    if (record.ruleId && !indexes.ruleIds.has(record.ruleId)) addIssue(issues, "error", "narrative-rule-missing", `${path}.ruleId references missing gameplay rule ${record.ruleId}.`, { ...context, ruleId: record.ruleId });
  };
  for (const [index, beat] of contract.beats.entries()) {
    const path = `narrativeContract.beats[${index}]`;
    const context = { beatId: beat.id };
    if (!beat.label) addIssue(issues, "warning", "narrative-beat-label-missing", `${path} has no player-facing label.`, context);
    validateRuntimeRefs(beat, path, context);
    if (beat.mapId && !mapIds.has(beat.mapId)) addIssue(issues, "error", "narrative-map-missing", `${path}.mapId references missing map ${beat.mapId}.`, { ...context, mapId: beat.mapId });
    if (beat.objectId) {
      const owners = objectOwners.get(beat.objectId) ?? [];
      if (!owners.length) addIssue(issues, "error", "narrative-object-missing", `${path}.objectId references missing object ${beat.objectId}.`, { ...context, objectId: beat.objectId });
      else if (beat.mapId && !owners.includes(beat.mapId)) addIssue(issues, "error", "narrative-object-map-mismatch", `${path}.objectId ${beat.objectId} is not owned by map ${beat.mapId}.`, { ...context, objectId: beat.objectId, mapId: beat.mapId });
      else if (!beat.mapId && owners.length > 1) addIssue(issues, "error", "narrative-object-map-ambiguous", `${path} must provide mapId because object ${beat.objectId} exists in multiple maps.`, { ...context, objectId: beat.objectId });
    }
    if (beat.featureId && !indexes.featureIds.has(beat.featureId)) addIssue(issues, "error", "narrative-feature-missing", `${path}.featureId references missing feature contract ${beat.featureId}.`, { ...context, featureId: beat.featureId });
    for (const id of beat.variableIds) if (!indexes.variableIds.has(id)) addIssue(issues, "error", "narrative-variable-missing", `${path}.variableIds references missing gameplay variable ${id}.`, { ...context, variableId: id });
    for (const id of beat.lineIds) if (!lineIds.has(id)) addIssue(issues, "error", "narrative-line-missing", `${path}.lineIds references missing narrative line ${id}.`, { ...context, lineId: id });
    validateAcceptanceRefs(beat.acceptanceTestIds, `${path}.acceptanceTestIds`, context);
    const hasRuntimeBinding = Boolean(beat.pageId || beat.choiceId || beat.ruleId || beat.event || beat.mapId || beat.objectId || beat.featureId || beat.variableIds.length);
    if (beat.required && !hasRuntimeBinding) addIssue(issues, "error", "narrative-beat-unbound", `${path} is required but has no stable runtime, map, object, feature, or state binding.`, context);
    if (beat.required && !beat.acceptanceTestIds.length) addIssue(issues, "warning", "narrative-beat-evidence-missing", `${path} is required but has no acceptanceTestIds.`, context);
    if (beat.essential && beat.delivery === "audio") {
      const readable = beat.lineIds.some((id) => {
        const line = contract.lines.find((candidate) => candidate.id === id);
        return Boolean(line?.text || line?.textEquivalent);
      });
      if (!readable) addIssue(issues, "error", "narrative-essential-audio-only", `${path} makes essential information audio-only without readable text.`, context);
    }
  }

  for (const [index, ending] of contract.endings.entries()) {
    const path = `narrativeContract.endings[${index}]`;
    const context = { endingId: ending.id };
    validateRuntimeRefs(ending, path, context);
    if (ending.beatId && !beatIds.has(ending.beatId)) addIssue(issues, "error", "narrative-ending-beat-missing", `${path}.beatId references missing beat ${ending.beatId}.`, { ...context, beatId: ending.beatId });
    if (!ending.pageId && !ending.choiceId && !ending.ruleId && !ending.beatId) addIssue(issues, "error", "narrative-ending-unbound", `${path} has no stable page, choice, rule, or beat binding.`, context);
    validateAcceptanceRefs(ending.acceptanceTestIds, `${path}.acceptanceTestIds`, context);
    if (!ending.acceptanceTestIds.length) addIssue(issues, "warning", "narrative-ending-evidence-missing", `${path} has no acceptanceTestIds.`, context);
  }

  const complete = graph.pageById.size <= max.pages && graph.edgeCount <= max.edges;
  if (!complete) addIssue(issues, "warning", "narrative-analysis-incomplete", `Narrative graph exceeds the bounded analysis budget of ${max.pages} pages and ${max.edges} edges.`);
  const entries = entryPages(program, contract, graph);
  if (graph.pageById.size && !entries.length) addIssue(issues, "error", "narrative-entry-missing", "The gameplay program has narrative choice pages but no valid narrative entry page or open-choice-page rule.");
  const shortestPaths = complete ? shortestPagePaths(graph, entries) : new Map();
  const reachableIds = [...shortestPaths.keys()].sort();
  const reachableSet = new Set(reachableIds);
  const unreachableIds = complete ? [...graph.pageById.keys()].filter((id) => !reachableSet.has(id)).sort() : [];
  for (const pageId of unreachableIds) addIssue(issues, "warning", "narrative-page-unreachable", `Choice page ${pageId} is not structurally reachable from an authored entry.`, { pageId });

  const statusByTestId = acceptanceStatusMap(options);
  const evidenceAvailable = Boolean(options?.acceptancePlan || options?.passingTestIds);
  const beatReports = contract.beats.map((beat) => {
    const evidence = evidenceAvailable ? evidenceStatus(beat.acceptanceTestIds, statusByTestId) : "not-evaluated";
    const structuralStatus = beatStructuralStatus(beat, graph, shortestPaths, indexes, evidence);
    const ownerPageId = beat.choiceId ? graph.choiceOwner.get(beat.choiceId) ?? null : beat.pageId ?? null;
    const path = ownerPageId && shortestPaths.has(ownerPageId) ? shortestPaths.get(ownerPageId) : [];
    if (beat.required && structuralStatus === "unreachable") addIssue(issues, "error", "narrative-beat-unreachable", `Required narrative beat ${beat.id} is structurally unreachable.`, { beatId: beat.id, pageId: ownerPageId });
    if (beat.required && ["runtime-bound-unproven", "content-only-unbound"].includes(structuralStatus) && evidence !== "passed") addIssue(issues, "warning", "narrative-beat-unproven", `Required narrative beat ${beat.id} has no current executable witness.`, { beatId: beat.id });
    if (evidenceAvailable && beat.required && ["failed", "stale", "specified", "partial", "unknown"].includes(evidence)) addIssue(issues, "warning", "narrative-beat-evidence-not-passing", `Required narrative beat ${beat.id} has ${evidence} acceptance evidence.`, { beatId: beat.id });
    return { id: beat.id, label: beat.label, kind: beat.kind, required: beat.required, structuralStatus, evidenceStatus: evidence, ownerPageId, shortestPath: path };
  });
  const beatReportById = new Map(beatReports.map((beat) => [beat.id, beat]));
  const endingReports = contract.endings.map((ending) => {
    const evidence = evidenceAvailable ? evidenceStatus(ending.acceptanceTestIds, statusByTestId) : "not-evaluated";
    const ownerPageId = ending.choiceId ? graph.choiceOwner.get(ending.choiceId) ?? null : ending.pageId ?? null;
    let structuralStatus = "runtime-bound-unproven";
    if (evidence === "passed") structuralStatus = "evidence-passed";
    else if (ownerPageId) structuralStatus = shortestPaths.has(ownerPageId) ? "reachable" : "unreachable";
    else if (ending.beatId) structuralStatus = beatReportById.get(ending.beatId)?.structuralStatus ?? "unbound";
    else if (!ending.ruleId) structuralStatus = "unbound";
    const shortestPath = ownerPageId && shortestPaths.has(ownerPageId)
      ? [...shortestPaths.get(ownerPageId), ...(ending.choiceId ? [{ type: "choice", id: ending.choiceId }] : [])]
      : [];
    if (structuralStatus === "unreachable") addIssue(issues, "error", "narrative-ending-unreachable", `Narrative ending ${ending.id} is structurally unreachable.`, { endingId: ending.id, pageId: ownerPageId });
    if (evidenceAvailable && ["failed", "stale", "specified", "partial", "unknown"].includes(evidence)) addIssue(issues, "warning", "narrative-ending-evidence-not-passing", `Narrative ending ${ending.id} has ${evidence} acceptance evidence.`, { endingId: ending.id });
    return { id: ending.id, label: ending.label, kind: ending.kind, structuralStatus, evidenceStatus: evidence, ownerPageId, shortestPath };
  });

  const reachableEndingCount = endingReports.filter((ending) => ["reachable", "evidence-passed"].includes(ending.structuralStatus)).length;
  if (contract.endings.length && reachableEndingCount === 0) addIssue(issues, "error", "narrative-no-reachable-ending", "The narrative contract has no structurally reachable or acceptance-proven ending.");
  const endingPageIds = new Set(contract.endings.map((ending) => ending.pageId).filter((id) => indexes.pageIds.has(id)));
  const endingChoiceIds = new Set(contract.endings.map((ending) => ending.choiceId).filter((id) => indexes.choiceIds.has(id)));
  for (const terminal of graph.blockingTerminals) if (reachableSet.has(terminal.pageId) && !endingChoiceIds.has(terminal.choiceId)) addIssue(issues, "error", "narrative-blocking-terminal", `Choice ${terminal.choiceId || "(missing ID)"} on page ${terminal.pageId} neither advances nor closes the modal.`, terminal);

  const resolvablePages = complete ? pagesThatCanReachResolution(graph, endingPageIds, endingChoiceIds) : new Set();
  const components = complete ? stronglyConnectedComponents(graph, reachableSet) : [];
  const trapCycles = components.filter((component) => {
    const cyclic = component.length > 1 || (graph.adjacency.get(component[0]) ?? []).some((edge) => edge.targetPageId === component[0]);
    return cyclic && component.every((pageId) => !resolvablePages.has(pageId));
  }).map((pageIds, index) => ({ id: `trap-cycle-${index + 1}`, pageIds }));
  for (const trap of trapCycles) addIssue(issues, "error", "narrative-trap-cycle", `Narrative choice cycle cannot reach a gameplay exit or authored ending: ${trap.pageIds.join(", ")}.`, { pageIds: trap.pageIds });

  if (contract.status === "verified" && issues.some((issue) => issue.severity !== "info")) addIssue(issues, "error", "narrative-false-verification", "The narrative contract is marked verified while the current report still has findings.");
  const errors = issues.filter((issue) => issue.severity === "error").map((issue) => issue.message);
  const warnings = issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message);
  const reportWithoutDigest = {
    schemaVersion: LOOPLAB_NARRATIVE_REPORT_SCHEMA,
    contractSchemaVersion: LOOPLAB_NARRATIVE_CONTRACT_SCHEMA,
    present: true,
    required,
    status: !complete ? "incomplete" : errors.length ? "failed" : warnings.length ? "passes-with-findings" : "passed",
    sourceDigest,
    contractDigest: canonicalSha256(contract),
    contract,
    errors,
    warnings,
    issues,
    metrics: {
      characterCount: contract.characters.length,
      lineCount: contract.lines.length,
      beatCount: contract.beats.length,
      requiredBeatCount: contract.beats.filter((beat) => beat.required).length,
      endingCount: contract.endings.length,
      reachableEndingCount,
      pageCount: graph.pageById.size,
      reachablePageCount: reachableIds.length,
      unreachablePageCount: unreachableIds.length,
      exitCount: graph.exits.length,
      blockingTerminalCount: graph.blockingTerminals.length,
      trapCycleCount: trapCycles.length,
    },
    analysis: {
      status: complete ? "complete" : "incomplete",
      complete,
      method: "bounded-structural-choice-graph",
      conditionModel: "structural-overapproximation; runtime conditions require acceptance or replay witnesses",
      nodeBudget: max.pages,
      edgeBudget: max.edges,
      examinedNodes: graph.pageById.size,
      examinedEdges: graph.edgeCount,
    },
    entries,
    pages: { reachableIds, unreachableIds, exits: graph.exits, blockingTerminals: graph.blockingTerminals },
    beats: beatReports,
    endings: endingReports,
    trapCycles,
    shortestEndingPaths: endingReports.filter((ending) => ending.shortestPath.length).map((ending) => ({ endingId: ending.id, path: ending.shortestPath })),
    proofBoundary: LOOPLAB_NARRATIVE_CONTRACT_POLICY.proofBoundary,
  };
  return { ...reportWithoutDigest, digest: canonicalSha256(reportWithoutDigest) };
}

export const getNarrativeReport = inspectNarrativeContract;
