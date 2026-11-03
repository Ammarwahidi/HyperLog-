# Phase 0: Payload-First Security Specification (`security_spec.md`)

## 1. Master Data Invariants
1. **Default-Deny Catch-All**: Every path not explicitly matched under `/databases/{database}/documents` is unconditionally denied (`allow read, write: if false;`).
2. **Verified Identity Gate**: Every standard client write requires an authenticated user with `request.auth != null && request.auth.token.email_verified == true`.
3. **Path Variable Hardening**: Every single-document target (`get`, `create`, `update`, `delete`) validates path IDs with `isValidId(id)` (`id is string && id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$')`).
4. **Master Gate Relational Sync**: Every subcollection under `/users/{userId}/...` (`private`, `privacy`, `vault`, `auditLogs`, `feedback`) verifies on writes that the parent `/users/{userId}` document exists and its `accountStatus == 'active'` and `uid == request.auth.uid`.
5. **Split-Collection PII Isolation**: Raw PII is never stored in `/users/{userId}`; AES-256-GCM ciphertext PII and MFA secrets live exclusively in `/users/{userId}/private/{docId}` where only `isOwner(userId)` can read or write.
6. **Anti-Update-Gap & Action-Based Updates**: Every `create` and `update` invokes `isValid[Entity](incoming(), userId)` FIRST, enforces `data.keys().hasAll(...) && data.keys().hasOnly(...)`, enforces `.size()` limits on every string, preserves immutable fields (`uid`, `createdAt`), enforces `request.time` on `createdAt`/`updatedAt`, and locks updates once `accountStatus == 'deleted'` or feedback `status == 'resolved'`.
7. **Immutable Compliance Audit Trail**: Documents in `/users/{userId}/auditLogs/{logId}` are append-only (`allow update: if false;`), strictly enforce `resource.data.uid == userId` on `list` without `get()`/`exists()` calls, and only allow `delete` by the verified owner during GDPR Art. 17 erasure.
8. **Bootstrapped Admin without Token Spoofing**: Admin status is verified either via `exists(/databases/$(database)/documents/admins/$(request.auth.uid))` or verified bootstrapped owner email (`request.auth.token.email == 'wahidiammar@gmail.com' && request.auth.token.email_verified == true`).
9. **Post-Testing Feedback Isolation (`/users/{userId}/feedback/{feedbackId}`)**: Feedback submissions strictly validate rating (`1..5`), category enum, message bounds (`3..1200`), device diagnostics (`1..240`), initial status (`open`), terminal lock (`resolved`), and zero-DB-read `allow list` (`resource.data.uid == userId`).

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return `PERMISSION_DENIED`)
1. **Payload 1 — Shadow Field Injection on Profile Create**:
   `POST /users/user_1` with `{ uid: "user_1", displayName: "Alex", authProvider: "google.com", mfaEnabled: false, accountStatus: "active", isAdmin: true, createdAt: SERVER_TIME, updatedAt: SERVER_TIME }` -> Rejected by `keys().hasOnly(...)`.
2. **Payload 2 — Email Spoofing (Unverified Admin Email)**:
   Auth token `{ uid: "attacker_1", email: "wahidiammar@gmail.com", email_verified: false }` attempting `GET /users/victim_1` -> Rejected because `email_verified == true` is required.
3. **Payload 3 — Cross-User PII Vault Read**:
   Authenticated verified user `user_2` attempting `GET /users/user_1/private/pii` -> Rejected by strict `isOwner(userId)` gate.
4. **Payload 4 — Cross-User Audit Log List Scraping**:
   Authenticated verified user `user_2` running unfiltered `LIST /users/user_1/auditLogs` -> Rejected by `request.auth.uid == userId && resource.data.uid == userId`.
5. **Payload 5 — Orphaned Subcollection Write (Bypassing Master Gate)**:
   Authenticated verified user `user_3` attempting `CREATE /users/user_3/private/pii` when `/users/user_3` does not exist -> Rejected by `exists(/databases/$(database)/documents/users/$(userId))`.
6. **Payload 6 — Immutable `createdAt` Tampering on Profile Update**:
   Owner `user_1` updating `/users/user_1` with modified `createdAt` -> Rejected by `incoming().createdAt == existing().createdAt` and `affectedKeys().hasOnly(...)`.
7. **Payload 7 — Client Timestamp Forgery**:
   Owner `user_1` creating `/users/user_1` with `createdAt: Timestamp.fromMillis(1700000000000)` instead of `request.time` -> Rejected by `incoming().createdAt == request.time`.
8. **Payload 8 — Terminal State Resurrection**:
   Owner `user_1` attempting to update `/users/user_1` from `accountStatus: "deleted"` back to `"active"` -> Rejected by terminal lock `existing().accountStatus != 'deleted'`.
9. **Payload 9 — Value Poisoning on Whitelisted Key**:
   Owner `user_1` updating `displayName` with a 5,000-character string or boolean `true` -> Rejected by `isValidUserPublicProfile(incoming(), userId)` wrapping `allow update`.
10. **Payload 10 — ID Poisoning (Junk Path Variable)**:
    Owner attempting `CREATE /users/user_1/vault/bad$id!with/slashes` or 200-char ID -> Rejected by `isValidId(docId)`.
11. **Payload 11 — Compliance Audit Log Tampering (`update`)**:
    Owner `user_1` attempting `UPDATE /users/user_1/auditLogs/log_1` to rewrite security history -> Rejected by `allow update: if false;`.
12. **Payload 12 — Identity Spoofing Inside Payload (`actorUid` / `uid` mismatch)**:
    Owner `user_1` creating `/users/user_1/auditLogs/log_2` with `actorUid: "user_99"` -> Rejected by `data.uid == userId && data.actorUid == request.auth.uid`.
