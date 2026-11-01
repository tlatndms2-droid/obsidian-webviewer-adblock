# 0.1.0 validation — 2026-11-02 (KST)

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
