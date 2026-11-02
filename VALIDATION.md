# 0.1.1 validation — 2026-11-02 (KST)

- TypeScript, build, 15 focused tests passed. Includes real bundled-plugin response-stage handling, player-field pruning, stream/caption preservation, native Response.json handling for successive videos, site exclusions, cleanup, and protection against seeking content under stale ad CSS.
- Actual Obsidian 1.14.5 Sandbox: first YouTube playback and two same-document related-video transitions passed without a shield click. Tested sequence: `gVteZaQGry0 → XpLABrbvebg → gVteZaQGry0` (two distinct videos, three playbacks).
- Each playback advanced for more than six seconds, with zero active-ad samples. Initial player advertising fields were absent, and the document-start guard remained active across both SPA transitions. This verifies the tested sessions rather than all possible YouTube advertisements.
- Actual YouTube UI and Korean settings screenshots inspected. Content video and captions remained visible; player audio preferences are not changed by the guard.
- General regression path passed: ad script blocked, article script preserved, dynamic banners hidden, pending debounce survives same-document navigation, site exceptions and enable/disable toggles work, native Obsidian blocking setting unchanged, and no runtime exceptions in the general UI test.
- Full Sandbox process restart: 0.1.1 reloaded with enabled/cosmetic options and `example.net` exclusion preserved; the document-start guard was registered, initial ad fields were absent, and actual YouTube content resumed playing with no active ad marker.

## Prior 0.1.0 evidence

- Windows isolated vault: `WebviewerAdblockSandbox`; user's real vault unchanged.
- Final build: TypeScript check, esbuild build, five engine/domain/filter tests passed.
- Actual Obsidian 1.14.5 UI: production EasyList ad-script fixture blocked, article script preserved, CSS banner hidden, dynamically added banner hidden.
- Actual shield button: site exclusion saved and ad script/banner returned after reload; toggling again restored protection.
- Actual Korean settings: enable/disable switches and filter-update control visible. Enable/disable round trip passed without runtime exceptions.
- New tab's first navigation: ad script blocked on first load after waiting for the additional blocker connection.
- Filter updates: repeated replacement of an existing cache passed; existing Obsidian native blocking option remained enabled.
- Full sandbox restart: version 0.1.0 loaded, enabled/cosmetic settings and `example.net` exclusion persisted; updated filter cache loaded; fixture ad remained blocked and article remained usable.
- Naver News smoke check: content loaded and an additional request was blocked. This is a single-site observation, not a coverage claim.
- YouTube video ads and login/payment flows were not verified. No complete YouTube blocking claim is made.

The fixture server and runtime validation scripts are included for reproduction. `CDP_PORT` selects the current Sandbox endpoint (default 9367). Screenshots and detailed local runtime results are retained under ignored `artifacts/`.
