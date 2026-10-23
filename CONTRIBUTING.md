# Contributing

Use the [demo quickstart](README.md#quickstart), then run the checks in [DEVELOPMENT.md](docs/DEVELOPMENT.md). Keep a change focused on one behavior and explain the user-visible problem, the change and the validation in its pull request.

Use entirely synthetic fixtures. Never attach customer screenshots, invoices, message exports, phone numbers, sessions, API keys, database dumps or production configuration to an issue or pull request. Use reserved example domains and fictional `DEMO-` identifiers. Redaction does not make an original customer artifact suitable for a test fixture.

Preserve the default demo boundary: no account setup, real provider calls or persistence. New connected adapters must require explicit configuration and retain source trust, tenant authorization, evidence review and audit behavior. Update both English and Spanish labels when changing the demo interface, and add tests for meaningful behavior or authorization changes.

Include dependency lockfile changes with dependency updates. Review upstream licenses and security advisories, and retain attribution. Original contributions should be code you have the right to contribute under this repository's MIT license; third-party code retains its own terms and notices. Do not import a private repository's history.

Report security-sensitive issues through [SECURITY.md](SECURITY.md), rather than disclosing exploit details or secrets in a public issue.
