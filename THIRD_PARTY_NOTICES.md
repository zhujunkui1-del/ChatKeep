# Third-party components and provenance

## WeFlow 5.0.0 reference and native artifacts

The native ABI declarations were referenced from WeFlow 5.0.0 (`electron/services/keyService.ts` and `wcdbCore.ts`). Upstream: https://github.com/hicccc77/WeFlow . Attribution: cc / WeFlow contributors. Complete supplied repository license: `licenses/WeFlow-LICENSE.txt` (CC BY-NC-SA 4.0).

Local native artifacts are unmodified copies supplied for local verification. Repository licensing does not establish the redistribution rights of every bundled binary. Binary permissions and provenance require separate confirmation before public releases or commercial distribution. Native initialization checks are not patched or bypassed.

## Database-format references

The SQLCipher v4 layout was cross-checked against the supplied MemoTrace / WeChatMsg `wxManager/decrypt/decrypt_v4.py`, and message schema against `wxManager/db_v4/message.py`, contact schema against `contact.py`. Upstream: https://github.com/LC044/WeChatMsg . The local reader was implemented in JavaScript using Node.js crypto and SQLite WASM; the original Python modules are not bundled. This provenance must remain documented for any later licensing review.

## Runtime and packages

- Electron 43.0.0: Electron and bundled Chromium notices are retained in the complete application distribution (`LICENSE.electron.txt`, `LICENSES.chromium.html`).
- electron-builder 26.15.3: build-time dependency, with its package license retained.
- Koffi 3.1.0 and its platform prebuild: package license retained in the distribution.
- sql.js 1.13.0 / SQLite WASM and fzstd 0.1.1: package licenses remain applicable.
- Microsoft runtime DLLs and SDL2: third-party artifacts with their own distribution requirements; these are not covered by the application's own licensing status.

Changing product branding must never remove required third-party attribution or license files. Project-owned code currently has no selected open-source license (`UNLICENSED`); this does not override any third-party license.
