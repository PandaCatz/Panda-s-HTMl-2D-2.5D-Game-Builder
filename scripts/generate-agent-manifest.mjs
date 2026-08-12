import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { getPublicAgentManifest } from "../lib/looplab-agent-core.mjs";

const target = resolve(new URL("../public/agent-manifest.json", import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, "$1"));
await writeFile(target, `${JSON.stringify(getPublicAgentManifest(), null, 2)}\n`, "utf8");
process.stdout.write(`${target}\n`);
