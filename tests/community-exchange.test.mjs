import test from "node:test";
import assert from "node:assert/strict";

import {
  exportCommunityExchange,
  inspectCommunityExchanges,
  previewAsepriteImport,
  previewTiledImport,
  upsertCommunityExchange,
} from "../lib/looplab-community-exchange.mjs";
import { applyAgentCommand, createTemplate, getAgentManifest } from "../lib/looplab-agent-core.mjs";

function projectFixture() {
  return {
    id: "exchange-project",
    activeMapId: "map-main",
    assets: [
      { id: "terrain-atlas", name: "Terrain", type: "tileset", width: 96, height: 32, frameWidth: 32, frameHeight: 32, frames: 3, columns: 3, dataUrl: "data:image/png;base64,AAAA" },
      { id: "hero-atlas", name: "Hero", type: "sprite", width: 64, height: 32, frameWidth: 16, frameHeight: 16, frames: 8, columns: 4, dataUrl: "data:image/png;base64,AAAA" },
    ],
    maps: [{
      id: "map-main",
      name: "Main",
      width: 96,
      height: 64,
      grid: 32,
      projection: { type: "orthographic", tileWidth: 32, tileHeight: 32 },
      objects: [{ id: "hero", kind: "player", name: "Hero", assetId: "hero-atlas", x: 16, y: 16, width: 16, height: 16 }],
      tileProgram: {
        schemaVersion: "looplab-tile-program/v1",
        collisionOwner: "authored-map",
        cellWidth: 32,
        cellHeight: 32,
        columns: 3,
        rows: 2,
        chunkSize: 16,
        variationSeed: 5,
        palette: [],
        terrainSets: [],
        collisionProfiles: [{ id: "solid", name: "Solid", shape: "solid-full" }],
        layers: [],
        collisionLayers: [{ id: "collision", name: "Collision", visible: true, locked: false, zMin: 0, zMax: 1, chunks: [] }],
      },
    }],
  };
}

function tiledJson() {
  return JSON.stringify({
    type: "map",
    version: "1.10",
    tiledversion: "1.11.2",
    orientation: "orthogonal",
    renderorder: "right-down",
    width: 3,
    height: 2,
    tilewidth: 32,
    tileheight: 32,
    infinite: false,
    layers: [
      { id: 1, name: "Ground", type: "tilelayer", width: 3, height: 2, opacity: 1, visible: true, data: [1, (0x80000000 | 2) >>> 0, 0, 3, 0, 1] },
      { id: 2, name: "Advisory collision", type: "objectgroup", objects: [{ id: 1, x: 0, y: 0, width: 32, height: 32 }] },
    ],
    tilesets: [{ firstgid: 1, name: "terrain", tilewidth: 32, tileheight: 32, tilecount: 3, columns: 3, image: "terrain.png", imagewidth: 96, imageheight: 32 }],
  });
}

test("Tiled JSON preview projects explicit GID transforms while preserving authored collision", () => {
  const project = projectFixture();
  const preview = previewTiledImport(project, {
    sourceName: "main.tmj",
    sourceText: tiledJson(),
    mapId: "map-main",
    exchangeId: "main-tiled",
    replaceExisting: true,
    assetBindings: [{ sourceName: "terrain", assetId: "terrain-atlas" }],
  }, { sourceDigest: "source-test" });
  assert.equal(preview.applicable, true, JSON.stringify(preview.errors));
  assert.equal(preview.proposal.tileProgram.collisionOwner, "authored-map");
  assert.deepEqual(preview.proposal.tileProgram.collisionProfiles, project.maps[0].tileProgram.collisionProfiles);
  assert.deepEqual(preview.proposal.tileProgram.collisionLayers, project.maps[0].tileProgram.collisionLayers);
  assert.equal(preview.parsed.objectLayerCount, 1);
  assert.match(preview.warnings[0], /not applied as collision/i);
  const cells = preview.proposal.tileProgram.layers[0].chunks[0].cells;
  assert.equal(cells[0] & 0x0fffffff, 1);
  assert.equal(Boolean(cells[1] & 0x80000000), true);
  assert.match(preview.previewDigest, /^sha256:[a-f0-9]{64}$/);
});

test("TMX preview resolves only explicitly supplied TSX dependencies", () => {
  const tmx = `<?xml version="1.0" encoding="UTF-8"?>\n<map orientation="orthogonal" width="3" height="2" tilewidth="32" tileheight="32" infinite="0"><tileset firstgid="1" source="terrain.tsx"/><layer id="1" name="Ground" width="3" height="2"><data encoding="csv">1,2,0,3,0,1</data></layer></map>`;
  const tsx = `<?xml version="1.0" encoding="UTF-8"?>\n<tileset name="terrain" tilewidth="32" tileheight="32" tilecount="3" columns="3"><image source="terrain.png" width="96" height="32"/></tileset>`;
  const preview = previewTiledImport(projectFixture(), {
    sourceName: "main.tmx",
    sourceText: tmx,
    mapId: "map-main",
    replaceExisting: true,
    dependencies: [{ sourceName: "terrain.tsx", sourceText: tsx, format: "tsx" }],
    assetBindings: [{ sourceName: "terrain.tsx", assetId: "terrain-atlas" }],
  });
  assert.equal(preview.applicable, true, JSON.stringify(preview.errors));
  assert.equal(preview.parsed.format, "tmx");
  assert.equal(preview.proposal.exchangeEntry.dependencies.length, 1);
  assert.throws(() => previewTiledImport(projectFixture(), { sourceName: "bad.tmx", sourceText: tmx, mapId: "map-main", replaceExisting: true }), /not supplied/i);
  assert.throws(() => previewTiledImport(projectFixture(), { sourceName: "bad.tmx", sourceText: '<!DOCTYPE map [<!ENTITY x "x">]><map/>', mapId: "map-main", replaceExisting: true }), /forbidden/i);
});

function asepriteJson(variableTiming = false) {
  const durations = variableTiming ? [100, 150, 100, 150, 100, 100, 100, 100] : Array(8).fill(100);
  return JSON.stringify({
    frames: Array.from({ length: 8 }, (_, index) => ({
      filename: `hero-${index}.png`,
      frame: { x: (index % 4) * 16, y: Math.floor(index / 4) * 16, w: 16, h: 16 },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
      sourceSize: { w: 16, h: 16 },
      duration: durations[index],
    })),
    meta: { image: "hero.png", size: { w: 64, h: 32 }, scale: "1", frameTags: [{ name: "idle", from: 0, to: 3, direction: "forward" }, { name: "run", from: 4, to: 7, direction: "pingpong" }] },
  });
}

test("Aseprite preview maps uniform tags into the renderer-neutral presentation machine", () => {
  const preview = previewAsepriteImport(projectFixture(), {
    sourceName: "hero.json",
    sourceText: asepriteJson(),
    assetId: "hero-atlas",
    machineId: "hero-animation",
    target: { type: "object-id", id: "hero" },
  }, { sourceDigest: "source-test" });
  assert.equal(preview.applicable, true, JSON.stringify(preview.errors));
  assert.equal(preview.proposal.presentationProgram.animation.enabled, true);
  assert.equal(preview.proposal.presentationProgram.animation.machines[0].states.length, 2);
  assert.deepEqual(preview.proposal.presentationProgram.animation.machines[0].states[1].frames, [4, 5, 6, 7, 6, 5]);
  assert.equal(preview.proposal.updatedAsset.frames, 8);
  assert.equal(preview.proposal.updatedAsset.columns, 4);
});

test("Aseprite timing ambiguity is rejected unless an explicit approximation is requested", () => {
  const input = { sourceName: "hero.json", sourceText: asepriteJson(true), assetId: "hero-atlas", target: { type: "object-id", id: "hero" } };
  const blocked = previewAsepriteImport(projectFixture(), input);
  assert.equal(blocked.applicable, false);
  assert.match(blocked.errors.join(" "), /per-frame durations/i);
  const reviewed = previewAsepriteImport(projectFixture(), { ...input, allowTimingApproximation: true });
  assert.equal(reviewed.applicable, true, JSON.stringify(reviewed.errors));
  assert.match(reviewed.warnings.join(" "), /mean FPS/i);
});

test("exchange inspection and export distinguish exact unchanged bytes from stale original bytes", () => {
  const base = projectFixture();
  const preview = previewTiledImport(base, { sourceName: "main.tmj", sourceText: tiledJson(), mapId: "map-main", exchangeId: "main-tiled", replaceExisting: true, assetBindings: [{ sourceName: "terrain", assetId: "terrain-atlas" }] });
  const applied = structuredClone(base);
  applied.maps[0] = { ...applied.maps[0], ...preview.proposal.mapChanges, tileProgram: preview.proposal.tileProgram };
  const withEntry = upsertCommunityExchange(applied, preview.proposal.exchangeEntry);
  const report = inspectCommunityExchanges(withEntry);
  assert.equal(report.entries[0].status, "current");
  assert.equal(report.entries[0].byteIdenticalExportAvailable, true);
  const exact = exportCommunityExchange(withEntry, { exchangeId: "main-tiled" });
  assert.equal(exact.byteIdentical, true);
  assert.equal(exact.sourceText, tiledJson());
  const edited = structuredClone(withEntry);
  edited.maps[0].tileProgram.variationSeed += 1;
  assert.throws(() => exportCommunityExchange(edited, { exchangeId: "main-tiled" }), /allowStaleOriginal/i);
  const stale = exportCommunityExchange(edited, { exchangeId: "main-tiled", allowStaleOriginal: true });
  assert.equal(stale.byteIdentical, false);
  assert.equal(stale.status, "stale-original-source");
});

function canonicalBuilderProject() {
  const project = structuredClone(createTemplate("platformer"));
  project.assets.push({ id: "terrain-atlas", name: "Terrain", type: "tileset", width: 60, height: 20, frameWidth: 20, frameHeight: 20, frames: 3, columns: 3, collisionPolicy: "authored-only", dataUrl: "data:image/png;base64,AAAA" });
  project.assets.push({ id: "hero-atlas", name: "Hero atlas", type: "sprite", width: 64, height: 32, frameWidth: 16, frameHeight: 16, frames: 8, columns: 4, collisionPolicy: "authored-only", dataUrl: "data:image/png;base64,AAAA" });
  const player = project.maps[0].objects.find((object) => object.id === "player");
  player.assetId = "hero-atlas";
  return project;
}

function fullSizeTiledJson() {
  const data = Array(48 * 27).fill(0);
  data[0] = 1;
  data[1] = (0x80000000 | 2) >>> 0;
  data[48] = 3;
  return JSON.stringify({ type: "map", version: "1.10", tiledversion: "1.11.2", orientation: "orthogonal", width: 48, height: 27, tilewidth: 20, tileheight: 20, infinite: false, layers: [{ id: 1, name: "Visual ground", type: "tilelayer", width: 48, height: 27, data }], tilesets: [{ firstgid: 1, name: "terrain", tilewidth: 20, tileheight: 20, tilecount: 3, columns: 3, image: "terrain.png", imagewidth: 60, imageheight: 20 }] });
}

test("canonical commands preview and digest-apply a Tiled import without changing authored collision", () => {
  const project = canonicalBuilderProject();
  const sourceText = fullSizeTiledJson();
  const previewCommand = { op: "preview_tiled_import", sourceName: "main.tmj", sourceText, mapId: "map-main", assetBindings: [{ sourceName: "terrain", assetId: "terrain-atlas" }] };
  const preview = applyAgentCommand(project, previewCommand).result;
  assert.equal(preview.applicable, true, JSON.stringify({ errors: preview.errors, validation: preview.validation?.errors, blockers: preview.doctor?.newBlockers }, null, 2));
  assert.equal(preview.applyCommand.expectedSourceDigest, preview.sourceDigest);
  assert.match(preview.applyCommand.expectedPreviewDigest, /^sha256:[a-f0-9]{64}$/);
  const applied = applyAgentCommand(project, preview.applyCommand);
  assert.equal(applied.changed, true);
  assert.equal(applied.project.maps[0].tileProgram.collisionOwner, "authored-map");
  assert.deepEqual(applied.project.maps[0].tileProgram.collisionLayers, []);
  assert.equal(applied.project.authoring.communityExchange.entries.length, 1);
  const exported = applyAgentCommand(applied.project, { op: "export_community_exchange", exchangeId: applied.project.authoring.communityExchange.entries[0].id }).result;
  assert.equal(exported.byteIdentical, true);
  assert.equal(exported.sourceText, sourceText);
});

test("canonical commands preview and digest-apply Aseprite tags to an existing embedded atlas", () => {
  const project = canonicalBuilderProject();
  const preview = applyAgentCommand(project, { op: "preview_aseprite_import", sourceName: "hero.json", sourceText: asepriteJson(), assetId: "hero-atlas", machineId: "hero-imported", target: { type: "object-id", id: "player" } }).result;
  assert.equal(preview.applicable, true, JSON.stringify({ errors: preview.errors, presentation: preview.presentationReport?.errors, validation: preview.validation?.errors, blockers: preview.doctor?.newBlockers }, null, 2));
  const applied = applyAgentCommand(project, preview.applyCommand);
  assert.equal(applied.changed, true);
  assert.equal(applied.project.presentationProgram.animation.machines.some((machine) => machine.id === "hero-imported"), true);
  assert.equal(applied.project.assets.find((asset) => asset.id === "hero-atlas").frames, 8);
  assert.equal(applied.project.authoring.communityExchange.entries[0].kind, "aseprite");
});

test("manifest exposes source-bound exchange workflows to both canonical surfaces", () => {
  const manifest = getAgentManifest();
  assert.equal(manifest.communityExchange.schemaVersion, "looplab-community-exchange/v1");
  assert.equal(manifest.commandSurfaces.core.includes("apply_tiled_import"), true);
  assert.equal(manifest.commandSurfaces.browserSession.includes("apply_aseprite_import"), true);
  assert.match(manifest.communityExchange.policy.collisionAuthority, /never becomes collision truth/i);
});
