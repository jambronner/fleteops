# Recovery and eventual decommission

Publishing reusable source does not retire a running deployment or authorize deletion. This checklist is for an owner-approved maintenance window after a recovery path has been tested. Keep customer recovery material separate from the public code repository.

## Gate 1: ownership and retention decision

Before exporting or retaining customer records, establish who owns them, who may access them, the permitted purpose and the retention/deletion date. Confirm contractual restrictions, required notices, legal holds and whether a later restart may use the retained data. Record a named archive custodian and a separate key custodian. Decide whether to retain live provider sessions or instead reconnect with fresh credentials on restoration. Do not assume that an encrypted backup is authorized merely because it is private.

A minimal recovery archive normally includes a private source snapshot and commit, dependency lockfiles, schema/migration version, deployment manifests, exact image digests, encrypted database export, object/file inventory and checksums, and a configuration-name inventory. Keep actual secrets in a protected secret store or separately encrypted archive. Store raw customer material, session volumes, message/media exports, logs and backups **outside Git**, with access controls and a documented expiry. Review encryption/decryption and custody before relying on the archive.

## Gate 2: complete inventory and consistent backup

Inventory all environments and external persistence, including:

- App containers/images, database roles and databases, local volumes, S3-compatible buckets, replicas, point-in-time recovery and provider snapshots.
- Evolution API containers, its separate database/cache volumes and paired-device/session state; record its exact image digest and configuration version.
- Routes, DNS, TLS certificates, reverse proxies, webhook registrations, email routing/Workers, background jobs and external schedules.
- Identity users/sessions, OAuth applications, secrets, machine accounts, CI artifacts, container registry images, build caches and logging sinks.

Plan a consistent backup cut across relational metadata and referenced document objects. If writes must be paused, obtain explicit approval for that operational change. Validate row/table counts, export integrity, object checksums and cross-references without placing records or values in public reports. Preserve a restore manifest listing what is included and omitted. A database dump alone does not preserve attachments, identity or messaging sessions.

## Gate 3: isolated restoration drill

Restore into an isolated environment with no production domains, incoming webhooks, schedules or outbound messaging. Verify decryptability, database/schema compatibility, document retrieval, tenant/membership mappings and key recovery. Use mock/test providers for login, messages, extraction and email. Check version compatibility before replacing images. Record elapsed restore time, failures and the required manual steps.

Only a completed drill establishes a usable restart path. If retaining a provider session is inappropriate or unsupported, document re-pairing/re-authorization instead of silently restoring it. Treat restored old secrets as sensitive; rotate or replace them according to the approved plan before reconnecting real providers.

## Gate 4: approved shutdown window

Obtain separate approval for routing/network changes and service shutdown. Agree a rollback deadline and success criteria. Then use this order, adapted to the actual deployment:

1. Stop new ingress at approved sources: schedules, provider webhooks, email routes and external job triggers. Preserve a record of registrations so they can be restored.
2. Drain or safely pause queued/in-flight work. Verify that retry behavior will not duplicate messages or decisions after restart.
3. Take the final consistent backup/checkpoint and verify it. Reconcile it with the tested restore manifest.
4. Disable outgoing delivery and revoke live sessions/tokens only as explicitly approved. Sequence revocation so the final backup and recovery test remain possible.
5. Remove app routing and stop the selected containers/services. Preserve required images and volumes through the rollback period. Do not stop a shared database, gateway, cache or proxy used by another application.
6. Monitor for missed inbound events and unexpected scheduled traffic. Keep the rollback instructions accessible to the owner.

Shutdown is reversible only while required data, images and dependencies remain available. Do not combine stopping services with deleting volumes.

## Gate 5: later destruction

After the retention deadline, successful archive verification, elapsed rollback window and explicit destruction approval, remove only the named resources. Include provider replicas/snapshots, object versions, logs, registry artifacts and CI backups in the deletion inventory; vendor retention may differ. Revoke remaining unused credentials and webhook registrations under a separate approved credential plan. Keep a deletion receipt identifying resource categories and outcomes, without customer records or secret values.

## Restart sequence

Confirm current rights to use the archive and the customer's desired scope. Restore reviewed source/images, database and object storage into isolation. Configure identity and tenant memberships, new secrets and required scan/extraction services. Test with synthetic traffic, then obtain approval to reconnect domains, webhooks, sessions, outgoing delivery and schedules in that order. Monitor the first real events for duplicates and authorization failures. A public repository provides code; this private restoration process supplies the authorized operational state.
