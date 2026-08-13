"use client";

import { useMemo, useState, type ChangeEvent } from "react";

type ExchangeCommand = { op: string; [key: string]: unknown };
type ExchangeResponse = { ok?: boolean; error?: unknown; result?: unknown; [key: string]: unknown };
type MapOption = { id: string; name: string };
type AssetOption = { id: string; name: string; width: number; height: number; frames: number };
type AssetBinding = { sourceName: string; assetId: string };
type SourceFile = { sourceName: string; sourceText: string; format?: "tsx" | "json" };
type ExchangeEntry = {
  id: string;
  kind: "tiled" | "aseprite";
  sourceName: string;
  sourceSha256: string;
  sourceLength: number;
  status: "current" | "stale" | "target-missing";
  sourceValid: boolean;
  byteIdenticalExportAvailable: boolean;
  warnings?: string[];
};
type ExchangePreview = {
  kind: "tiled" | "aseprite";
  sourceDigest: string;
  previewDigest: string;
  applicable: boolean;
  errors: string[];
  warnings: string[];
  parsed?: Record<string, unknown>;
  applyCommand: ExchangeCommand | null;
};
type ExchangeExport = {
  exchangeId: string;
  filename: string;
  sourceText: string;
  sourceSha256: string;
  sourceLength: number;
  byteIdentical: boolean;
  status: "exact-unchanged-source" | "stale-original-source";
  warning: string | null;
};

type CommunityExchangePanelProps = {
  maps: MapOption[];
  assets: AssetOption[];
  activeMapId: string;
  sourceDigest: string;
  disabled?: boolean;
  onRun: (command: ExchangeCommand) => Promise<ExchangeResponse>;
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const strings = (value: unknown) => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
const stableId = (value: string, fallback: string) => value.trim().replace(/[^A-Za-z0-9._:-]+/g, "-").replace(/^[^A-Za-z0-9]+/, "").replace(/-+$/g, "") || fallback;

function discoverTiledBindings(sourceName: string, sourceText: string) {
  const discovered: string[] = [];
  const add = (value: unknown) => {
    const key = String(value ?? "").trim();
    if (key && !discovered.includes(key)) discovered.push(key);
  };
  try {
    const parsed = JSON.parse(sourceText) as { tilesets?: Array<Record<string, unknown>> };
    for (const tileset of parsed.tilesets ?? []) add(tileset.source ?? tileset.name ?? tileset.image);
  } catch {
    for (const match of sourceText.matchAll(/<tileset\b[^>]*(?:source|name)\s*=\s*["']([^"']+)["']/gi)) add(match[1]);
  }
  return discovered.length ? discovered : [sourceName.replace(/\.(tmj|json|tmx)$/i, "") || "tileset"];
}

function downloadSource(filename: string, sourceText: string) {
  const blob = new Blob([sourceText], { type: filename.toLowerCase().endsWith(".tmx") || filename.toLowerCase().endsWith(".tsx") ? "application/xml" : "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "looplab-exchange-source.txt";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function CommunityExchangePanel({ maps, assets, activeMapId, sourceDigest, disabled = false, onRun }: CommunityExchangePanelProps) {
  const [mode, setMode] = useState<"tiled" | "aseprite" | "retained">("tiled");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Load source, choose exact targets, then preview. No imported art or object layer becomes collision truth.");
  const [tiledSource, setTiledSource] = useState<SourceFile | null>(null);
  const [dependencies, setDependencies] = useState<SourceFile[]>([]);
  const [bindings, setBindings] = useState<AssetBinding[]>([]);
  const [mapId, setMapId] = useState(activeMapId);
  const [replaceTiles, setReplaceTiles] = useState(false);
  const [resizeMap, setResizeMap] = useState(false);
  const [changeProjection, setChangeProjection] = useState(false);
  const [asepriteSource, setAsepriteSource] = useState<SourceFile | null>(null);
  const [assetId, setAssetId] = useState(assets[0]?.id ?? "");
  const [machineId, setMachineId] = useState("aseprite-import");
  const [targetType, setTargetType] = useState<"object-id" | "object-kind">("object-kind");
  const [targetId, setTargetId] = useState("player");
  const [replaceMachine, setReplaceMachine] = useState(false);
  const [approximateTiming, setApproximateTiming] = useState(false);
  const [preview, setPreview] = useState<ExchangePreview | null>(null);
  const [entries, setEntries] = useState<ExchangeEntry[]>([]);
  const [exported, setExported] = useState<ExchangeExport | null>(null);

  const currentMapId = maps.some((map) => map.id === mapId) ? mapId : (maps.find((map) => map.id === activeMapId)?.id ?? maps[0]?.id ?? "");
  const currentAssetId = assets.some((asset) => asset.id === assetId) ? assetId : (assets[0]?.id ?? "");
  const previewFresh = preview?.sourceDigest === sourceDigest;
  const previewSummary = useMemo(() => preview?.parsed ? Object.entries(preview.parsed).map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join(" · ") : "", [preview]);

  const run = async (command: ExchangeCommand) => {
    setBusy(true);
    try {
      const response = await onRun({ ...command, compact: true });
      if (response.ok !== true) throw new Error(String(response.error ?? "The canonical exchange command failed."));
      return record(response.result);
    } finally {
      setBusy(false);
    }
  };

  const loadTiledSource = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const sourceText = await file.text();
    setTiledSource({ sourceName: file.name, sourceText });
    const keys = discoverTiledBindings(file.name, sourceText);
    setBindings((current) => keys.map((sourceName) => current.find((binding) => binding.sourceName === sourceName) ?? { sourceName, assetId: "" }));
    setPreview(null);
    setMessage(`${file.name} loaded locally. Select one existing embedded atlas for every discovered tileset.`);
    event.target.value = "";
  };

  const loadDependencies = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    const loaded = await Promise.all(files.map(async (file) => ({ sourceName: file.name, sourceText: await file.text(), format: file.name.toLowerCase().endsWith(".tsx") ? "tsx" as const : "json" as const })));
    setDependencies(loaded);
    setPreview(null);
    setMessage(`${loaded.length} explicit Tiled dependenc${loaded.length === 1 ? "y" : "ies"} loaded. LoopLab will not resolve any other path or URL.`);
    event.target.value = "";
  };

  const loadAsepriteSource = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAsepriteSource({ sourceName: file.name, sourceText: await file.text(), format: "json" });
    setMachineId(stableId(file.name.replace(/\.json$/i, ""), "aseprite-import"));
    setPreview(null);
    setMessage(`${file.name} loaded locally. The matching atlas must already be embedded in this project.`);
    event.target.value = "";
  };

  const previewTiled = async () => {
    try {
      if (!tiledSource) throw new Error("Choose a Tiled JSON/TMJ or TMX file first.");
      const exactBindings = bindings.filter((binding) => binding.sourceName.trim() && binding.assetId);
      if (!exactBindings.length || exactBindings.length !== bindings.length) throw new Error("Every discovered tileset needs an explicit embedded-asset binding.");
      const result = await run({
        op: "preview_tiled_import",
        sourceName: tiledSource.sourceName,
        sourceText: tiledSource.sourceText,
        format: "auto",
        mapId: currentMapId,
        exchangeId: stableId(`tiled-${tiledSource.sourceName.replace(/\.[^.]+$/, "")}`, "tiled-import"),
        dependencies,
        assetBindings: exactBindings,
        replaceExisting: replaceTiles,
        resizeMap,
        allowProjectionChange: changeProjection,
      });
      const next = { ...result, kind: "tiled", errors: strings(result.errors), warnings: strings(result.warnings), applyCommand: record(result.applyCommand).op ? record(result.applyCommand) as ExchangeCommand : null } as ExchangePreview;
      setPreview(next);
      setMessage(next.applicable ? "Tiled proposal passed canonical validation and both Doctor profiles. Review, then apply the exact receipt." : "Tiled proposal is blocked. Review the exact errors below; nothing changed.");
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const previewAseprite = async () => {
    try {
      if (!asepriteSource) throw new Error("Choose Aseprite JSON metadata first.");
      if (!currentAssetId) throw new Error("The project needs the matching embedded atlas before metadata can be imported.");
      const result = await run({
        op: "preview_aseprite_import",
        sourceName: asepriteSource.sourceName,
        sourceText: asepriteSource.sourceText,
        assetId: currentAssetId,
        exchangeId: stableId(`aseprite-${asepriteSource.sourceName.replace(/\.[^.]+$/, "")}`, "aseprite-import"),
        machineId: stableId(machineId, `aseprite-${currentAssetId}`),
        target: { type: targetType, id: stableId(targetId, "player") },
        replaceExisting: replaceMachine,
        allowTimingApproximation: approximateTiming,
      });
      const next = { ...result, kind: "aseprite", errors: strings(result.errors), warnings: strings(result.warnings), applyCommand: record(result.applyCommand).op ? record(result.applyCommand) as ExchangeCommand : null } as ExchangePreview;
      setPreview(next);
      setMessage(next.applicable ? "Aseprite proposal passed canonical validation and both Doctor profiles. Review, then apply the exact receipt." : "Aseprite proposal is blocked. Review the exact errors below; nothing changed.");
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const applyPreview = async () => {
    try {
      if (!preview?.applyCommand || !previewFresh) throw new Error("The preview is missing or stale. Preview the current project again.");
      const result = await run(preview.applyCommand);
      setMessage(result.applied === true ? "The exact reviewed exchange was applied to canonical authoring source." : "The exact exchange was already represented; canonical source did not change.");
      setPreview(null);
      await listRetained();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const listRetained = async () => {
    try {
      const result = await run({ op: "list_community_exchanges" });
      const nextEntries = Array.isArray(result.entries) ? result.entries as ExchangeEntry[] : [];
      setEntries(nextEntries);
      setExported((current) => current && nextEntries.some((entry) => entry.id === current.exchangeId) ? current : null);
      setMode("retained");
      setMessage(`${Number(result.entryCount ?? 0)} retained exchange source${Number(result.entryCount ?? 0) === 1 ? "" : "s"}. Current means byte-identical export is available; stale means only the labelled original is available.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const viewRetained = async (entry: ExchangeEntry) => {
    try {
      const result = await run({ op: "export_community_exchange", exchangeId: entry.id, allowStaleOriginal: entry.status !== "current" });
      setExported(result as ExchangeExport);
      setMessage(entry.status === "current" ? "Verified exact unchanged source loaded for viewing." : "Original imported source loaded with a stale warning; it does not contain later LoopLab edits.");
    } catch (error) {
      setExported(null);
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const unavailable = disabled || busy;

  return <section id="looplab-community-exchange" className="agent-community-exchange" aria-labelledby="community-exchange-heading" data-preview-fresh={previewFresh ? "true" : "false"}>
    <header><div><strong id="community-exchange-heading">Tiled + Aseprite exchange</strong><small>Exact retained source → canonical preview → digest-gated apply</small></div><button type="button" onClick={() => void listRetained()} disabled={unavailable}>Refresh retained</button></header>
    <div className="community-exchange-tabs" role="tablist" aria-label="Community exchange format">
      <button type="button" role="tab" aria-selected={mode === "tiled"} className={mode === "tiled" ? "active" : ""} onClick={() => setMode("tiled")}>Tiled map</button>
      <button type="button" role="tab" aria-selected={mode === "aseprite"} className={mode === "aseprite" ? "active" : ""} onClick={() => setMode("aseprite")}>Aseprite animation</button>
      <button type="button" role="tab" aria-selected={mode === "retained"} className={mode === "retained" ? "active" : ""} onClick={() => setMode("retained")}>Retained source</button>
    </div>

    {mode === "tiled" && <div className="community-exchange-fields">
      <label>Map document <input type="file" accept=".tmj,.json,.tmx,application/json,application/xml,text/xml" onChange={(event) => void loadTiledSource(event)} disabled={unavailable} /></label>
      <small>{tiledSource ? `${tiledSource.sourceName} · ${tiledSource.sourceText.length.toLocaleString()} characters` : "Tiled JSON/TMJ or uncompressed TMX. The full file stays local until the canonical command runs."}</small>
      <label>Explicit TSX/JSON dependencies <input type="file" multiple accept=".tsx,.json,application/json,application/xml,text/xml" onChange={(event) => void loadDependencies(event)} disabled={unavailable} /></label>
      {dependencies.length > 0 && <small>{dependencies.map((dependency) => dependency.sourceName).join(" · ")}</small>}
      <label>Destination map <select value={currentMapId} onChange={(event) => { setMapId(event.target.value); setPreview(null); }}>{maps.map((map) => <option key={map.id} value={map.id}>{map.name} · {map.id}</option>)}</select></label>
      <div className="community-exchange-bindings"><b>Exact tileset → embedded atlas</b>{bindings.map((binding, index) => <label key={`${binding.sourceName}-${index}`}><input aria-label={`Tiled source binding ${index + 1}`} value={binding.sourceName} onChange={(event) => { setBindings((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, sourceName: event.target.value } : item)); setPreview(null); }} /><select aria-label={`Embedded atlas for ${binding.sourceName || `binding ${index + 1}`}`} value={binding.assetId} onChange={(event) => { setBindings((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, assetId: event.target.value } : item)); setPreview(null); }}><option value="">Choose embedded atlas…</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} · {asset.id}</option>)}</select></label>)}</div>
      <div className="community-exchange-checks"><label><input type="checkbox" checked={replaceTiles} onChange={(event) => { setReplaceTiles(event.target.checked); setPreview(null); }} /> Replace existing visual tile layers</label><label><input type="checkbox" checked={resizeMap} onChange={(event) => { setResizeMap(event.target.checked); setPreview(null); }} /> Accept imported dimensions</label><label><input type="checkbox" checked={changeProjection} onChange={(event) => { setChangeProjection(event.target.checked); setPreview(null); }} /> Accept projection change</label></div>
      <button type="button" onClick={() => void previewTiled()} disabled={unavailable || !tiledSource}>{busy ? "Checking…" : "Preview Tiled import"}</button>
    </div>}

    {mode === "aseprite" && <div className="community-exchange-fields">
      <label>Aseprite JSON metadata <input type="file" accept=".json,application/json" onChange={(event) => void loadAsepriteSource(event)} disabled={unavailable} /></label>
      <small>{asepriteSource ? `${asepriteSource.sourceName} · ${asepriteSource.sourceText.length.toLocaleString()} characters` : "Export JSON metadata from Aseprite; embed the matching PNG atlas in LoopLab first."}</small>
      <label>Matching embedded atlas <select value={currentAssetId} onChange={(event) => { setAssetId(event.target.value); setPreview(null); }}><option value="">Choose embedded atlas…</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} · {asset.width}×{asset.height} · {asset.frames} frames</option>)}</select></label>
      <label>Animation machine ID <input value={machineId} onChange={(event) => { setMachineId(event.target.value); setPreview(null); }} /></label>
      <div className="community-exchange-target"><label>Target type <select value={targetType} onChange={(event) => { setTargetType(event.target.value as "object-id" | "object-kind"); setPreview(null); }}><option value="object-kind">Object kind</option><option value="object-id">Exact object ID</option></select></label><label>Target ID <input value={targetId} onChange={(event) => { setTargetId(event.target.value); setPreview(null); }} /></label></div>
      <div className="community-exchange-checks"><label><input type="checkbox" checked={replaceMachine} onChange={(event) => { setReplaceMachine(event.target.checked); setPreview(null); }} /> Replace same-ID machine</label><label><input type="checkbox" checked={approximateTiming} onChange={(event) => { setApproximateTiming(event.target.checked); setPreview(null); }} /> Explicitly approximate unequal frame timing</label></div>
      <button type="button" onClick={() => void previewAseprite()} disabled={unavailable || !asepriteSource || !currentAssetId}>{busy ? "Checking…" : "Preview Aseprite import"}</button>
    </div>}

    {mode === "retained" && <div className="community-exchange-retained">
      {!entries.length && <small>No retained exchange source has been loaded in this project.</small>}
      {entries.map((entry) => <article key={entry.id} className={entry.status === "current" ? "is-current" : "is-stale"}><div><b>{entry.sourceName}</b><code>{entry.id}</code><small>{entry.kind} · {entry.sourceLength.toLocaleString()} characters · {entry.status}</small></div><button type="button" onClick={() => void viewRetained(entry)} disabled={unavailable || !entry.sourceValid}>{entry.status === "current" ? "View exact" : "View stale original"}</button></article>)}
      {exported && <div className={`community-exchange-export ${exported.byteIdentical ? "is-current" : "is-stale"}`}><b>{exported.status}</b><small>{exported.warning ?? "These are the exact unchanged imported bytes for the current canonical projection."}</small><code>{exported.sourceSha256}</code><textarea aria-label="Retained community exchange source" value={exported.sourceText} readOnly spellCheck={false} /><button type="button" onClick={() => downloadSource(exported.filename, exported.sourceText)}>Download {exported.filename}</button></div>}
    </div>}

    {preview && <div className={`community-exchange-preview ${preview.applicable && previewFresh ? "is-ready" : "is-blocked"}`} role="status"><b>{!previewFresh ? "Preview stale" : preview.applicable ? "Exact proposal ready" : "Proposal blocked"}</b><small>{previewSummary}</small><code>{preview.previewDigest}</code>{preview.errors.map((error) => <small key={`error-${error}`}>Blocked: {error}</small>)}{preview.warnings.map((warning) => <small key={`warning-${warning}`}>Review: {warning}</small>)}<button type="button" onClick={() => void applyPreview()} disabled={unavailable || !preview.applicable || !previewFresh || !preview.applyCommand}>Apply exact reviewed import</button></div>}
    <p className="community-exchange-message" role="status">{message}</p>
    <small>Object layers and generated pixels are advisory. Existing authored collision remains the only gameplay-geometry owner. Native .ase binaries, compressed TMX, implicit dependency resolution, and ambiguous animation atlases fail closed.</small>
  </section>;
}
