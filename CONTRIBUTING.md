# Contributing to LoopLab

LoopLab accepts changes that make the create-preview-adjust-verify-export workflow more reliable for both people and headless agents. A feature is not complete merely because it appears in the UI: its project data, headless contract, validation, evidence, and one-file export behavior must agree.

## Development setup

Install:

- Node.js 22.13.0 or newer in the supported Node 22 line;
- npm;
- Python 3.10 or newer for the sprite-normalization utilities.

Create a reproducible checkout with:

```bash
npm ci
python -m pip install --requirement scripts/requirements.txt
```

Start the managed editor and local companion together:

```bash
npm run dev
```

Provider credentials are optional for local development and are never required by the verification suite. Tests that exercise provider lifecycles must use fixtures or the explicit `LOOPLAB_CODEX_CLI_ENTRY` and `LOOPLAB_CLAUDE_CLI_ENTRY` test entries; they must not submit paid generation requests.

## Source-of-truth rules

- Edit authoring source, not generated project JSON or exported HTML.
- Keep artwork, anchors, supports, collision, traversal, navigation, and depth as separate authored concerns.
- Generated art never becomes collision automatically.
- Preserve deterministic simulation and replay behavior unless the change deliberately updates a pinned fixture.
- Keep finished exports playable from one offline HTML file with no runtime server or CDN.
- Update `lib/looplab-agent-core.mjs` when the headless contract changes, then run `npm run manifest:generate`; do not hand-edit `public/agent-manifest.json`.
- Turn reusable failures into a validator, Project Doctor finding, harness assertion, or regression test.

## Verification

Run the same checks used by CI:

```bash
python scripts/normalize-dark-gray-sprite-strip.py --help
npm run public:audit
npm audit --omit=dev --audit-level=high
npm run lint
npm test
```

`npm test` runs build-independent tests, creates a production build, and then verifies the rendered application. GitHub Actions runs the supported Windows release gate, including DPAPI behavior and the browser-facing build.

For visual, interaction, or gameplay changes, also include the relevant browser playtest, screenshots, deterministic replay, acceptance result, or Project Doctor evidence. A score alone is not evidence, and a blocker cannot be averaged away.

## Pull requests

A focused pull request should explain:

1. the user or agent failure it prevents;
2. the source-of-truth layer that owns the fix;
3. how the change is reachable visually and headlessly, when applicable;
4. the exact commands and evidence used to verify it;
5. whether project schemas, protocol surfaces, exports, or migrations changed.

Do not include API keys, companion session tokens, provider output containing secrets, generated build directories, local `.openai/hosting.json` bindings, private agent handoffs, or unrelated project files. Run `npm run public:audit` before pushing. LoopLab does not yet declare a source-code license, so contributors should not assume permission to redistribute or relicense the repository.
