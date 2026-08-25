# LAN Dashboard with Pairing + HTTPS - Iterations

## Iteration 1 - 2026-08-24
- Files changed: electron/main/server/tls.ts, electron/main/server/auth.ts, electron/main/server/session.ts, electron/main/server/static-files.ts, electron/main/server/http-server.ts, electron/main/server/index.ts, electron/main/ipc/lan-handlers.ts, electron/main/ipc/index.ts, electron/preload/index.ts, electron/preload/types.d.ts, electron/main/index.ts, tests/server/*.test.ts
- Summary: Initial implementation of LAN server with TLS cert generation, pairing token auth, session cookies, static file serving, and HTTPS. 83 tests pass.
- Tests: PASS

## Iteration 2 - 2026-08-24
- Files changed: electron/main/server/auth.ts, electron/main/server/http-server.ts, electron/main/server/index.ts, electron/main/db/migrations/004-token-attempts.sql, electron/main/db/migrations/005-add-token-plaintext.sql
- Summary: Fixed 3 spec compliance issues: rate limiting now tracks failed attempts per IP, pairing endpoint supports query param auth, getToken() returns actual stored token.
- Tests: PASS

## Iteration 3 - 2026-08-24
- Files changed: electron/main/server/auth.ts, electron/main/server/index.ts, electron/main/db/index.ts, electron/main/db/migrations/006-remove-token-plaintext.sql, tests/server/auth.test.ts
- Summary: Security fix - moved plaintext token to in-memory storage instead of database (SEC-LAN-003). Token hash+salt stored in DB, plaintext in module-level variable only.
- Tests: PASS
