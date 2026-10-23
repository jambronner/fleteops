# Configuration and credentials

**The demo requires none of the credentials below.** It defaults to browser-memory fixtures; connected routes are disabled and the environment adapter ignores integration configuration. Keep real values outside Git. The checked-in `.env.example` contains only safe demo settings.

The definitive names/defaults are in [`src/lib/env.ts`](../src/lib/env.ts). Set `FLETEOPS_MODE=connected` deliberately for connected development. Use your own test accounts, isolated database and private bucket; never reuse a customer's production environment for a demo. Variables beginning `NEXT_PUBLIC_` can be exposed in browser bundles. Secret keys must remain server-only.

## Credential matrix

| Names | Purpose / when needed | Where to obtain or create |
| --- | --- | --- |
| `DATABASE_URL` | Application PostgreSQL connection | Your PostgreSQL administrator or database provider's connection settings; use a scoped application role |
| `DATABASE_MIGRATION_URL` | Optional separate connection/role for migrations | Same database administrator; authorize only the selected target |
| `AUTH_SECRET` | Local session signing; independent per environment | Generate a strong random server-side secret in your secret manager |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project URL and browser-safe client key for identity | Your Supabase project's API settings; pair with `AUTH_PROVIDER=supabase` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only administrative identity/invitation operations | Your Supabase project's API settings; never a browser variable |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Optional Google login configuration | Your own Google OAuth client configuration and matching Supabase provider setup; not needed for the demo |
| `EVOLUTION_API_BASE_URL`, `EVOLUTION_API_KEY` | Access your separately operated Evolution HTTP API | Your Evolution deployment administrator; use the reviewed service's configuration |
| `EVOLUTION_WEBHOOK_SECRET` | Authenticate Evolution callbacks | Generate an independent random shared secret; configure it in the sender and FleteOps |
| `WHATSAPP_VERIFY_TOKEN` | Verification handshake for the official WhatsApp webhook path | Generate a verification token and configure the same token in your Meta app |
| `WHATSAPP_APP_SECRET` | Validate official WhatsApp webhook signatures | Your Meta app settings |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Official WhatsApp API/media access and number identity | Your own WhatsApp Business Platform app/number setup |
| `EMAIL_INGEST_WEBHOOK_SECRET` | Authenticate the raw-email forwarding bridge | Generate a secret shared only by your forwarding bridge and FleteOps; see [the signed contract](CONNECTED-SETUP.md#messaging-and-email) |
| `MAILERSEND_WEBHOOK_SECRET` | Authenticate the alternative MailerSend receiver | Your MailerSend webhook configuration |
| `RESEND_API_KEY` | Optional outbound application email | Your Resend project's API-key settings; use a test/scoped sender first |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Private object read/write credentials | Your S3-compatible storage provider, including R2; scope to your bucket |
| `ASSET_SIGNING_SECRET` | Sign application asset links | Generate a separate random server-side secret |
| `DOCLING_BASE_URL`, `DOCLING_API_KEY` | Optional document parsing/OCR service and its authentication | Administrator of your own compatible Docling service; key requirement depends on its deployment |
| `OPENROUTER_API_KEY` | Optional intake classification and vision extraction | Your OpenRouter account's key settings; review data sharing and spending controls before enabling |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Optional event delivery and job request verification | Your Inngest environment's configuration; use an isolated development environment |
| `SHARED_SERVICES_GATEWAY_URL`, `SHARED_SERVICES_SCAN_TOKEN` | Connect the malware scan gateway | Administrator of a gateway matching `src/lib/shared-services/scan.ts`; the gateway implementation is not bundled |
| `CRON_SECRET` | Authorize digest executions | Generate a dedicated secret and configure your external scheduler |

The environment schema also contains `MAILERSEND_API_KEY` and `OPENAI_API_KEY`, `OPENAI_MODEL_EXTRACTION`, `OPENAI_MODEL_SUMMARY`. These are reserved/unwired in this snapshot; do not treat them as required or obtain them for the demo. The `clerk` authentication enum value is not a complete integration.

## Non-secret settings

| Names | Behavior |
| --- | --- |
| `FLETEOPS_MODE` | Unset or `demo`: synthetic demo. Exact `connected`: opt in to connected behavior. Use consistently at build and runtime. |
| `NEXT_PUBLIC_APP_URL` | Your application origin for links/auth. Default localhost URL. Set your own HTTPS origin for a connected deployment. |
| `NEXT_PUBLIC_MARKETING_URL` | Optional public marketing origin, under your control. |
| `AUTH_PROVIDER` | Use `supabase` for connected production planning. Default `local` is for isolated development. |
| `ALLOW_LOCAL_AUTH_IN_PRODUCTION` | Explicit override of the local-auth production guard; leave unset/false for normal deployment. |
| `SESSION_MAX_AGE_DAYS` | Session duration; default 14. Review retention and revocation separately. |
| `DEFAULT_LOCALE`, `DEFAULT_TIMEZONE` | Connected defaults: `es-MX` and `America/Mexico_City`. The demo has its own English/Spanish selector. |
| `DATABASE_POOL_MAX` | Application pool limit; default 5. Size it for the database and deployment. |
| `STORAGE_DRIVER`, `LOCAL_STORAGE_ROOT` | `local` defaults to `.storage`; `s3` selects the S3-compatible adapter. A persistent volume is needed if local files must survive replacement. |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` | Your private bucket and provider-specific region/endpoint. The adapter permits `auto` region when none is configured. |
| `EMAIL_FROM` | Outbound sender you own and have verified with Resend. The library's default onboarding sender is not a production setup. |
| `OPENROUTER_MODEL_VISION` | Model selected for OpenRouter vision/classification; review provider availability and terms before use. |
| `SHARED_SERVICES_SCAN_REQUIRED` | Default false. Set `true` with a configured gateway before accepting untrusted connected uploads. |
| `DOCUMENT_MAX_FILE_SIZE_MB`, `TENANT_STORAGE_QUOTA_MB` | Defaults 25 MB per document and 1,024 MB per tenant storage quota. |
| `EMAIL_MAX_ATTACHMENTS_PER_MESSAGE`, `EMAIL_MAX_ATTACHMENT_TOTAL_MB` | Defaults 10 attachments and 50 MB total per message. |
| `IMPORT_MAX_FILE_SIZE_MB` | Connected import limit, default 12 MB; distinct from the browser demo's small text-only CSV limits. |

## Storage and secret handling

Use the database only for application records and metadata; use private object storage or a protected local volume for document bytes. Keep provider auth state, customer exports, snapshots, logs and recovery archives outside the source repository. Encrypt recovery exports and keep their keys separately under named custodianship.

For a public code release, replacing a secret in the latest file is insufficient if it appeared in previous Git history, build artifacts, logs or releases. Assess its exposure, rotate/revoke it under an approved operational plan, and inspect retained copies. A new clean repository does not undo an earlier exposure. Never print secret values in diagnostics or issue reports.
