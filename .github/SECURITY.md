# Security policy

LoopLab is an active-development, Windows-first local authoring tool. Only the current `main` branch receives security fixes.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/PandaCatz/Panda-s-HTMl-2D-2.5D-Game-Builder/security/advisories/new). Do not open a public issue for a suspected credential leak, command-execution path, authentication bypass, path traversal, request-forgery path, malicious project import, or exported-HTML sandbox escape.

If a real credential may have been exposed, revoke it with its provider before writing the report. Never paste a live API key, CLI session, companion session token, private project, or personal information into an issue or test case. Use a minimal synthetic fixture.

Please include the affected commit, Windows and Node versions, the smallest safe reproduction, expected impact, and whether the issue is reachable from loopback only or from a deployed build.

## Security boundaries

- The editor and companion bind to `127.0.0.1`; mutation endpoints require a per-launch session token.
- OpenAI and Anthropic keys remain in the companion environment or the Windows current-user DPAPI vault. They do not belong in project JSON, browser storage, prompts, logs, receipts, or exported games.
- Codex CLI, OpenAI API, Claude Code CLI, and Anthropic API are independent paths. Failure or authentication state on one path must not weaken another path's checks.
- Imported projects, provider output, generated art, and local-model advice are untrusted input. They pass through strict schemas, canonical commands, source-digest preconditions, and independent verification before promotion.
- Strict one-file game exports are expected to run offline with no provider, companion, CDN, module loader, analytics, or external asset request.
- The repository's key-shaped test strings are deliberately synthetic and carry explicit test markers. The publish audit never prints a suspected secret value.

## Public dependency posture

CI rejects high-severity production dependency advisories, runs the publish-set audit, and uses immutable commit SHAs for GitHub Actions. CodeQL and Dependabot provide additional public-repository coverage. Development-only advisories with no upstream patch are documented honestly and mitigated by removing or disabling the affected feature surface rather than claiming a clean audit.
