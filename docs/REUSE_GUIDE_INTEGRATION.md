# Card Wind Runner reuse-guide integration

Source: private local reuse guide supplied by the project owner
SHA-256: `9662eb78f40a6c6e74931485a5a9ff54a26345ae833ac4d2f2fefaa9fa560083`

Looplab uses the guide as modular architecture research. It does not copy `RunnerScene`, runner-specific content, project palettes, tuning values, or renderer-owned state into maker core.

## Implemented and executable

- Project schema version `1.0.0` with stable serializable authoring state.
- Renderer-independent runtime model shared by editor preview, deterministic verification, and generated HTML.
- Fixed 60 Hz preview/export stepping, five-step catch-up cap, dropped-catch-up tracking, p95 frame time, long-frame count, and headless performance receipts.
- Executable semantic-input replay fixtures with canonical nested simulation-only hashes, per-tick checkpoints, first-divergence reporting, explicit rerecord revisions/reasons, Project Doctor execution, browser/CLI authoring commands, and an embedded one-file runtime replay API.
- Semantic held/pressed input with focus-loss clearing and a fresh E/LOCK edge for portals and traversal paths.
- Swept axis response for thin authored obstacles, with a tunneling regression fixture.
- Authored rail/grind/zipline/route paths with stable IDs, control points, entry radius, minimum speed, direction, acceleration, maximum speed, exit impulse, transfers, and bail policy.
- Headless path commands: `add_traversal_path`, `update_traversal_path`, and `remove_traversal_path`.
- Editor path list, fine-tuning fields, visibility toggle, control-point overlay, entry-radius preview, and active-path preview feedback.
- Runtime traversal capture, ride, completion, release, events, and `getTraversalPaths()` inspection.
- Directed movement/rules templates for kinetic runner/skating, traditional platformer, top-down action RPG, twin-stick shooter, tactics grid, deck combat, and exploration/narrative.
- Project Doctor checks for schema compatibility, renderer/simulation ownership, fixed-step/replay agreement, authored path integrity, high-speed collision policy, linked production path tests, and one-file/PWA conflicts.
- Authored runtime-join contracts for connected maps, a headless join plan, exact-spawn and clear-landing checks, and browser pixel receipts for every enabled portal × device profile. The collector drives the real transition, excludes the player, hashes both environments, samples genuinely new target content beyond any overlap, and applies a boundary-color threshold for continuous joins.
- Generated artifact audit rejection for service workers and Cache API dependencies.

## Routed contracts that remain opt-in

The capability router provides enforceable AI instructions for camera strategies, animation state definitions, continuous-world chunks, historical-pose afterimages, parallax/effect plugins, streaming/residency, and richer performance timing. Routing means the builder understands the contract; it is not evidence that a candidate activated the system.

Activation requires all of the following:

1. explicit project data;
2. declared embedded asset or sidecar requirements;
3. a renderer adapter that consumes the data without owning simulation truth;
4. linked acceptance tests and browser evidence.

Continuous chunk streaming remains opt-in. The reusable actual-runtime-join evidence primitive is implemented for authored map portals; copied-overlap equality is not sufficient evidence.

## One-file adaptation

The source guide recommends an optional service worker/PWA export and separate sidecars. Looplab's upload target is stricter: exactly one offline `.html` file. Therefore:

- service workers, Cache API dependencies, runtime fetches, CDNs, module imports, and multi-file PWA output are excluded;
- a selected sidecar must be embedded as project data or a data URL inside the HTML;
- Phaser uses an inline browser script build, Pixi uses an inline browser UMD bundle, and melonJS uses a tree-shaken inline IIFE;
- only assets selected into the current project are packaged.

## Next extraction slices

1. Camera-zone editor with reduced-motion variants.
2. Animation-definition editor with transition and interruptibility preview.
3. Continuous chunk schema and engine-independent residency backend with fetch/decode/upload/first-draw timing.
4. Effect-plugin editor and historical-pose afterimage implementation.
5. Generated project-specific tests and native-resolution route capture.

The machine-readable source of truth is `getAgentManifest().reuseGuide` and `route_work.reuseGuide`, not this prose status file.
