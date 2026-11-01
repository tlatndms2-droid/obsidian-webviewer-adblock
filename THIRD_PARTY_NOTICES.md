# Third-party notices

This project is independent of Stands, Ghostery, Obsidian, EasyList, and List-KR. No Stands code is included.

- Ghostery adblocker 2.20.3 and Ghostery packages: MPL-2.0, unmodified, bundled by esbuild. Copyright Ghostery GmbH and contributors. Source: https://github.com/ghostery/adblocker/tree/v2.20.3 (or version-matched release in the upstream repository). A copy of MPL-2.0 is in `filters/GHOSTERY-LICENSE`. Package versions and integrity hashes are in `package-lock.json`.
- EasyList and EasyPrivacy: https://easylist.to/; source https://github.com/easylist/easylist. Distributed here under GPLv3; see https://easylist.to/pages/licence.html. Original list headers and original list contents are retained in `filters/`.
- List-KR: https://github.com/List-KR/List-KR; GPLv3. Original downloaded uBlock Origin list is retained in `filters/list-kr.txt`. The engine applies supported network and CSS rules; this does not claim full uBlock Origin compatibility.
- tldts, tldts-core, tldts-experimental, @remusao dependencies, and other runtime dependencies retain their respective licenses in `THIRD_PARTY_LICENSES.txt`.

`src/generated/engine.json` is a serialized representation compiled from the three original lists by `scripts/prepare-filters.mjs`. This generated representation and the bundled JavaScript are accompanied by their corresponding source in this repository and the version ZIP.
