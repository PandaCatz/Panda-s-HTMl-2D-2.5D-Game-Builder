import assert from "node:assert/strict";
import test from "node:test";

import { stageAtomicPortalCommand } from "../lib/looplab-iteration-command-staging.mjs";

test("direct portal objects wait for the complete atomic map candidate", () => {
  const command = { op: "add_object", kind: "portal", object: { id: "exit", targetMapId: "later", targetSpawnId: "entry" } };
  const staged = stageAtomicPortalCommand(command, { activeMapId: "source" });
  assert.equal(staged.defer, true);
  assert.equal(staged.deferredCommands[0].mapId, "source");
  assert.deepEqual(staged.deferredCommands[0].command, command);
});

test("inline map portals are removed only from the intermediate map document", () => {
  const command = {
    op: "add_map",
    map: {
      id: "source",
      objects: [
        { id: "floor", kind: "platform" },
        { id: "exit", kind: "portal", targetMapId: "later", targetSpawnId: "entry" },
      ],
    },
  };
  const staged = stageAtomicPortalCommand(command, { activeMapId: "map-main" });
  assert.equal(staged.defer, false);
  assert.deepEqual(staged.stagedCommand.map.objects.map((object) => object.id), ["floor"]);
  assert.equal(staged.deferredCommands[0].mapId, "source");
  assert.equal(staged.deferredCommands[0].command.object.id, "exit");
  assert.deepEqual(command.map.objects.map((object) => object.id), ["floor", "exit"], "staging must not mutate provider output");
});

test("portal target updates and connect_maps commands wait for their dependencies", () => {
  const update = stageAtomicPortalCommand({ op: "update_object", id: "exit", changes: { targetMapId: "later" } }, { activeMapId: "source" });
  const connect = stageAtomicPortalCommand({ op: "connect_maps", sourceMapId: "source", targetMapId: "later" }, { activeMapId: "source" });
  assert.equal(update.defer, true);
  assert.equal(connect.defer, true);
});
