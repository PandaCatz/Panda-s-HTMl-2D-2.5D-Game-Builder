import { canonicalJson, canonicalSha256, sha256Hex } from "./looplab-canonical-digest.mjs";

export const LOOPLAB_SHARED_PROJECT_REVISION_PREFIX = "revision-";
export const LOOPLAB_SHARED_PROJECT_REVISION_PATTERN = "^revision-[a-f0-9]{64}$";
export const LOOPLAB_SHARED_PROJECT_REBASE_SCHEMA = "looplab-shared-project-rebase/v1";
export const LOOPLAB_SHARED_PROJECT_REBASE_POLICY = Object.freeze({
  merge: "three-way stable-ID-aware",
  ordinaryArrays: "atomic",
  stableIdArrays: "merge independent IDs and recurse within matching IDs",
  sameFieldConflict: "never choose a winner",
  deleteEditConflict: "never choose a winner",
  apply: "explicit digest-bound browser mutation; never auto-save",
  maximumReportedPaths: 256,
  maximumReportedConflicts: 256,
});

const ABSENT = Symbol("looplab-shared-project-absent");
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const clone = (value) => value === ABSENT ? ABSENT : JSON.parse(JSON.stringify(value));
const equal = (left, right) => left === ABSENT || right === ABSENT ? left === right : canonicalJson(left) === canonicalJson(right);
const pathSegment = (value) => String(value).replace(/~/g, "~0").replace(/\//g, "~1");
const childPath = (path, key) => `${path}/${pathSegment(key)}`;
const idPath = (path, id) => `${path}/@${pathSegment(id)}`;
const valueKind = (value) => value === ABSENT ? "absent" : value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

function uniqueStableIdArray(value) {
  if (!Array.isArray(value)) return false;
  const ids = value.map((entry) => isObject(entry) && typeof entry.id === "string" && entry.id.trim() ? entry.id : null);
  return ids.every(Boolean) && new Set(ids).size === ids.length;
}

function supportsStableIdMerge(base, local, remote) {
  const arrays = [base, local, remote].filter((value) => value !== ABSENT);
  return arrays.every(Array.isArray) && arrays.some((value) => value.length > 0) && arrays.every((value) => value.length === 0 || uniqueStableIdArray(value));
}

function boundedPush(target, value, maximum, overflow) {
  if (target.length < maximum) target.push(value);
  else overflow.count += 1;
}

function collectChangePaths(base, candidate, path, target, overflow) {
  if (equal(base, candidate)) return;
  if (base === ABSENT || candidate === ABSENT || base === null || candidate === null || typeof base !== "object" || typeof candidate !== "object") {
    boundedPush(target, path || "/", LOOPLAB_SHARED_PROJECT_REBASE_POLICY.maximumReportedPaths, overflow);
    return;
  }
  if (Array.isArray(base) || Array.isArray(candidate)) {
    if (supportsStableIdMerge(base, candidate, [])) {
      const baseById = new Map(base.map((entry) => [entry.id, entry]));
      const candidateById = new Map(candidate.map((entry) => [entry.id, entry]));
      const ids = new Set([...baseById.keys(), ...candidateById.keys()]);
      for (const id of ids) collectChangePaths(baseById.get(id) ?? ABSENT, candidateById.get(id) ?? ABSENT, idPath(path, id), target, overflow);
    } else boundedPush(target, path || "/", LOOPLAB_SHARED_PROJECT_REBASE_POLICY.maximumReportedPaths, overflow);
    return;
  }
  const keys = new Set([...Object.keys(base), ...Object.keys(candidate)]);
  for (const key of keys) collectChangePaths(Object.hasOwn(base, key) ? base[key] : ABSENT, Object.hasOwn(candidate, key) ? candidate[key] : ABSENT, childPath(path, key), target, overflow);
}

function conflictRecord(path, reason, base, local, remote) {
  return {
    path: path || "/",
    reason,
    baseState: valueKind(base),
    localState: valueKind(local),
    remoteState: valueKind(remote),
    repairAction: reason === "delete-versus-edit"
      ? "Choose whether the stable item should remain, then author that decision against the current remote revision."
      : "Inspect the local and remote values and author one deliberate value; LoopLab will not choose either side automatically.",
  };
}

function mergeStableIdArray(base, local, remote, path, context) {
  const baseById = new Map((base === ABSENT ? [] : base).map((entry) => [entry.id, entry]));
  const localById = new Map((local === ABSENT ? [] : local).map((entry) => [entry.id, entry]));
  const remoteById = new Map((remote === ABSENT ? [] : remote).map((entry) => [entry.id, entry]));
  const result = [];
  const emitted = new Set();
  const orderedIds = [
    ...(remote === ABSENT ? [] : remote.map((entry) => entry.id)),
    ...(local === ABSENT ? [] : local.map((entry) => entry.id)),
    ...(base === ABSENT ? [] : base.map((entry) => entry.id)),
  ];
  for (const id of orderedIds) {
    if (emitted.has(id)) continue;
    emitted.add(id);
    const merged = mergeValue(baseById.get(id) ?? ABSENT, localById.get(id) ?? ABSENT, remoteById.get(id) ?? ABSENT, idPath(path, id), context);
    if (merged !== ABSENT) result.push(merged);
  }
  return result;
}

function mergeValue(base, local, remote, path, context) {
  if (equal(local, remote)) return clone(local);
  if (equal(local, base)) return clone(remote);
  if (equal(remote, base)) return clone(local);

  if ((local === ABSENT) !== (remote === ABSENT)) {
    boundedPush(context.conflicts, conflictRecord(path, "delete-versus-edit", base, local, remote), LOOPLAB_SHARED_PROJECT_REBASE_POLICY.maximumReportedConflicts, context.conflictOverflow);
    return clone(remote);
  }

  if (isObject(local) && isObject(remote) && (base === ABSENT || isObject(base))) {
    const result = {};
    const keys = new Set([
      ...(base === ABSENT ? [] : Object.keys(base)),
      ...Object.keys(local),
      ...Object.keys(remote),
    ]);
    for (const key of keys) {
      const merged = mergeValue(
        base !== ABSENT && Object.hasOwn(base, key) ? base[key] : ABSENT,
        Object.hasOwn(local, key) ? local[key] : ABSENT,
        Object.hasOwn(remote, key) ? remote[key] : ABSENT,
        childPath(path, key),
        context,
      );
      if (merged !== ABSENT) result[key] = merged;
    }
    return result;
  }

  if (supportsStableIdMerge(base, local, remote)) return mergeStableIdArray(base, local, remote, path, context);

  boundedPush(context.conflicts, conflictRecord(path, Array.isArray(local) && Array.isArray(remote) ? "atomic-array-conflict" : "same-field-conflict", base, local, remote), LOOPLAB_SHARED_PROJECT_REBASE_POLICY.maximumReportedConflicts, context.conflictOverflow);
  return clone(remote);
}

export function sharedProjectRevisionDigest(project) {
  return `${LOOPLAB_SHARED_PROJECT_REVISION_PREFIX}${sha256Hex(canonicalJson(project))}`;
}

export function validateSharedProjectRevisionDigest(value) {
  return new RegExp(LOOPLAB_SHARED_PROJECT_REVISION_PATTERN).test(String(value ?? ""));
}

export function previewSharedProjectRebase({ baseProject, localProject, remoteProject, baseRevisionDigest, remoteRevisionDigest } = {}) {
  if (!baseProject || !localProject || !remoteProject) throw new Error("Shared project rebase requires baseProject, localProject, and remoteProject.");
  const calculatedBaseRevisionDigest = sharedProjectRevisionDigest(baseProject);
  const localRevisionDigest = sharedProjectRevisionDigest(localProject);
  const calculatedRemoteRevisionDigest = sharedProjectRevisionDigest(remoteProject);
  if (baseRevisionDigest && baseRevisionDigest !== calculatedBaseRevisionDigest) throw new Error(`Shared rebase base revision mismatch: expected ${baseRevisionDigest}, received ${calculatedBaseRevisionDigest}.`);
  if (remoteRevisionDigest && remoteRevisionDigest !== calculatedRemoteRevisionDigest) throw new Error(`Shared rebase remote revision mismatch: expected ${remoteRevisionDigest}, received ${calculatedRemoteRevisionDigest}.`);

  const localChanges = [];
  const remoteChanges = [];
  const localPathOverflow = { count: 0 };
  const remotePathOverflow = { count: 0 };
  collectChangePaths(baseProject, localProject, "", localChanges, localPathOverflow);
  collectChangePaths(baseProject, remoteProject, "", remoteChanges, remotePathOverflow);
  const context = { conflicts: [], conflictOverflow: { count: 0 } };
  const mergedProject = mergeValue(baseProject, localProject, remoteProject, "", context);
  const mergedRevisionDigest = sharedProjectRevisionDigest(mergedProject);
  const applicable = context.conflicts.length === 0 && context.conflictOverflow.count === 0;
  const projection = {
    schemaVersion: LOOPLAB_SHARED_PROJECT_REBASE_SCHEMA,
    baseRevisionDigest: calculatedBaseRevisionDigest,
    localRevisionDigest,
    remoteRevisionDigest: calculatedRemoteRevisionDigest,
    mergedRevisionDigest,
    localChanges,
    remoteChanges,
    localPathOverflow: localPathOverflow.count,
    remotePathOverflow: remotePathOverflow.count,
    conflicts: context.conflicts,
    conflictOverflow: context.conflictOverflow.count,
    applicable,
  };
  return {
    ...projection,
    rebaseDigest: canonicalSha256(projection),
    changed: mergedRevisionDigest !== localRevisionDigest,
    remoteChanged: calculatedRemoteRevisionDigest !== calculatedBaseRevisionDigest,
    mergedProject,
    policy: LOOPLAB_SHARED_PROJECT_REBASE_POLICY,
  };
}
