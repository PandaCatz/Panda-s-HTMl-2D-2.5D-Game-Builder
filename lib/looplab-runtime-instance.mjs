import { createRuntimeModel as createBareRuntimeModel } from "./looplab-runtime-model.mjs";
import { compileTileRuntimeProgram } from "./looplab-tile-runtime.mjs";
import { compileWorldStreamRuntime } from "./looplab-world-stream.mjs";

export function createRuntimeModel(project) {
  return createBareRuntimeModel(project, { compileTileRuntimeProgram, compileWorldStreamRuntime });
}
