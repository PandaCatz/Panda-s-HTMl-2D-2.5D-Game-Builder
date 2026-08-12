#!/usr/bin/env node

import { inspectProviders } from "../lib/looplab-provider-status.mjs";

const scan = await inspectProviders();
process.stdout.write(`${JSON.stringify(scan, null, 2)}\n`);
