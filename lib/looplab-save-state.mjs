import { sha256Hex } from "./looplab-canonical-digest.mjs";

export const LOOPLAB_EXPORT_PROFILE_SCHEMA = "looplab-export-profile/v1";
export const LOOPLAB_SAVE_PROGRAM_SCHEMA = "looplab-save-program/v1";
export const LOOPLAB_SAVE_REPORT_SCHEMA = "looplab-save-report/v1";
export const LOOPLAB_SAVE_CODE_SCHEMA = "looplab-save-code/v1";
export const LOOPLAB_SAVE_RUNTIME_STATUS_SCHEMA = "looplab-save-runtime-status/v1";
export const LOOPLAB_HOSTED_STORAGE_WRAPPER_SCHEMA = "looplab-hosted-storage/v1";
export const LOOPLAB_HOSTED_STORAGE_WRAPPER_VERSION = "1.0.0";

export const LOOPLAB_SAVE_LIMITS = Object.freeze({
  maximumCodeCharacters: 65_536,
  maximumPayloadBytes: 48_000,
  maximumCollectedIds: 1_024,
  maximumCompletedRuleIds: 512,
  maximumObjectOverrides: 1_024,
  maximumPathOverrides: 1_024,
  maximumVariables: 256,
});

export const LOOPLAB_PERSISTENCE_POLICY = Object.freeze({
  defaultExportProfile: "strict",
  exportProfiles: ["strict", "hosted"],
  strict: "One self-contained HTML file with no network or persistent-storage dependency. Optional portable save codes remain in player-controlled memory only.",
  hosted: "One self-contained, network-free HTML file that may persist the same portable save code through one exact LoopLab storage wrapper. Storage failure always degrades to manual codes.",
  sourceBoundary: "Save payloads contain bounded runtime gameplay state only. They never contain provider data, credentials, evidence, replay fixtures, presentation state, physical inputs, camera state, or authored collision.",
  auditBoundary: "Only the exact versioned and SHA-256-authenticated LoopLab hosted-storage wrapper may access persistent storage. A function name, comment, or try/catch is never an audit exemption.",
  compatibilityBoundary: "A save code restores only into the exact exported source digest that created it. Invalid or incompatible codes leave the current runtime unchanged.",
  integrityBoundary: "The save-code checksum detects accidental corruption; it is not a cryptographic signature or proof of trusted player state.",
});

const SAVE_PROGRAM_FIELDS = new Set(["schemaVersion", "version", "enabled", "portableCodes", "hosted"]);
const HOSTED_FIELDS = new Set(["autoSave", "restoreOnBoot"]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function issue(severity, code, message, path = null) {
  return { severity, code, message, path };
}

function unknownFields(value, allowed, path, issues) {
  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) if (!allowed.has(key)) issues.push(issue("error", "save-unknown-field", `${path}.${key} is not an allowed save-program field.`, `${path}.${key}`));
}

export function exportProfileId(project) {
  return project?.release?.exportProfile === "hosted" ? "hosted" : "strict";
}

export function normalizeSaveProgram(program = {}, options = {}) {
  const profile = options.profile === "hosted" ? "hosted" : "strict";
  const enabled = program?.enabled !== false;
  return {
    schemaVersion: LOOPLAB_SAVE_PROGRAM_SCHEMA,
    version: 1,
    enabled,
    portableCodes: enabled && program?.portableCodes !== false,
    hosted: {
      autoSave: profile === "hosted" && program?.hosted?.autoSave !== false,
      restoreOnBoot: profile === "hosted" && program?.hosted?.restoreOnBoot !== false,
    },
  };
}

export function inspectSaveProgram(project, program = project?.saveProgram, options = {}) {
  const profile = exportProfileId(project);
  const issues = [];
  const release = isPlainObject(project?.release) ? project.release : {};
  const sourceDigest = typeof options.sourceDigest === "string" ? options.sourceDigest : null;
  if (release.exportProfile !== undefined && !["strict", "hosted"].includes(release.exportProfile)) {
    issues.push(issue("error", "export-profile-invalid", "release.exportProfile must be strict or hosted.", "release.exportProfile"));
  }
  if (profile === "strict") {
    if (release.storageFree === false || release.allowStorage === true || release.storageWrapper) {
      issues.push(issue("error", "strict-storage-enabled", "Strict export cannot allow browser storage or declare a hosted storage wrapper.", "release"));
    }
  } else {
    if (release.singleFile === false || release.networkFree === false) issues.push(issue("error", "hosted-one-file-boundary", "Hosted export must remain one self-contained, network-free HTML file.", "release"));
    if (release.storageFree !== false || release.allowStorage !== true || release.storageWrapper !== LOOPLAB_HOSTED_STORAGE_WRAPPER_SCHEMA) {
      issues.push(issue("error", "hosted-storage-contract", `Hosted export must declare storageFree:false, allowStorage:true, and storageWrapper:${LOOPLAB_HOSTED_STORAGE_WRAPPER_SCHEMA}.`, "release"));
    }
  }
  if (program === undefined || program === null) {
    if (profile === "hosted") issues.push(issue("error", "save-program-missing", "Hosted export requires portable save codes so unavailable storage has a player-controlled fallback.", "saveProgram"));
    return {
      schemaVersion: LOOPLAB_SAVE_REPORT_SCHEMA,
      programSchemaVersion: LOOPLAB_SAVE_PROGRAM_SCHEMA,
      exportProfileSchemaVersion: LOOPLAB_EXPORT_PROFILE_SCHEMA,
      sourceDigest,
      profile,
      present: false,
      status: issues.some((entry) => entry.severity === "error") ? "invalid" : "absent",
      program: null,
      issues,
      errors: issues.filter((entry) => entry.severity === "error").map((entry) => entry.message),
      warnings: [],
      limits: clone(LOOPLAB_SAVE_LIMITS),
      proofBoundary: LOOPLAB_PERSISTENCE_POLICY.integrityBoundary,
    };
  }
  if (!isPlainObject(program)) {
    issues.push(issue("error", "save-program-type", "saveProgram must be an object.", "saveProgram"));
  } else {
    unknownFields(program, SAVE_PROGRAM_FIELDS, "saveProgram", issues);
    if (program.schemaVersion !== LOOPLAB_SAVE_PROGRAM_SCHEMA) issues.push(issue("error", "save-program-schema", `saveProgram.schemaVersion must be ${LOOPLAB_SAVE_PROGRAM_SCHEMA}.`, "saveProgram.schemaVersion"));
    if (program.version !== 1) issues.push(issue("error", "save-program-version", "saveProgram.version must be 1.", "saveProgram.version"));
    if (typeof program.enabled !== "boolean") issues.push(issue("error", "save-program-enabled", "saveProgram.enabled must be boolean.", "saveProgram.enabled"));
    if (typeof program.portableCodes !== "boolean") issues.push(issue("error", "save-program-portable", "saveProgram.portableCodes must be boolean.", "saveProgram.portableCodes"));
    if (!isPlainObject(program.hosted)) issues.push(issue("error", "save-program-hosted", "saveProgram.hosted must be an object.", "saveProgram.hosted"));
    else {
      unknownFields(program.hosted, HOSTED_FIELDS, "saveProgram.hosted", issues);
      if (typeof program.hosted.autoSave !== "boolean") issues.push(issue("error", "save-program-autosave", "saveProgram.hosted.autoSave must be boolean.", "saveProgram.hosted.autoSave"));
      if (typeof program.hosted.restoreOnBoot !== "boolean") issues.push(issue("error", "save-program-restore", "saveProgram.hosted.restoreOnBoot must be boolean.", "saveProgram.hosted.restoreOnBoot"));
    }
    if (program.enabled && program.portableCodes !== true) issues.push(issue("error", "save-code-fallback-missing", "An enabled save program must retain portable save codes.", "saveProgram.portableCodes"));
    if (profile === "hosted" && (program.enabled !== true || program.portableCodes !== true)) issues.push(issue("error", "hosted-save-fallback-missing", "Hosted export requires enabled portable save codes as its storage fallback.", "saveProgram"));
    if (profile === "strict" && (program.hosted?.autoSave === true || program.hosted?.restoreOnBoot === true)) issues.push(issue("error", "strict-hosted-behavior", "Strict export cannot enable hosted autosave or boot restore.", "saveProgram.hosted"));
  }
  const normalized = issues.some((entry) => entry.severity === "error") ? clone(program) : normalizeSaveProgram(program, { profile });
  return {
    schemaVersion: LOOPLAB_SAVE_REPORT_SCHEMA,
    programSchemaVersion: LOOPLAB_SAVE_PROGRAM_SCHEMA,
    exportProfileSchemaVersion: LOOPLAB_EXPORT_PROFILE_SCHEMA,
    sourceDigest,
    profile,
    present: true,
    status: issues.some((entry) => entry.severity === "error") ? "invalid" : normalized.enabled ? "ready" : "disabled",
    program: normalized,
    issues,
    errors: issues.filter((entry) => entry.severity === "error").map((entry) => entry.message),
    warnings: issues.filter((entry) => entry.severity === "warning").map((entry) => entry.message),
    limits: clone(LOOPLAB_SAVE_LIMITS),
    storage: {
      sanctioned: profile === "hosted",
      wrapper: profile === "hosted" ? LOOPLAB_HOSTED_STORAGE_WRAPPER_SCHEMA : null,
      portableFallback: normalized?.portableCodes === true,
    },
    proofBoundary: LOOPLAB_PERSISTENCE_POLICY.integrityBoundary,
  };
}

export function projectWithExportProfile(inputProject, options = {}) {
  const project = clone(inputProject);
  const profile = options.profile === "hosted" ? "hosted" : options.profile === "strict" ? "strict" : null;
  if (!profile) throw new Error("Export profile must be strict or hosted.");
  const portableSaves = profile === "hosted" ? true : options.portableSaves === true;
  project.release = {
    ...(project.release ?? {}),
    exportProfile: profile,
    singleFile: true,
    networkFree: true,
    allowNetwork: false,
    storageFree: profile === "strict",
    allowStorage: profile === "hosted",
    runtimeBundleEmbedded: project.release?.runtimeBundleEmbedded !== false,
    moduleImports: [],
    externalRequests: [],
  };
  if (profile === "hosted") project.release.storageWrapper = LOOPLAB_HOSTED_STORAGE_WRAPPER_SCHEMA;
  else delete project.release.storageWrapper;
  if (portableSaves) {
    project.saveProgram = normalizeSaveProgram({
      ...(project.saveProgram ?? {}),
      enabled: true,
      portableCodes: true,
      hosted: {
        autoSave: profile === "hosted" ? options.autoSave !== false : false,
        restoreOnBoot: profile === "hosted" ? options.restoreOnBoot !== false : false,
      },
    }, { profile });
  } else delete project.saveProgram;
  const report = inspectSaveProgram(project, project.saveProgram, options);
  if (report.errors.length) throw new Error(`Export profile is invalid: ${report.errors.join(" ")}`);
  return { project, profile, report };
}

export function createSaveCodeRuntime(engine, options = {}) {
  const schemaVersion = "looplab-save-code/v1";
  const statusSchemaVersion = "looplab-save-runtime-status/v1";
  const maximumCodeCharacters = 65536;
  const maximumPayloadBytes = 48000;
  const sourceDigest = String(options.sourceDigest || "");
  const profile = options.profile === "hosted" ? "hosted" : "strict";
  const program = options.program && typeof options.program === "object" ? options.program : null;
  const enabled = Boolean(program?.enabled && program?.portableCodes);
  const hostedConfigured = enabled && profile === "hosted";
  const hostedStorage = hostedConfigured && options.hostedStorage && typeof options.hostedStorage === "object" ? options.hostedStorage : null;
  const storageKey = "looplab-save:" + sourceDigest.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 128);
  const autoSaveEvents = new Set(["coin.collected", "map.changed", "goal.reached", "choice.selected", "clock.advanced", "gameplay.rule-fired"]);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let lastAction = "idle";
  let lastError = null;
  let hostedState = hostedConfigured ? hostedStorage ? "ready" : "unavailable" : "disabled";

  function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }
  function utf8Encode(value) {
    return new TextEncoder().encode(String(value));
  }
  function utf8Decode(bytes) {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }
  function base64UrlEncode(text) {
    const bytes = utf8Encode(text);
    let output = "";
    for (let index = 0; index < bytes.length; index += 3) {
      const first = bytes[index];
      const second = index + 1 < bytes.length ? bytes[index + 1] : null;
      const third = index + 2 < bytes.length ? bytes[index + 2] : null;
      const value = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
      output += alphabet[(value >>> 18) & 63] + alphabet[(value >>> 12) & 63];
      if (second !== null) output += alphabet[(value >>> 6) & 63];
      if (third !== null) output += alphabet[value & 63];
    }
    return output;
  }
  function base64UrlDecode(value) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new Error("Save payload is not canonical base64url.");
    const bytes = [];
    for (let index = 0; index < value.length; index += 4) {
      const count = Math.min(4, value.length - index);
      const indexes = [0, 1, 2, 3].map((offset) => offset < count ? alphabet.indexOf(value[index + offset]) : 0);
      if (indexes.slice(0, count).some((entry) => entry < 0)) throw new Error("Save payload contains an invalid base64url character.");
      const combined = (indexes[0] << 18) | (indexes[1] << 12) | (indexes[2] << 6) | indexes[3];
      bytes.push((combined >>> 16) & 255);
      if (count >= 3) bytes.push((combined >>> 8) & 255);
      if (count >= 4) bytes.push(combined & 255);
    }
    return utf8Decode(new Uint8Array(bytes));
  }
  function checksum(text) {
    const bytes = utf8Encode(text);
    let hash = 2166136261;
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  function fail(message) {
    lastAction = "failed";
    lastError = String(message || "Save operation failed.").slice(0, 240);
    return { ok: false, error: lastError };
  }
  function inspectCode(code) {
    const errors = [];
    const value = typeof code === "string" ? code.trim() : "";
    if (!enabled) errors.push("Portable saves are not enabled in this artifact.");
    if (!value || value.length > maximumCodeCharacters) errors.push(`Save code must contain 1 through ${maximumCodeCharacters} characters.`);
    const match = /^LL1\.([A-Za-z0-9_-]+)\.([0-9a-f]{8})$/.exec(value);
    if (!match) errors.push("Save code must use the canonical LL1 base64url format.");
    let payload = null;
    let state = null;
    if (!errors.length) {
      try {
        const json = base64UrlDecode(match[1]);
        if (utf8Encode(json).byteLength > maximumPayloadBytes) throw new Error(`Save payload exceeds ${maximumPayloadBytes} bytes.`);
        if (checksum(json) !== match[2]) throw new Error("Save checksum does not match; the code may be damaged.");
        payload = JSON.parse(json);
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Save payload must be an object.");
        const keys = Object.keys(payload).sort();
        if (JSON.stringify(keys) !== JSON.stringify(["schemaVersion", "sourceDigest", "state"])) throw new Error("Save payload contains unknown or missing fields.");
        if (payload.schemaVersion !== schemaVersion) throw new Error(`Save payload must use ${schemaVersion}.`);
        if (payload.sourceDigest !== sourceDigest) throw new Error("Save code belongs to a different exported game revision.");
        const validation = engine.validateSaveState(payload.state);
        if (!validation?.valid) throw new Error(validation?.errors?.[0] || "Save state is invalid.");
        state = validation.state;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    return {
      schemaVersion,
      valid: errors.length === 0,
      sourceDigest: payload?.sourceDigest ?? null,
      errors,
      state: errors.length ? null : cloneValue(state),
      integrity: errors.length ? "invalid" : "checksum-valid-not-authenticated",
    };
  }
  function exportCode() {
    if (!enabled) throw new Error("Portable saves are not enabled in this artifact.");
    const payload = { schemaVersion, sourceDigest, state: engine.exportSaveState() };
    const json = JSON.stringify(payload);
    if (utf8Encode(json).byteLength > maximumPayloadBytes) throw new Error(`Save payload exceeds ${maximumPayloadBytes} bytes.`);
    const code = `LL1.${base64UrlEncode(json)}.${checksum(json)}`;
    if (code.length > maximumCodeCharacters) throw new Error(`Save code exceeds ${maximumCodeCharacters} characters.`);
    lastAction = "exported";
    lastError = null;
    return code;
  }
  function hostedResult(result, successState) {
    if (result?.ok) {
      hostedState = successState;
      lastError = null;
      return result;
    }
    hostedState = result?.state === "unavailable" ? "unavailable" : "failed";
    lastError = String(result?.error || "Hosted storage is unavailable.").slice(0, 240);
    return result ?? { ok: false, state: hostedState, error: lastError };
  }
  function persistHosted() {
    if (!hostedConfigured || !hostedStorage) return { ok: false, state: hostedConfigured ? "unavailable" : "disabled", error: hostedConfigured ? "Hosted storage is unavailable; use the portable code." : null };
    try {
      const code = exportCode();
      const result = hostedResult(hostedStorage.set(storageKey, code), "saved");
      if (result.ok) lastAction = "hosted-saved";
      return result;
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  }
  function importCode(code, importOptions = {}) {
    const inspection = inspectCode(code);
    if (!inspection.valid) return fail(inspection.errors[0]);
    const restored = engine.restoreSaveState(inspection.state);
    if (!restored?.ok) return fail(restored?.error || "Save state could not be restored.");
    lastAction = "imported";
    lastError = null;
    if (importOptions.persist !== false && hostedConfigured && hostedStorage) hostedResult(hostedStorage.set(storageKey, String(code).trim()), "saved");
    return { ok: true, state: engine.getState(), saveState: engine.exportSaveState(), inspection };
  }
  function restoreHosted() {
    if (!hostedConfigured || !program?.hosted?.restoreOnBoot) return { ok: false, state: hostedConfigured ? "disabled" : "not-configured", restored: false };
    if (!hostedStorage) {
      hostedState = "unavailable";
      return { ok: false, state: "unavailable", restored: false, error: "Hosted storage is unavailable; use a portable code." };
    }
    const loaded = hostedResult(hostedStorage.get(storageKey), "ready");
    if (!loaded.ok) return { ...loaded, restored: false };
    if (!loaded.value) {
      hostedState = "empty";
      return { ok: true, state: "empty", restored: false };
    }
    const result = importCode(loaded.value, { persist: false });
    if (result.ok) {
      hostedState = "restored";
      lastAction = "hosted-restored";
    }
    return { ...result, state: result.ok ? "restored" : hostedState, restored: result.ok };
  }
  function clearHosted() {
    if (!hostedConfigured || !hostedStorage) return { ok: false, state: hostedConfigured ? "unavailable" : "disabled" };
    const result = hostedResult(hostedStorage.remove(storageKey), "empty");
    if (result.ok) lastAction = "hosted-cleared";
    return result;
  }
  function handleEvents(events, eventOptions = {}) {
    if (eventOptions.autoSave === false || !hostedConfigured || program?.hosted?.autoSave !== true || !Array.isArray(events)) return null;
    if (!events.some((event) => autoSaveEvents.has(event?.type))) return null;
    return persistHosted();
  }
  function getStatus() {
    return {
      schemaVersion: statusSchemaVersion,
      enabled,
      profile,
      portableCodes: enabled,
      sourceDigest,
      lastAction,
      lastError,
      hosted: {
        configured: hostedConfigured,
        wrapperPresent: Boolean(hostedStorage),
        autoSave: hostedConfigured && program?.hosted?.autoSave === true,
        restoreOnBoot: hostedConfigured && program?.hosted?.restoreOnBoot === true,
        state: hostedState,
      },
      limits: { maximumCodeCharacters, maximumPayloadBytes },
      integrityBoundary: "Checksum-valid means not accidentally corrupted; it is not authentication or trusted-score evidence.",
    };
  }
  return { getStatus, exportCode, inspectCode, importCode, persistHosted, restoreHosted, clearHosted, handleEvents };
}

export const LOOPLAB_HOSTED_STORAGE_WRAPPER_SOURCE = `(function(){
  'use strict';
  const schemaVersion='looplab-hosted-storage/v1';
  const version='1.0.0';
  const keyPattern=/^looplab-save:[A-Za-z0-9_-]{8,128}$/;
  const maximumValueCharacters=65536;
  function errorResult(error){const name=String(error&&error.name||'Error');return{ok:false,state:name==='SecurityError'?'unavailable':'failed',error:name.slice(0,80)}}
  function storage(){try{return{ok:true,value:globalThis.localStorage}}catch(error){return errorResult(error)}}
  const api=Object.freeze({
    schemaVersion:schemaVersion,
    version:version,
    get:function(key){if(!keyPattern.test(String(key||'')))return{ok:false,state:'failed',error:'InvalidKey'};const result=storage();if(!result.ok)return result;try{return{ok:true,state:'ready',value:result.value.getItem(key)}}catch(error){return errorResult(error)}},
    set:function(key,value){if(!keyPattern.test(String(key||'')))return{ok:false,state:'failed',error:'InvalidKey'};if(typeof value!=='string'||value.length>maximumValueCharacters)return{ok:false,state:'failed',error:'InvalidValue'};const result=storage();if(!result.ok)return result;try{result.value.setItem(key,value);return{ok:true,state:'saved'}}catch(error){return errorResult(error)}},
    remove:function(key){if(!keyPattern.test(String(key||'')))return{ok:false,state:'failed',error:'InvalidKey'};const result=storage();if(!result.ok)return result;try{result.value.removeItem(key);return{ok:true,state:'empty'}}catch(error){return errorResult(error)}}
  });
  Object.defineProperty(globalThis,'__looplabHostedStorage',{value:api,configurable:false,enumerable:false,writable:false});
})();`;

export const LOOPLAB_HOSTED_STORAGE_WRAPPER_SHA256 = sha256Hex(LOOPLAB_HOSTED_STORAGE_WRAPPER_SOURCE);
