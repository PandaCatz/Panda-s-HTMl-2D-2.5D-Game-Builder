import { canonicalJson } from "./looplab-canonical-digest.mjs";

export const LOOPLAB_PROJECT_READ_SCHEMA = "looplab-project-read/v1";
export const LOOPLAB_PROJECT_QUERY_LIMITS = Object.freeze({
  maximumPointers: 32,
  maximumSelectorSegments: 16,
  maximumMatches: 256,
  maximumPatchOperations: 4096,
});

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const pointerToken = (value) => String(value).replace(/~/g, "~0").replace(/\//g, "~1");

function appendPatch(operations, operation) {
  if (operations.length >= LOOPLAB_PROJECT_QUERY_LIMITS.maximumPatchOperations) {
    throw new Error(`Project diff exceeds ${LOOPLAB_PROJECT_QUERY_LIMITS.maximumPatchOperations} operations; request compact=true or refresh the full project.`);
  }
  operations.push(operation);
}

function diffValue(before, after, path, operations) {
  if (same(before, after)) return;
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) {
      appendPatch(operations, { op: "replace", path, value: clone(after) });
      return;
    }
    for (let index = 0; index < after.length; index += 1) diffValue(before[index], after[index], `${path}/${index}`, operations);
    return;
  }
  if (Array.isArray(before) || Array.isArray(after) || !before || !after || typeof before !== "object" || typeof after !== "object") {
    appendPatch(operations, { op: "replace", path, value: clone(after) });
    return;
  }
  const beforeKeys = Object.keys(before).filter((key) => before[key] !== undefined).sort();
  const afterKeys = Object.keys(after).filter((key) => after[key] !== undefined).sort();
  const afterSet = new Set(afterKeys);
  for (const key of beforeKeys.filter((key) => !afterSet.has(key)).reverse()) {
    appendPatch(operations, { op: "remove", path: `${path}/${pointerToken(key)}` });
  }
  const beforeSet = new Set(beforeKeys);
  for (const key of afterKeys) {
    const childPath = `${path}/${pointerToken(key)}`;
    if (!beforeSet.has(key)) appendPatch(operations, { op: "add", path: childPath, value: clone(after[key]) });
    else diffValue(before[key], after[key], childPath, operations);
  }
}

export function buildProjectJsonPatch(before, after) {
  const operations = [];
  diffValue(before, after, "", operations);
  return operations;
}

function decodePointerToken(value) {
  if (/~(?:[^01]|$)/.test(value)) throw new Error(`Invalid JSON Pointer escape in ${value}.`);
  return value.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function readJsonPointer(document, pointer) {
  if (typeof pointer !== "string" || !pointer.startsWith("/")) throw new Error("JSON Pointer must start with /.");
  let current = document;
  for (const rawToken of pointer.slice(1).split("/")) {
    const token = decodePointerToken(rawToken);
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) return { found: false, value: null };
      const index = Number(token);
      if (index >= current.length) return { found: false, value: null };
      current = current[index];
    } else if (current && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, token)) {
      current = current[token];
    } else return { found: false, value: null };
  }
  return { found: true, value: clone(current) };
}

function selectorExpected(raw) {
  const trimmed = raw.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function selectorSegments(select) {
  if (typeof select !== "string" || !select.trim()) throw new Error("query_project requires a non-empty select expression or JSON pointers.");
  const segments = select.trim().split(".");
  if (segments.length > LOOPLAB_PROJECT_QUERY_LIMITS.maximumSelectorSegments) throw new Error(`Project selector may contain at most ${LOOPLAB_PROJECT_QUERY_LIMITS.maximumSelectorSegments} segments.`);
  return segments.map((segment) => {
    const match = /^([A-Za-z_$][A-Za-z0-9_$-]*)(?:\[([^\]]+)\])?$/.exec(segment);
    if (!match) throw new Error(`Unsupported project selector segment: ${segment}.`);
    const bracket = match[2] ?? null;
    if (bracket === null) return { property: match[1], kind: "property" };
    if (/^(0|[1-9][0-9]*)$/.test(bracket)) return { property: match[1], kind: "index", index: Number(bracket) };
    const filter = /^([A-Za-z_$][A-Za-z0-9_$-]*)=(.+)$/.exec(bracket);
    if (!filter) throw new Error(`Selector bracket must be an array index or key=value filter: ${segment}.`);
    return { property: match[1], kind: "filter", filterKey: filter[1], expected: selectorExpected(filter[2]) };
  });
}

export function selectProjectValues(document, select) {
  let values = [document];
  for (const segment of selectorSegments(select)) {
    const next = [];
    for (const value of values) {
      if (!value || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, segment.property)) continue;
      const propertyValue = value[segment.property];
      if (segment.kind === "property") next.push(propertyValue);
      else if (segment.kind === "index") {
        if (Array.isArray(propertyValue) && segment.index < propertyValue.length) next.push(propertyValue[segment.index]);
      } else if (Array.isArray(propertyValue)) {
        next.push(...propertyValue.filter((entry) => entry && typeof entry === "object" && Object.is(entry[segment.filterKey], segment.expected)));
      }
      if (next.length > LOOPLAB_PROJECT_QUERY_LIMITS.maximumMatches) throw new Error(`Project selector exceeds ${LOOPLAB_PROJECT_QUERY_LIMITS.maximumMatches} matches; narrow the filter.`);
    }
    values = next;
  }
  return clone(values);
}

export function queryProjectDocument(document, { select, pointers } = {}) {
  const hasSelect = typeof select === "string" && select.trim().length > 0;
  const hasPointers = Array.isArray(pointers) && pointers.length > 0;
  if (hasSelect === hasPointers) throw new Error("query_project requires exactly one of select or pointers.");
  if (hasSelect) {
    const matches = selectProjectValues(document, select);
    return {
      schemaVersion: LOOPLAB_PROJECT_READ_SCHEMA,
      mode: "selector",
      select: select.trim(),
      matchCount: matches.length,
      value: matches.length === 1 ? matches[0] : matches,
    };
  }
  if (pointers.length > LOOPLAB_PROJECT_QUERY_LIMITS.maximumPointers) throw new Error(`query_project accepts at most ${LOOPLAB_PROJECT_QUERY_LIMITS.maximumPointers} pointers.`);
  const unique = [...new Set(pointers.map((pointer) => String(pointer)))];
  if (unique.length !== pointers.length) throw new Error("query_project pointers must be unique.");
  return {
    schemaVersion: LOOPLAB_PROJECT_READ_SCHEMA,
    mode: "json-pointer",
    pointers: unique.map((pointer) => ({ pointer, ...readJsonPointer(document, pointer) })),
  };
}
