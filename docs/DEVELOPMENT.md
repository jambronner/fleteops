# Development and smoke checks

Start with [Quickstart](../README.md#quickstart). Node 22.23.4 is the pinned development baseline; `package-lock.json` records exact dependency resolutions. Use `npm ci` for repeatable installs. Dependency upgrades should be reviewed and retested together with the lockfile.

## Source map

| Path | Responsibility |
| --- | --- |
| `src/app/demo/`, `src/lib/demo/` | Browser demo, synthetic fixtures, localized labels and state transitions |
| `src/lib/reconciliation/` | Shipment requirements, quantity/invoice exceptions, readiness evaluation |
| `src/lib/imports/` | Connected spreadsheet parsing, preview and draft validation |
| `src/lib/auth/`, `src/lib/supabase/`, `src/lib/workspaces/` | Identity, sessions, memberships and permissions |
| `src/lib/db/schema/`, `drizzle/` | Application schema and SQL migrations |
| `src/lib/documents/`, `src/lib/storage/` | Document policy, provenance, providers and file access |
| `src/lib/evolution/`, `src/lib/whatsapp/`, `src/lib/email/` | Provider payload normalization and source trust |
| `src/app/api/`, `src/inngest/` | HTTP boundaries and optional background jobs |
| `src/lib/runtime-mode.ts`, `src/lib/env.ts`, `src/proxy.ts` | Demo/connected boundary and configuration |

## Local checks

```sh
npm run typecheck
npm run lint
npm test
npm run privacy:check
npm run build
npx playwright install chromium
npm run test:demo
```

Playwright's browser installation downloads a test browser; no cloud testing account is required. The demo must stay credential-free in tests. Connected integration checks require a separate disposable environment and are not implied by a passing demo suite.

## Manual demo smoke test

- Open `/demo` without `.env` or credentials. All initial records must visibly be fictional.
- Check English and Spanish labels, validation messages, source statuses and activity entries.
- On the missing-evidence route, approval must be unavailable. A simulated receipt must create a proposal without changing the recorded facts. Accepting it must update the route; the readiness decision is a separate action.
- Try unclaimed and blocked sources. Intake must be held, with no route mutation. Approving a source should allow a later simulated receipt.
- Import the supplied CSV; reject duplicates, invalid references, invalid quantities and over-limit input without a partial import.
- Place a route on hold, approve an eligible route, and inspect activity. No payment should be attempted.
- Reset and reload. Both must restore initial fixtures; no customer data, messages, sessions or credentials should persist.
- Check desktop and narrow mobile layouts, keyboard navigation, dialog focus and visible validation.
- Inspect browser network activity: no external service requests, analytics, remote fonts or messaging endpoints. Connected API requests must fail in demo mode.

## Reviewing a release

Review a clean export, including ignored/build outputs that might accidentally be packaged. Scan filenames and contents for secrets, customer identifiers, internal endpoints, session artifacts and binary metadata. Inspect fixtures, screenshots, documents, Git refs/history and CI artifacts separately. New synthetic examples are preferable to masking existing customer records.

Run an install/build/test from a clean directory with no inherited credentials. Check dependency advisories, license changes and included notices for the exact lockfile. Scan the exact committed tree after fixes, then obtain independent privacy/security review before publishing it. Do not make an existing private history public as a shortcut.

Contribution guidance is in [CONTRIBUTING.md](../CONTRIBUTING.md); deployment and restoration gates are in [RECOVERY.md](RECOVERY.md).

## Dependency and connected-source maintenance notes

The release updates the inherited framework and parsing packages to patched versions. `package.json` pins direct versions and includes narrow overrides for Inngest's `zod/v3` compatibility import (provided by the patched Zod package) Drizzle's development-only esbuild loader, and the test loader's unaffected esbuild version. Inngest's optional telemetry dependencies are kept on the compatible OpenTelemetry 2.x instrumentation line (auto-instrumentations 0.81.0, API 1.9.1), rather than combining its 2.x SDK with OpenTelemetry 3.x. Recheck those overrides against upstream releases; do not apply `npm audit fix --force` without reviewing the API changes.

Some retained connected editing components intentionally synchronize local drafts when server-provided records refresh. Fourteen localized `react-hooks/set-state-in-effect` exceptions document that behavior; other hook rules remain enabled. Refactor and interaction-test those connected surfaces before a production rollout. The new synthetic demo has no such exceptions.
