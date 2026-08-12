export const LOOPLAB_PROJECT_SCRIPT_ID = "looplab-project-data";

const SCRIPT_IDS = [LOOPLAB_PROJECT_SCRIPT_ID, "looplab-project-state"];

function decodeMinimalEntities(value) {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function scriptContents(html, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(`<script\\b(?=[^>]*\\bid=["']${escaped}["'])[^>]*>([\\s\\S]*?)<\\/script\\s*>`, "i");
  const match = expression.exec(html);
  return match?.[1] ?? null;
}

function balancedJsonAfter(html, marker) {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = html.indexOf("{", markerIndex + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return html.slice(start, index + 1);
    }
  }
  return null;
}

function assertProjectShape(project) {
  if (!project || typeof project !== "object" || Array.isArray(project)) throw new Error("Embedded Looplab project is not a JSON object.");
  if (typeof project.name !== "string" || !project.name.trim()) throw new Error("Embedded Looplab project has no name.");
  if (!Array.isArray(project.objects)) throw new Error("Embedded Looplab project has no active-map object list.");
  return project;
}

export function extractProjectFromHtml(html) {
  if (typeof html !== "string" || !html.trim()) throw new Error("HTML input is empty.");
  for (const id of SCRIPT_IDS) {
    const contents = scriptContents(html, id);
    if (contents === null) continue;
    const trimmed = contents.trim();
    try {
      return { project: assertProjectShape(JSON.parse(trimmed)), source: id === LOOPLAB_PROJECT_SCRIPT_ID ? "looplab-metadata" : "looplab-editor-state", scriptId: id };
    } catch (rawError) {
      const decoded = decodeMinimalEntities(trimmed);
      if (decoded !== trimmed) {
        try {
          return { project: assertProjectShape(JSON.parse(decoded)), source: id === LOOPLAB_PROJECT_SCRIPT_ID ? "looplab-metadata" : "looplab-editor-state", scriptId: id };
        } catch {
          // Preserve the raw parser diagnostic below; entity decoding is only a legacy fallback.
        }
      }
      throw new Error(`Looplab metadata in #${id} is invalid: ${rawError instanceof Error ? rawError.message : String(rawError)}`);
    }
  }

  for (const marker of ["const project=", "const project =", "let project=", "let project ="]) {
    const json = balancedJsonAfter(html, marker);
    if (!json) continue;
    try {
      return { project: assertProjectShape(JSON.parse(json)), source: "legacy-looplab-runtime", scriptId: null };
    } catch (error) {
      throw new Error(`Legacy Looplab project data is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error("No embedded Looplab project metadata was found. Only Looplab-exported HTML can be reopened as editable maps.");
}

export function serializeProjectMetadata(project) {
  return JSON.stringify(project).replace(/</g, "\\u003c");
}
