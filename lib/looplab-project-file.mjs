import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { validateProject } from "./looplab-agent-core.mjs";
import { getSharedProject, putSharedProject, sharedProjectIdFromPath } from "./looplab-shared-project-client.mjs";

export function resolveLooplabProjectPath(projectPath, workspaceRoot = process.cwd()) {
  if (typeof projectPath !== "string" || !projectPath.trim()) throw new Error("projectPath must be a non-empty .loop.json path.");
  const root = resolve(workspaceRoot);
  const target = resolve(root, projectPath.trim());
  const relation = relative(root, target);
  if (relation === ".." || relation.startsWith(`..\\`) || relation.startsWith("../") || isAbsolute(relation)) {
    throw new Error(`projectPath must stay inside the configured LoopLab workspace: ${root}`);
  }
  if (!target.toLowerCase().endsWith(".loop.json")) throw new Error("projectPath must end with .loop.json.");
  return target;
}

export async function looplabProjectExists(projectPath, workspaceRoot = process.cwd()) {
  const target = resolveLooplabProjectPath(projectPath, workspaceRoot);
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export async function readLooplabProjectFile(projectPath, { workspaceRoot = process.cwd() } = {}) {
  const path = resolveLooplabProjectPath(projectPath, workspaceRoot);
  const sharedProjectId = sharedProjectIdFromPath(path, { workspaceRoot });
  if (sharedProjectId) {
    const stored = await getSharedProject(sharedProjectId, { workspaceRoot });
    return {
      path,
      project: stored.project,
      sourceDigest: stored.sourceDigest,
      revisionDigest: stored.revisionDigest,
      sharedProjectId,
    };
  }
  const text = await readFile(path, "utf8");
  let project;
  try {
    project = JSON.parse(text);
  } catch (error) {
    throw new Error(`Project JSON could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const validation = validateProject(project);
  if (!validation.valid) throw new Error(`Invalid project: ${validation.errors.join(" ")}`);
  return { path, project };
}

export async function writeLooplabProjectFile(projectPath, project, { workspaceRoot = process.cwd(), expectedRevisionDigest } = {}) {
  const path = resolveLooplabProjectPath(projectPath, workspaceRoot);
  const sharedProjectId = sharedProjectIdFromPath(path, { workspaceRoot });
  if (sharedProjectId) {
    await putSharedProject(sharedProjectId, project, { workspaceRoot, expectedRevisionDigest });
    return path;
  }
  const validation = validateProject(project);
  if (!validation.valid) throw new Error(`Refusing to write an invalid project: ${validation.errors.join(" ")}`);
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
    await rename(temporaryPath, path);
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch {
      // The temporary file may not exist when validation or creation failed.
    }
    throw error;
  }
  return path;
}
