# FleteOps

**Bilingual logistics reconciliation software for shipment evidence and operator review.** Originally built for Latin America, FleteOps brings route records, delivery evidence, quantity discrepancies and approval decisions into one workspace.

[Website](https://fleteops.com) · [Español](docs/README.es.md) · [Architecture](docs/ARCHITECTURE.md) · [Connected setup](docs/CONNECTED-SETUP.md) · [Configuration](docs/CONFIGURATION.md)

The default application is a runnable **synthetic demo** in English and Spanish. It needs no account, database, API key or messaging session. Its state lives in browser memory and resets on reload. The repository also contains the reusable connected application source; setting up that application requires your own infrastructure and additional integration work.

## Quickstart

Use Node.js **22.23.4** (see [.nvmrc](.nvmrc)) and npm. From this repository's directory:

```sh
nvm use
npm ci
npm run build
npm start
```

If you do not use nvm, install the Node version in `.nvmrc` with your preferred version manager. Open **http://127.0.0.1:3000/demo**. For development, use `npm run dev` instead of the build/start commands. The supplied scripts bind to the local machine.

No `.env` file is needed. Unset `FLETEOPS_MODE`, or set it to `demo`. Only the exact value `connected` enables connected application behavior. Do not use a production environment file for this quickstart.

## Try the workflow

1. Select `DEMO-001`: it is missing delivery evidence, so readiness approval is disabled.
2. Choose the approved demo source and **Simulate receipt**. The route stays unchanged until you **Accept demo evidence**.
3. Review the evidence requirements, then **Approve readiness** or **Place on hold**. These actions never execute a payment.
4. Try an unclaimed or blocked source. Its intake is held without changing route data. Source approval is available in **Sources**.
5. Use **Import demo CSV** to add the supplied fictional rows. Duplicate references or invalid rows reject the whole import.
6. Review **Activity**, switch between English and Español, or **Reset demo**.

The demo accepts only `DEMO-` references and positive whole quantities, with up to 25 rows per import and 50 routes. Use invented data only. It does not upload files, send messages, call an AI service, save documents or persist a database. The receipt is deterministic sample evidence, not an extraction result.

## What's included

| Area | Runnable demo | Connected source |
| --- | --- | --- |
| Route review | Three fictional initial cases, CSV import, evidence requirements, quantity mismatch, approve/hold | Tenant-scoped route records, spreadsheet previews, partners and rate cards |
| Evidence | Simulated receipt and explicit operator acceptance | Document intake, object storage, extraction provenance and review tasks |
| Messaging | Approved, unclaimed and blocked synthetic sources | Evolution API and official WhatsApp webhook adapters; email ingress adapters |
| Language | English and Spanish (`es-MX`) controls and statuses | Existing English/Spanish application dictionaries |
| Identity and persistence | No login; browser memory only | Supabase identity, application memberships and PostgreSQL |

Connected adapters are included for developers to inspect and extend. They are not exercised by the demo, and this release is not a production certification. See [limitations and setup gates](docs/CONNECTED-SETUP.md).

## Development

```sh
npm run typecheck
npm run lint
npm test
npm run privacy:check
npm run build
```

Browser smoke tests use Playwright:

```sh
npx playwright install chromium
npm run test:demo
```

See [development and smoke checks](docs/DEVELOPMENT.md) for the source map and test scope. No database migration is needed for the demo.

## License and services

Original FleteOps code is available under the [MIT License](LICENSE), allowing commercial use with its notice requirements. Dependencies and separately operated services retain their own licenses; MIT does not relicense them. See [third-party notices](THIRD_PARTY_NOTICES.md).

**Evolution API is an optional, separately configured HTTP service.** The reviewed integration reference is version 2.3.7. Its [license](https://raw.githubusercontent.com/evolution-foundation/evolution-api/2.3.7/LICENSE) adds administrator-visible usage notification and conditions for its frontend branding to Apache 2.0. Preserve those conditions when you use it. FleteOps does not bundle an Evolution server or its frontend. Evolution/Baileys sessions and the official WhatsApp Business Platform are different integration paths; this project claims no endorsement by either provider.

Read [contributing](CONTRIBUTING.md), [security](SECURITY.md) and the [recovery/decommission checklist](docs/RECOVERY.md) before adapting the connected application for real operations.
