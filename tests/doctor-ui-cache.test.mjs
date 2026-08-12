import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../app/page.tsx", import.meta.url);

test("Project Doctor and bounded agent context share one debounced source-bound cache", async () => {
  const page = await readFile(pageUrl, "utf8");
  assert.doesNotMatch(page, /const doctorReport = useMemo\(\(\) => analyzeProject\(syncActiveMap\(project\)\)/);
  assert.doesNotMatch(page, /applyAgentCommand\(syncActiveMap\(project\), \{\s*op: "get_project_context"/);
  assert.match(page, /const timeoutId = window\.setTimeout\(\(\) => \{/);
  assert.match(page, /\}, 120\);/);
  assert.match(page, /const doctorReport = doctorCache\.report;/);
  assert.match(page, /const doctorReportFresh = doctorCache\.sourceProject === project && !doctorAnalysisPending;/);
  assert.match(page, /buildAgentProjectContext\(doctorCache\.project, \{/);
  assert.match(page, /doctor: doctorReport,[\s\S]*releaseDoctor: releaseDoctorReport/);
  assert.match(page, /data-context-fresh=\{doctorReportFresh \? "true" : "false"\}/);
  assert.match(page, /disabled=\{!doctorReportFresh \|\| project\.iteration\?\.status !== "verified"/);
});