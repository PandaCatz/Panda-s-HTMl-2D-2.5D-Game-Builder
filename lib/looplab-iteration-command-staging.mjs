function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
function portalObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) && value.kind === "portal";
}

function deferred(command, mapId, reason) {
  return { command: clone(command), mapId: mapId ?? null, reason };
}

export function stageAtomicPortalCommand(command, { activeMapId = null } = {}) {
  const source = clone(command ?? {});
  const kind = source.kind ?? source.object?.kind;
  if (source.op === "add_object" && kind === "portal") {
    return {
      defer: true,
      stagedCommand: null,
      deferredCommands: [deferred({ ...source, kind: "portal" }, activeMapId, "portal-object-forward-reference")],
    };
  }

  if (source.op === "connect_maps") {
    return {
      defer: true,
      stagedCommand: null,
      deferredCommands: [deferred(source, activeMapId, "map-connection-forward-reference")],
    };
  }

  const changes = source.changes && typeof source.changes === "object" && !Array.isArray(source.changes) ? source.changes : null;
  if (source.op === "update_object" && changes && ["targetMapId", "targetSpawnId", "runtimeJoin"].some((key) => Object.prototype.hasOwnProperty.call(changes, key))) {
    return {
      defer: true,
      stagedCommand: null,
      deferredCommands: [deferred(source, activeMapId, "portal-target-update-forward-reference")],
    };
  }

  const mapDocument = source.op === "add_map" && source.map && typeof source.map === "object" && !Array.isArray(source.map)
    ? source.map
    : source.op === "update_map" && changes
      ? changes
      : null;
  const objects = Array.isArray(mapDocument?.objects) ? mapDocument.objects : null;
  const portals = objects?.filter(portalObject) ?? [];
  if (!portals.length) return { defer: false, stagedCommand: source, deferredCommands: [] };

  const mapId = source.op === "add_map" ? (source.map.id ?? source.id) : (source.id ?? activeMapId);
  const withoutPortals = objects.filter((object) => !portalObject(object));
  const stagedCommand = source.op === "add_map"
    ? { ...source, map: { ...source.map, objects: withoutPortals } }
    : { ...source, changes: { ...changes, objects: withoutPortals } };
  return {
    defer: false,
    stagedCommand,
    deferredCommands: portals.map((object) => deferred({ op: "add_object", kind: "portal", object }, mapId, "inline-map-portal-forward-reference")),
  };
}
