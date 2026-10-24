# Third-party notices and distribution scope

The [MIT license](LICENSE) covers original FleteOps code. It does not replace third-party copyright, license, attribution, source-availability or service requirements. This source repository does not include a running Evolution API server, customer database, private deployment configuration or container image.

[Locked dependency inventory](docs/DEPENDENCIES.md) lists package versions and declared licenses. [Collected license texts](THIRD_PARTY_LICENSES.txt) preserve installed packages' notices verbatim. Run `npm run notices:generate` after a clean install when changing the lockfile. The package manager installs dependencies under their upstream terms. Optional native packages differ by target; a source inventory is not sufficient clearance for distributing an image or binary.

## Evolution API

The connected adapter calls Evolution API over HTTP; its server and frontend are separately obtained and operated. The integration reference is **2.3.7**, whose [official LICENSE](https://raw.githubusercontent.com/evolution-foundation/evolution-api/2.3.7/LICENSE) combines Apache 2.0 with additional administrator-visible usage notification and frontend branding conditions. Preserve that exact version's terms and clarify frontend obligations before distributing a modified or combined UI. Do not describe the complete service bundle as MIT or plain Apache 2.0.

Choose and pin an independently reviewed service version/image digest for your deployment. Later releases may add activation and operational requirements; this repository does not accept them for you or recommend an upgrade simply for license clarity. Evolution/Baileys and the official WhatsApp Business Platform are separate paths, each with its own terms. No endorsement or trademark rights are granted.

## Notable dependency obligations

- Most JavaScript dependencies use MIT, ISC, BSD or Apache 2.0 licenses. Keep applicable copyright/license notices; Apache NOTICE files and modification notices also matter where required.
- SheetJS CE **0.20.3** is obtained from its [official CDN installation path](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), with an integrity-pinned lockfile. The older npm-registry `xlsx` version is not used. SheetJS CE's Apache 2.0 license is preserved; no paid SheetJS edition is included.
- `lightningcss`, its platform packages, and `axe-core` use MPL 2.0. Modified covered files and redistribution have file-level source obligations; the FleteOps MIT license does not remove them.
- Sharp/libvips platform dependencies include LGPL 3.0-or-later components and combined Apache/LGPL notices. When distributing native libraries or images, retain notices and satisfy applicable corresponding-source and relinking/replacement obligations for the actual artifacts. This repository publishes source and a dependency lockfile, not those binaries.
- `caniuse-lite` data is CC BY 4.0; retain the attribution/license information accompanying it. Other small dependencies declare BlueOak, Python, CC0, Unlicense and other terms recorded in the inventory.
- Supabase, PostgreSQL, object storage, email, AI providers, Inngest, Docling and any malware gateway are separately operated services/software. Check their chosen versions, licenses, account terms, data-processing obligations and costs before enabling them. The credential-free demo requires none of them.

## Brand artwork

`public/logo.svg` and `public/logo-white.svg` contain the "FleteOps" wordmark as glyph outlines made with Inter Display Bold Italic 4.001, Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter), licensed under the [SIL Open Font License 1.1](https://openfontlicense.org). No font files are included.

The inventory is a maintenance aid, not a legal opinion. Recheck upstream licensing and advisories for each release and any changed distribution form. Original author attribution is retained through the Jamaur Bronner and FleteOps contributors copyright; no customer name or endorsement is implied.
