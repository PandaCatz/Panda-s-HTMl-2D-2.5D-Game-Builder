import { createRuntimeModel as createBareRuntimeModel } from "./looplab-runtime-model.mjs";
import { compileTileRuntimeProgram } from "./looplab-tile-runtime.mjs";

export function createRuntimeModel(project) {
  return createBareRuntimeModel(project, { compileTileRuntimeProgram });
}
