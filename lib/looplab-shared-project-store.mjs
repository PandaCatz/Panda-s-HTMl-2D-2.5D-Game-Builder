import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { validateProject } from "./looplab-agent-core.mjs";
import { doctorSourceDigest } from "./looplab-doctor.mjs";
import {
  LOOPLAB_SHARED_PROJECT_ID_PATTERN,
  LOOPLAB_SHARED_PROJECT_METADATA_SCHEMA,
  LOOPLAB_SHARED_PROJECT_STORE_POLICY,
  LOOPLAB_SHARED_PROJECT_STORE_SCHEMA,
} from "./looplab-shared-project-contract.mjs";
import { sharedProjectRevisionDigest, validateSharedProjectRevisionDigest } from "./looplab-shared-project-rebase.mjs";

const PROJECT_ID_PATTERN = new RegExp(LOOPLAB_SHARED_PROJECT_ID_PATTERN);
const PROJECT_ORIGINS = new Set(["starter", "folder", "file", "variation", "local", "shared"]);

const clone = (value) => JSON.parse(JSON.stringify(value));

export class SharedProjectStoreError extends Error {
  constructor(message, { statusCode = 400, code = "shared-project-invalid", path = null, expected = null, got = null, current = null, repairAction = null } = {}) {
    super(message);
    this.name = "SharedProjectStoreError";
    this.statusCode = statusCode;
    this.code = code;
    this.path = path;
    this.expected = expected;
    this.got = got;
    this.current = current;
    this.repairAction = repairAction;
  }
}

function storeError(message, options) {
  return new SharedProjectStoreError(message, options);
}

export function normalizeSharedProjectId(value) {
  const id = String(value ?? "").trim().toLowerCase();
  if (!PROJECT_ID_PATTERN.test(id)) {
    throw storeError("Shared project ID must be a lowercase 1–64 character slug using letters, digits, and internal hyphens.", {
      code: "shared-project-id-invalid",
      path: "/id",
      got: typeof value === "string" ? value.slice(0, 160) : typeof value,
      repairAction: "Choose a stable slug such as courier-foundry-v2; never pass a path.",
    });
  }
  return id;
}

function normalizeRevisionDigest(value, { optional = true, path = "/expectedRevisionDigest" } = {}) {
  if ((value === undefined || value === null || value === "") && optional) return null;
  const digest = String(value ?? "").trim();
  if (!validateSharedProjectRevisionDigest(digest)) {
    throw storeError("expectedRevisionDigest must be the exact current shared project revision digest.", {
      code: "shared-project-digest-invalid",
      path,
      got: digest.slice(0, 160),
      repairAction: "Read the shared project again and use its returned revisionDigest without modification.",
    });
  }
  return digest;
}

function ensureWithinWorkspace(path, workspaceRoot, label) {
  const root = resolve(workspaceRoot);
  const target = resolve(path);
  const relation = relative(root, target);
  if (relation === ".." || relation.startsWith("..\\") || relation.startsWith("../") || isAbsolute(relation)) {
    throw storeError(`${label} must stay inside the configured LoopLab workspace.`, {
      code: "shared-project-root-outside-workspace",
      path: "/rootDirectory",
      repairAction: `Use ${LOOPLAB_SHARED_PROJECT_STORE_POLICY.relativeRoot} inside the workspace.`,
    });
  }
  return { root, target };
}

function relativeProjectPath(path, workspaceRoot) {
  return relative(resolve(workspaceRoot), path).replace(/\\/g, "/");
}

function boundedText(value, maximum, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, maximum);
}

function normalizeMetadata(input, { id, project, existing = null, now }) {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const origin = PROJECT_ORIGINS.has(value.origin) ? value.origin : existing?.origin ?? "shared";
  const parentLibraryId = value.parentLibraryId === null || value.parentLibraryId === undefined || value.parentLibraryId === ""
    ? existing?.parentLibraryId ?? null
    : normalizeSharedProjectId(value.parentLibraryId);
  return {
    schemaVersion: LOOPLAB_SHARED_PROJECT_METADATA_SCHEMA,
    id,
    origin,
    sourceLabel: boundedText(value.sourceLabel, 512, existing?.sourceLabel ?? "LoopLab shared project"),
    folderName: value.folderName === null || value.folderName === undefined
      ? existing?.folderName ?? null
      : boundedText(value.folderName, 160) || null,
    parentLibraryId,
    createdAt: existing?.createdAt ?? now(),
    projectName: project.name,
  };
}

async function readJson(path, label) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw storeError(`${label} could not be read.`, { statusCode: 500, code: "shared-project-read-failed", repairAction: "Inspect the local store and retry after the file is readable." });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw storeError(`${label} contains invalid JSON.`, { statusCode: 500, code: "shared-project-json-invalid", repairAction: "Restore this entry from a valid .loop.json backup instead of editing generated store files." });
  }
}

async function atomicWrite(path, text) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, text, { encoding: "utf8", flag: "wx", flush: true });
    await rename(temporaryPath, path);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

function validateStoredProject(project) {
  const validation = validateProject(project);
  if (!validation.valid) {
    throw storeError(`Shared project is invalid: ${validation.errors.join(" ")}`, {
      code: "shared-project-validation-failed",
      path: "/project",
      repairAction: "Fix the canonical project through LoopLab validation before storing it.",
    });
  }
  return validation;
}

function compactIterationSummary(iteration) {
  if (!iteration || typeof iteration !== "object") return null;
  return {
    id: boundedText(iteration.id, 160) || null,
    parentId: boundedText(iteration.parentId, 160) || null,
    status: boundedText(iteration.status, 40) || null,
    track: boundedText(iteration.track, 80) || null,
    createdAt: boundedText(iteration.createdAt, 40) || null,
    readOnly: iteration.readOnly === true,
  };
}

export function createSharedProjectStore({ rootDirectory, workspaceRoot = process.cwd(), now = () => new Date().toISOString() } = {}) {
  const configuredRoot = rootDirectory ?? join(workspaceRoot, ".looplab", "projects");
  const checked = ensureWithinWorkspace(configuredRoot, workspaceRoot, "Shared project store");
  const root = checked.target;
  const locks = new Map();

  const pathsFor = (rawId) => {
    const id = normalizeSharedProjectId(rawId);
    const directory = join(root, id);
    return {
      id,
      directory,
      project: join(directory, LOOPLAB_SHARED_PROJECT_STORE_POLICY.projectFilename),
      metadata: join(directory, LOOPLAB_SHARED_PROJECT_STORE_POLICY.metadataFilename),
    };
  };

  const withLock = async (id, task) => {
    const previous = locks.get(id) ?? Promise.resolve();
    let release;
    const current = new Promise((resolveLock) => { release = resolveLock; });
    const tail = previous.then(() => current);
    locks.set(id, tail);
    await previous;
    try {
      return await task();
    } finally {
      release();
      if (locks.get(id) === tail) locks.delete(id);
    }
  };

  const readEntry = async (rawId, { includeProject = true } = {}) => {
    const paths = pathsFor(rawId);
    const project = await readJson(paths.project, `Shared project ${paths.id}`);
    if (!project) {
      throw storeError(`Shared project ${paths.id} was not found.`, {
        statusCode: 404,
        code: "shared-project-not-found",
        path: "/id",
        got: paths.id,
        repairAction: "Call list_shared_projects and select an existing stable ID, or create the project first.",
      });
    }
    const validation = validateStoredProject(project);
    const sourceDigest = doctorSourceDigest(project);
    const revisionDigest = sharedProjectRevisionDigest(project);
    const metadataValue = await readJson(paths.metadata, `Shared project metadata ${paths.id}`);
    const metadata = normalizeMetadata(metadataValue, { id: paths.id, project, now });
    const fileStat = await stat(paths.project);
    const summary = {
      id: paths.id,
      name: project.name,
      origin: metadata.origin,
      sourceLabel: metadata.sourceLabel,
      folderName: metadata.folderName,
      parentLibraryId: metadata.parentLibraryId,
      createdAt: metadata.createdAt,
      updatedAt: fileStat.mtime.toISOString(),
      sourceDigest,
      revisionDigest,
      mapCount: project.maps?.length ?? 1,
      iteration: compactIterationSummary(project.iteration),
      projectPath: relativeProjectPath(paths.project, checked.root),
    };
    return {
      schemaVersion: LOOPLAB_SHARED_PROJECT_STORE_SCHEMA,
      summary,
      sourceDigest,
      revisionDigest,
      validation,
      ...(includeProject ? { project: clone(project) } : {}),
    };
  };

  const list = async () => {
    await mkdir(root, { recursive: true });
    const entries = await readdir(root, { withFileTypes: true });
    const directoryIds = entries.filter((entry) => entry.isDirectory() && PROJECT_ID_PATTERN.test(entry.name)).map((entry) => entry.name).sort();
    if (directoryIds.length > LOOPLAB_SHARED_PROJECT_STORE_POLICY.maximumProjects) {
      throw storeError(`Shared project store exceeds ${LOOPLAB_SHARED_PROJECT_STORE_POLICY.maximumProjects} entries.`, {
        statusCode: 507,
        code: "shared-project-store-capacity",
        repairAction: "Archive projects outside the store before adding more entries.",
      });
    }
    const projects = [];
    let invalidCount = 0;
    for (const id of directoryIds) {
      try {
        projects.push((await readEntry(id, { includeProject: false })).summary);
      } catch {
        invalidCount += 1;
      }
    }
    projects.sort((first, second) => second.updatedAt.localeCompare(first.updatedAt) || first.id.localeCompare(second.id));
    return {
      schemaVersion: LOOPLAB_SHARED_PROJECT_STORE_SCHEMA,
      projects,
      count: projects.length,
      invalidCount,
      policy: LOOPLAB_SHARED_PROJECT_STORE_POLICY,
    };
  };

  const put = async ({ id: rawId, project, expectedRevisionDigest, createOnly = false, metadata } = {}) => {
    const paths = pathsFor(rawId);
    const id = paths.id;
    const expected = normalizeRevisionDigest(expectedRevisionDigest);
    const validation = validateStoredProject(project);
    const serialized = `${JSON.stringify(project, null, 2)}\n`;
    const encodedBytes = Buffer.byteLength(serialized);
    if (encodedBytes > LOOPLAB_SHARED_PROJECT_STORE_POLICY.maximumProjectBytes) {
      throw storeError(`Shared project exceeds the ${LOOPLAB_SHARED_PROJECT_STORE_POLICY.maximumProjectBytes} byte store limit.`, {
        statusCode: 413,
        code: "shared-project-too-large",
        path: "/project",
        got: encodedBytes,
        expected: LOOPLAB_SHARED_PROJECT_STORE_POLICY.maximumProjectBytes,
        repairAction: "Optimize embedded assets or keep this oversized source outside the mounted shared library.",
      });
    }
    const submittedRevisionDigest = sharedProjectRevisionDigest(project);
    return withLock(id, async () => {
      let current = null;
      try {
        current = await readEntry(id);
      } catch (error) {
        if (error?.code !== "shared-project-not-found") throw error;
      }

      if (current?.revisionDigest === submittedRevisionDigest) {
        return { ...(await readEntry(id)), created: false, changed: false, idempotent: true, encodedBytes };
      }
      if (current && createOnly) {
        throw storeError(`Shared project ${id} already exists and differs from the create-only candidate.`, {
          statusCode: 412,
          code: "shared-project-create-conflict",
          path: "/id",
          expected: "absent",
          got: current.revisionDigest,
          current: current.summary,
          repairAction: "Read the existing shared project, choose a new ID, or rebase an explicit update against its current revisionDigest.",
        });
      }
      if (current && !expected) {
        throw storeError(`Updating shared project ${id} requires expectedRevisionDigest.`, {
          statusCode: 428,
          code: "shared-project-precondition-required",
          path: "/expectedRevisionDigest",
          expected: current.revisionDigest,
          got: null,
          current: current.summary,
          repairAction: "Read the shared project and resubmit once with its exact current revisionDigest.",
        });
      }
      if (current && expected !== current.revisionDigest) {
        throw storeError(`Shared project ${id} changed after the caller read it; no bytes were written.`, {
          statusCode: 412,
          code: "stale-revision",
          path: "/expectedRevisionDigest",
          expected,
          got: current.revisionDigest,
          current: current.summary,
          repairAction: "Preview a three-way rebase against the current shared project, resolve any conflicts, and retry with the new revisionDigest.",
        });
      }
      if (!current && expected) {
        throw storeError(`Shared project ${id} no longer exists; no bytes were written.`, {
          statusCode: 412,
          code: "stale-revision",
          path: "/expectedRevisionDigest",
          expected,
          got: "absent",
          repairAction: "Refresh the shared project list and deliberately recreate the project only if its removal was expected.",
        });
      }

      const created = !current;
      if (created) {
        const normalizedMetadata = normalizeMetadata(metadata, { id, project, now });
        await atomicWrite(paths.metadata, `${JSON.stringify(normalizedMetadata, null, 2)}\n`);
      }
      try {
        await atomicWrite(paths.project, serialized);
      } catch (error) {
        throw storeError(`Shared project ${id} could not be atomically persisted.`, {
          statusCode: 500,
          code: "shared-project-write-failed",
          repairAction: "Keep the caller's draft, verify the local store is writable, and retry without changing the precondition.",
          got: error instanceof Error ? error.code ?? error.message : String(error),
        });
      }
      return { ...(await readEntry(id)), created, changed: true, idempotent: false, encodedBytes, validation };
    });
  };

  return Object.freeze({
    schemaVersion: LOOPLAB_SHARED_PROJECT_STORE_SCHEMA,
    rootDirectory: root,
    policy: LOOPLAB_SHARED_PROJECT_STORE_POLICY,
    list,
    get: readEntry,
    put,
    resolvePaths: pathsFor,
  });
}

export {
  LOOPLAB_SHARED_PROJECT_METADATA_SCHEMA,
  LOOPLAB_SHARED_PROJECT_STORE_POLICY,
  LOOPLAB_SHARED_PROJECT_STORE_SCHEMA,
};
