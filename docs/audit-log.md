# Audit Log

## 2026-06-03 02:14 +08:00 — realtime chat stream isolation

- Scope: `src/pages/chat.js` realtime chat event handling.
- Priority: realtime chat session UI freshness, streaming completeness, and event isolation.
- Finding: active chat streaming already preserved incremental chunks, but `delta`/`final` event handling still accepted events from a different active `runId` once a stream bubble existed.
- Risk: stale run events could append to or finalize the visible active reply, causing cross-run contamination, duplicated/incorrect rendering, or a current stream being overwritten.
- Fix: guard `delta` and `final` handling with `_currentRunId`/`runId` checks; use the normalized local `runId` when starting/updating the active stream status.
- Validation: `git diff --check`; `npm run build`.
- Rust touched: no.
