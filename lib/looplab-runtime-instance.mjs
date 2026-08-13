import { createRuntimeModel as createBareRuntimeModel } from "./looplab-runtime-model.mjs";
import { compileTileRuntimeProgram } from "./looplab-tile-runtime.mjs";
import { compileWorldStreamRuntime } from "./looplab-world-stream.mjs";
import { normalizeRunVariationProgram, resolveRunVariation, runVariationProgramDigest } from "./looplab-run-variation-runtime.mjs";

export function createRuntimeModel(project) {
  return createBareRuntimeModel(project, { compileTileRuntimeProgram, compileWorldStreamRuntime, normalizeRunVariationProgram, resolveRunVariation, runVariationProgramDigest });
}
