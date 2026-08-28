# Third-party software

Blayde Manual's own code is AGPL-3.0 (see `LICENSE`). It also uses the
following third-party libraries, listed here with their license and
how each one is loaded.

| Library | License | Loaded as | Source |
|---|---|---|---|
| [pdf.js](https://github.com/mozilla/pdfjs-dist) | Apache-2.0 | CDN (cdnjs), pinned version + Subresource Integrity hash | Mozilla |
| [@cantoo/pdf-lib](https://github.com/cantoo-scribe/pdf-lib) | MIT | CDN (unpkg), pinned version + Subresource Integrity hash | Cantoo, a maintained fork of [Hopding/pdf-lib](https://github.com/Hopding/pdf-lib) |
| [Tesseract.js](https://github.com/naptha/tesseract.js) | Apache-2.0 | CDN (unpkg), pinned version + Subresource Integrity hash | naptha |
| [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) | MIT | Vendored at `web/qrcode.js`, unmodified except for a header comment | Kazuhiko Arase |

Each MIT-licensed dependency's copyright notice is preserved: `web/qrcode.js`
carries its original header inline; the CDN-loaded libraries carry theirs
in their own distributed files, unmodified.

See `ROADMAP.md` for open supply-chain hardening items (version pinning,
Subresource Integrity) on the dependencies that don't have them yet.
