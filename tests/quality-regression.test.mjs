import assert from "node:assert/strict";
import test from "node:test";

import { doctorIssueIdentity, introducedDoctorErrors } from "../lib/looplab-quality.mjs";

test("Doctor regression identity includes the owning map, object, asset, and feature", () => {
  const base = { severity: "error", category: "maps", code: "object-outside-map", mapId: "map-a", objectId: "bench" };
  assert.notEqual(doctorIssueIdentity(base), doctorIssueIdentity({ ...base, mapId: "map-b" }));
  assert.notEqual(doctorIssueIdentity(base), doctorIssueIdentity({ ...base, objectId: "rail" }));
  assert.notEqual(doctorIssueIdentity(base), doctorIssueIdentity({ ...base, assetId: "bench-art" }));
  assert.notEqual(doctorIssueIdentity(base), doctorIssueIdentity({ ...base, featureId: "route-a" }));
});

test("a different blocker is new even when total blocker count stays unchanged", () => {
  const before = [{ severity: "error", category: "release", code: "external-release-request" }];
  const after = [{ severity: "error", category: "maps", code: "portal-target-missing", mapId: "map-a", objectId: "exit" }];
  const introduced = introducedDoctorErrors(before, after);
  assert.equal(before.length, after.length);
  assert.equal(introduced.length, 1);
  assert.equal(introduced[0].code, "portal-target-missing");
});

test("moving an existing blocker to a different authored object is still a regression", () => {
  const before = [{ severity: "error", category: "maps", code: "object-outside-map", mapId: "map-a", objectId: "bench" }];
  const after = [{ severity: "error", category: "maps", code: "object-outside-map", mapId: "map-a", objectId: "rail" }];
  assert.equal(introducedDoctorErrors(before, after).length, 1);
});
