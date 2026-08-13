# Looplab AI map-generation requirements

This document is the acceptance specification for AI-authored 2D maps. The UI, headless API, AI iteration runner, and exported game must share these rules.

| Failure mode | Builder capability | Blocking gate |
| --- | --- | --- |
| Art and collision disagree | Visual bounds and authored collider/path are separate records; collision overlays show both | Generated art can never own collision |
| Incorrect object anchors | Every placed asset has an explicit ground-contact anchor | Asset-backed objects without a ground anchor are flagged |
| Wrong 2:1 projection | Dimetric mode uses exact 128×64 diamonds and explicit elevation steps | Any other size or ratio fails validation |
| Side-scroller-only editing | Map Architect shares one reversible world-to-screen adapter across editing, hit-testing, preview, export, and AI | Projection parity and round-trip tests must pass |
| Object footprint errors | Gameplay footprint is independent from the visible rectangle and has a z range | Large visual/footprint disagreement is flagged |
| Props blocking lines | Routes own preview, run-up, landing, recovery, and decision clearance zones | Blocking footprints intersecting a route zone are flagged |
| Modular-piece gaps | Modular pieces expose authored start/end points and order | Joins outside tolerance fail validation |
| Duplicate rail artwork | Asset/role overlap checks detect doubled visual and gameplay geometry | Strong same-asset overlaps are flagged |
| Depth-sorting problems | Deterministic depth keys use map coordinates, z, layer, and bias | Elevated depth ties are flagged |
| Clipping behind terrain | Elevated geometry can define foreground/background depth slices | Raised ledges/buildings without slices are flagged |
| High route vs underpass | Collision footprints, navigation layers, and traversal entry carry independent height ranges/tolerances | Screen overlap alone never implies collision or rail capture |
| Incorrect support heights | Render z and authored support z are separate | Mismatched support height fails validation |
| Generated art inventing gameplay | Assets carry `collisionPolicy: authored-only` | Any generated collision policy fails validation |
| Tile seams and repetition | Generated tiles are edge-sealed; signature assets carry sparse-density metadata | Non-seamless tiles and dense signature use are flagged |
| Objects inside buildings | Architectural and object footprints are checked at matching z ranges | Solid overlaps are flagged |
| Insufficient route clearance | Route-phase zones are authored and visible in debug mode | Blocked phases are flagged |
| Dead spaces | Interaction/socket density and route gaps are measured | Long route gaps appear in the quality report |
| Implicit rail snapping | Named sockets require an explicit fresh input | Any socket without `requiresFreshPress` fails validation |
| Edge culling | Visual bounds and culling padding are independent from placement points | Oversized art without padding is flagged |
| HUD obscures landmarks | Maps carry camera-safe HUD margins and landmark checks | Important objects inside unsafe framing are flagged |
| Visual mismatch | Assets carry palette, quality tier, scale, and role metadata | AI scoring reports cohesion regressions |
| Package growth | Embedded asset bytes are measured against a project budget | Budget overruns are flagged before export |
| Generated-file drift | Authoring revision and generated-from revision are recorded | Generated artifacts and stale builds fail validation |
| Unproven route topology | Layered navigation nodes and weighted/one-way links support deterministic A* tests | Missing endpoints/layers, blocked links, ambiguous heights, and failed saved routes are reported |
| Imported route drift | Path Editor v2 percentage coordinates convert once into authored map bounds | IDs, destinations, costs, direction, areas, and layers must survive import |
| Imported map/art claiming geometry | Tiled and Aseprite enter through source-bound preview/apply | Preserve existing collision byte-for-byte; object layers, tileset collision, filenames, and pixels remain advisory |
| False round-trip claims | Retain exact source text, SHA-256, projection digest, and target freshness | Export is byte-identical only while current; after edits it is an explicitly requested stale original, never a regenerated-current claim |

## Required spatial model

- Projection: `orthographic` or exact `dimetric-2:1`, with one reversible adapter used by edit, hit-test, preview, export, and headless automation.
- Dimetric tile slot: 128×64 pixels; default authored scale is 128 world units per tile with an explicit elevation step and camera origin.
- Object placement: world x/y, elevation z, ground-contact anchor, visual bounds, authored footprint, support height, depth layer/bias, and culling padding.
- Collision: authored-only box/path with zMin/zMax; never inferred from generated pixels.
- World continuity: maps, portals, target spawns, route clearances, modular endpoints, and depth slices.
- Navigation: stable layered nodes, weighted and optionally one-way links, unique destination IDs, walkable/blocked polygons, elevation ranges, and deterministic A* route tests.
- Traversal: authored rail/grind geometry remains separate from navigation and artwork; every path has its own route layer and entry-z tolerance.
- Interaction: stable socket IDs, action name, position/elevation, and `requiresFreshPress: true`.
- Assets: stable manifest ID, frame geometry, shared anchor, alpha bounds, palette/style metadata, seamless flag, density policy, and byte size.

## AI iteration contract

An iteration is accepted only when:

1. the project schema remains valid;
2. spatial validation has no new errors;
3. collision remains authored-only;
4. linked maps and target spawns resolve;
5. required navigation routes resolve without crossing blocked ground or merging high/low layers;
6. the objective quality score does not regress;
7. the authoring source is checkpointed before generated HTML/JSON is written.
