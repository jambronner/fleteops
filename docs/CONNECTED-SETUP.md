# Connected application setup

The [demo quickstart](../README.md#quickstart) is the supported starting point. Connected mode exposes the reusable application and integration source, and requires operator-owned infrastructure. It has no turnkey provisioning script, managed service, production deployment pipeline or customer seed database.

## Prepare an isolated development environment

1. Start from a fresh checkout and a disposable PostgreSQL database. Use credentials scoped only to that database. Configure `DATABASE_URL`; use `DATABASE_MIGRATION_URL` if migrations need a separate direct connection or role. The application uses `postgres` with Drizzle and is compatible with PostgreSQL connection strings, including Neon-provided connections.
2. Choose your own application origin and set `NEXT_PUBLIC_APP_URL`. Keep initial testing on localhost. For a connected build and runtime, explicitly set `FLETEOPS_MODE=connected`; otherwise the demo remains active. Next.js public variables may be embedded at build time, so rebuild when changing public auth/origin configuration.
3. Review every SQL migration under `drizzle/` against the disposable database before running it. `npm run db:migrate` requires explicit connected mode. Migration generation (`npm run db:generate`) also requires it. A successful migration creates schema, not a usable operator account.
4. Configure Supabase identity using the [credential matrix](CONFIGURATION.md). Configure the identity provider's allowed application URLs and callback routes (`/auth/callback` and `/auth/confirm`) for your own environment. Use `AUTH_PROVIDER=supabase` for connected production planning. `clerk` is a schema option, but this snapshot does not include a working Clerk integration. Local auth is for isolated development and is guarded in production.
5. Provision the first application workspace and administrator membership deliberately. The relevant tables are `tenants`, `users` and `tenant_memberships` in [the platform schema](../src/lib/db/schema/platform.ts). A Supabase user alone is insufficient: its provider/subject must map to an active application user with an active membership. The workspace creation API itself requires an existing authorized administrator. This repository does not yet supply a first-admin bootstrap utility. Review this provisioning step as code before using it; never import a previous operator's identities or memberships into a new deployment.
6. Choose local development storage or a private S3-compatible bucket. R2 uses the S3 adapter with an endpoint and appropriately scoped bucket credentials. Persist local storage explicitly if you choose it; an ephemeral container filesystem is not a backup. Set independent session and asset-signing secrets.
7. Before enabling untrusted uploads or attachments, supply a malware gateway implementing [the scan client contract](../src/lib/shared-services/scan.ts), and set `SHARED_SERVICES_SCAN_REQUIRED=true`. It sends raw bytes to `POST /v1/scan` with a bearer token. The gateway server is not included. Test rejection and unavailable-gateway behavior.
8. Add only the integrations you need, one at a time, with synthetic payloads and test identities. No credentials are required for the browser demo.

Do not expose connected mode to customers until identity provisioning, tenant isolation, permissions, storage access, abuse controls, backups and provider failure behavior have been tested in your deployment.

## Messaging and email

Evolution integration uses a separately operated API service; **2.3.7 is the reviewed reference**, not an instruction to upgrade an existing installation. Pin the service version and image digest you have reviewed, retain its notices, and check its exact license before distributing an image or frontend. Its additional usage-notification condition applies to backend usage too. The application includes administrator-facing configuration screens, but you must ensure your deployed documentation/settings satisfies the dependency's notice requirement.

Use `EVOLUTION_API_BASE_URL` and `EVOLUTION_API_KEY` for server-to-server requests, plus a distinct `EVOLUTION_WEBHOOK_SECRET` for `/api/webhooks/evolution`. Prefer the supported secret header over a URL query token, which can enter proxy logs. Establish only your own test connection, register its workspace/channel, and approve sources deliberately. A working webhook secret does not make every sender trusted. Evolution sessions based on Baileys are different from the official WhatsApp Business Platform adapter at `/api/webhooks/whatsapp`; choose and configure the intended path under the provider's terms.

The email-routing receiver `/api/webhooks/email-routing` expects a JSON envelope with `source: cloudflare_email_worker` and a `message` containing `inboxId` and raw RFC email text. The sender must add `x-fleteops-timestamp` and `x-fleteops-signature`: an HMAC-SHA256 of `timestamp + "." + raw JSON body`, using `EMAIL_INGEST_WEBHOOK_SECRET`. Timestamps must be within five minutes. See [normalization](../src/lib/email/email-routing.ts) and [signature verification](../src/lib/webhooks/signatures.ts). The forwarding Worker is not included; build and review it separately. A MailerSend receiver is also present with its own webhook-secret verification. Neither receiver creates a domain, mailbox, DNS record or route.

Outbound application email uses Resend when `RESEND_API_KEY` is set, with `EMAIL_FROM` configured to a sender you control. Supabase authentication email has its own provider configuration. Keep both delivery paths in test mode until recipients and domains are verified.

## Extraction, jobs and schedules

Docling and OpenRouter are optional services, enabled by the corresponding configuration. Some document types cannot be automatically extracted without their selected provider; manual review remains necessary. The `OPENAI_*` variables are reserved in the environment schema and are not a working OpenAI adapter in this snapshot. Do not obtain credentials merely to fill every listed variable.

Inngest event and signing keys enable optional background processing at `/api/inngest`; otherwise supported handlers run inline. Do not enable a job server without checking payload privacy, retry/idempotency behavior and signing verification. The repository does not provision an external job service.

Digest execution is protected by `CRON_SECRET`; schedule `/api/digests/run` only after reviewing the handler and testing intended recipients. No scheduler is created by installation. Keep schedules, outgoing delivery and webhook routing disabled during restoration or first deployment.

## Connected smoke-test gate

Use newly generated test tenants and synthetic messages/documents. Confirm two tenants cannot read or mutate each other's data; revoked users lose access; unclaimed/blocked sources cannot change route data; duplicate events are idempotent; invalid signatures fail; malware and oversized attachments are refused; private objects cannot be read without authorization; extraction outages produce reviewable failures; approve/hold actions enforce roles and leave audit entries. Test backup restoration into a separate environment before using real records. Record exact dependency versions and your service image digests with the test results.
