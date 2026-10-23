# Security

The default demo uses synthetic browser-memory state and disables connected integrations. Connected mode contains application and adapter source for developer evaluation. A passing demo build does not establish the security of a public, multi-tenant deployment.

Before enabling connected mode for real data, validate authentication, tenant authorization, session revocation, webhook verification, source approval, storage access, malware scanning, input limits, provider data handling and backups in your own environment. Keep local authentication restricted to isolated development. Never put server secrets in `NEXT_PUBLIC_` variables.

For a suspected vulnerability, use the repository's private vulnerability-reporting option in its **Security** tab if enabled. If it is unavailable, open a minimal issue asking the maintainer for a private reporting channel, without exploit details, credentials or customer data. No dedicated security mailbox or response-time guarantee is provided by this repository.

A useful private report includes the affected commit/dependency, an isolated synthetic reproduction, expected versus observed behavior and impact. Avoid testing against deployments you do not control. If credentials may have been exposed, notify their owner privately and plan rotation; editing a file or publishing a clean snapshot does not invalidate an exposed credential.

Only the current source state is intended for maintenance; there is no guaranteed long-term support window. Review the lockfile and upstream advisories before deploying, and pin separately operated service versions and image digests. Keep dependency license notices alongside redistributed code and images.
