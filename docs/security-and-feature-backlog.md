# GymTrack security fixes and unfinished features

Review date: October 7, 2026 (America/Costa_Rica).  
Repository reviewed: `mespinoza86/gymtrack`, commit `10553ea5be47d97180b1ea77e9e74ec2480aa3c6`.

This inventory reflects a repository review, not a penetration test of the deployed application. It separates code findings, recommended hardening, incomplete workflows, future features, and unverified operational controls. None of the items below has been implemented as part of this review.

The deployed site and database health endpoint responded successfully on October 6, 2026. That confirms availability, not every authenticated workflow. Earlier validation passed 78 selected tests without database writes; the database integration suite and authenticated browser workflows were not run. Dependency audit results below are from October 5, 2026 and should be refreshed before remediation.

## Priorities

- **P1:** Address before expanding production use.
- **P2:** Address in the next release.
- **P3:** Optional improvement or lower-priority maintenance.

Checklist completion should require implementation and appropriate verification, not only a code change.

## Security fixes found in the code

| Done | ID | Priority | Issue | Required fix |
| --- | --- | --- | --- | --- |
| [ ] | S01 | P1 | Exercise ownership is not checked when saving routines. Submitted IDs can reference another trainer's private exercises. | Validate every exercise as public or owned by the trainer, inside the write transaction. |
| [ ] | S02 | P1 | Food ownership is not checked when saving nutrition plans. Submitted IDs can reference another trainer's private foods. | Validate every referenced food before saving the plan, inside the write transaction. |
| [ ] | S03 | P1 | Password-reset token validation, password update, and token consumption are separate operations. Concurrent requests can validate the same token. | Consume the token and update the account in one transaction with locking or a conditional update. |
| [ ] | S04 | P1 | Token issuance is not atomic: invalidating previous tokens and inserting a replacement are separate operations. | Serialize issuance per user and purpose so concurrent requests cannot leave multiple usable tokens. |
| [ ] | S05 | P1 | Connected sockets retain their authenticated user and room memberships after stored sessions are revoked. | Disconnect or revalidate sockets after logout, password reset, deactivation, and relevant permission changes. |
| [ ] | S06 | P1 | Normal password changes leave other sessions valid. | Revoke other sessions and rotate the current session and CSRF token. |
| [ ] | S07 | P1 | The SSL pool configuration explicitly sets `rejectUnauthorized: false`. Effective behavior also depends on connection-string options. | Require TLS with certificate and hostname verification; verify the effective Neon configuration. |
| [ ] | S08 | P1 | The last dependency audit reported high-severity findings for Engine.IO and Multer, and moderate findings for `qs` and `ip-address`. | Refresh the audit, update affected locked versions, and run regression checks. Remove unused Multer if uploads remain postponed. |

S01 and S02 require obtaining the private item's ID; knowing an ID must not substitute for authorization. These paths were inspected in code but were not exploited against production. Multer is currently unused, so its installation alone does not establish an exposed upload vulnerability.

### Main code locations

- S01: `src/services/routines.service.js`, `src/repositories/routines.repository.js`.
- S02: `src/services/nutrition.service.js`, `src/repositories/nutrition.repository.js`.
- S03–S04: `src/services/auth.service.js`, `src/repositories/auth.repository.js`.
- S05: `src/sockets/chat.js`, `src/controllers/auth.controller.js`, `src/services/auth.service.js`.
- S06: `src/services/auth.service.js`, `src/controllers/auth.controller.js`.
- S07: `src/config/database.js`.
- S08: `package.json`, `package-lock.json`.

## Security hardening

These are gaps or recommendations, rather than demonstrated attacks. Priority reflects proposed scheduling, not a formal vulnerability severity rating.

| Done | ID | Priority | Work |
| --- | --- | --- | --- |
| [ ] | S09 | P2 | Revalidate account status and role. Authentication middleware trusts the user stored in the session without checking subsequent deactivation or role changes. Implement revocation or periodic validation. |
| [ ] | S10 | P2 | Protect unauthenticated login requests against login CSRF. The current CSRF middleware skips unauthenticated requests; add an origin check or another suitable mechanism. |
| [ ] | S11 | P2 | Strengthen abuse controls for messages, invitations, and socket connections/events. Supplement existing authentication IP limits with account-based controls where appropriate. |
| [ ] | S12 | P2 | Validate socket handshake origins explicitly and verify behavior across supported transports; do not rely solely on CORS configuration. |
| [ ] | S13 | P2 | Validate production mail transports, public URLs, and numeric configuration. Prevent silent fallback to console email in production. |
| [ ] | S14 | P2 | Keep console email confined to development and redact sensitive production diagnostics. Console output contains complete verification and recovery links. |
| [ ] | S15 | P2 | Validate dates and route identifiers consistently before database operations; return controlled validation errors. |
| [ ] | S16 | P2 | Implement security auditing. An `audit_log` table exists, but no backend writes to it were found. Record important account, permission, and sensitive-data changes without secrets. |
| [ ] | S17 | P2 | Separate development and production data access. The shared Neon database is deliberate and temporary-schema tests help, but ordinary development operations can affect production. |
| [ ] | S18 | P3 | Clean up used and expired authentication tokens with bounded retention. |
| [ ] | S19 | P3 | Consider MFA and user-visible session management as additional account protections. |

Relevant modules include `src/middleware/auth.js`, `src/middleware/csrf.js`, `src/routes/auth.routes.js`, `src/sockets/chat.js`, `src/config/environment.js`, and `src/services/mail.service.js`.

## Incomplete workflows and reliability fixes

| Done | ID | Priority | What remains |
| --- | --- | --- | --- |
| [ ] | F01 | P1 | Chat pagination: the current query returns the oldest 500 messages. Load recent messages first and allow older history to be fetched. |
| [ ] | F02 | P1 | Accurate read receipts: fetching a conversation marks all incoming messages read, including messages omitted from the response. Mark only delivered or acknowledged messages. |
| [ ] | F03 | P2 | End a trainer–athlete relationship: the schema supports ended relationships and the product notes claim this feature exists, but no API or UI action was found. |
| [ ] | F04 | P2 | Define access after unlinking: decide which historical plans, measurements, and conversations remain available, then enforce that policy. |
| [ ] | F05 | P2 | Prevent duplicate notifications under concurrency. Replace application-only `NOT EXISTS` deduplication with database-enforced uniqueness appropriate to each event type. |
| [ ] | F06 | P2 | Allow incorrect measurements to be cleared. Distinguish an omitted field from an explicit request to clear it; the current upsert preserves values when null is submitted. |
| [ ] | F07 | P2 | Improve measurement attribution. `recorded_by` identifies the last person who changed the row, not who supplied each measurement. |
| [ ] | F08 | P2 | Define calendar/timezone behavior. Routine and nutrition progression use elapsed 24-hour periods; establish when the day changes for users and test boundaries. |
| [ ] | F09 | P2 | Bound email-provider requests with timeouts and a defined retry/failure strategy. |
| [ ] | F10 | P2 | Reconcile product documentation with implemented features, current security findings, and verification evidence. |
| [ ] | F11 | P3 | Decide whether historical nutrition plans should snapshot food values. Food edits intentionally update macro information in existing plans today; changing this is a product decision. |

### Main code locations

- F01–F02: `src/repositories/messages.repository.js`, `src/services/messages.service.js`, `public/js/compartido/mensajes.js`.
- F03–F04: `src/routes/links.routes.js`, `src/repositories/links.repository.js`, relationship-dependent authorization, and `public/js/compartido/perfil.js`.
- F05: `src/repositories/notifications.repository.js`.
- F06–F07: `src/repositories/tracking.repository.js` and measurement forms.
- F08: `src/services/routines.service.js`, `src/services/nutrition.service.js`.
- F09: `src/services/mail.service.js`.
- F10: `VISION_PRODUCTO.md`, `README.md`.
- F11: `src/repositories/nutrition.repository.js`.

## Features not implemented

These are future product features, not requirements for the existing coaching workflow. Product notes explicitly postpone progress photos without a delivery date.

| Done | ID | Feature | Current status / scope |
| --- | --- | --- | --- |
| [ ] | N01 | Progress photos | A database table exists. Upload, private object storage, viewing, authorization, and deletion are missing. Define file validation, limits, and retention before implementing. |
| [ ] | N02 | Calendar and scheduling | Not started. Define appointments, timezones, reminders, and any calendar integrations. |
| [ ] | N03 | Payments and subscriptions | Not started. Define provider, subscription lifecycle, webhook handling, and billing behavior. |
| [ ] | N04 | Wearable/watch integrations | Not started. Choose supported providers and define consent, synchronization, and disconnect behavior. |
| [ ] | N05 | PDF export | Not started. Define exportable plans/reports and access controls. |
| [ ] | N06 | Gym accounts with multiple trainers | Not started. Requires organization membership, roles, athlete assignment, and organization-level isolation. |

## Additional product decisions

The following capabilities should be evaluated separately; they are not automatically promised features:

- [ ] D01: Account deletion/deactivation workflow and its effect on retained records.
- [ ] D02: User data export.
- [ ] D03: Administration panel and administrator permissions.
- [ ] D04: Configurable retention and deletion policies.
- [ ] D05: Domain and authenticated email-sender strategy. Brevo is already implemented; the prepared Resend transport requires appropriate domain configuration. A provider change alone is not proof of reliable delivery.

## Verification still required

These are unverified controls or workflows, not claims that the capability is absent in the deployed environment.

- [ ] V01: Complete trainer and athlete browser flows: registration → verification → login → linking → plan assignment → athlete logging → trainer review.
- [ ] V02: Password recovery and normal password changes, including session and socket revocation.
- [ ] V03: Database integration suite against an isolated environment.
- [ ] V04: HTTP tests for actual cookies, CSRF enforcement, and cross-account access. Source-pattern assertions alone are insufficient.
- [ ] V05: Concurrent-request tests for reset-token consumption, token issuance, and notification deduplication.
- [ ] V06: Socket authorization after logout, reset, deactivation, and permission changes.
- [ ] V07: Chat history beyond 500 messages and read receipts for fetched versus unfetched messages.
- [ ] V08: Automated database backups, documented retention, and a successful restore exercise. EC2 disk snapshots do not back up an external Neon database.
- [ ] V09: Production email delivery, missing/invalid provider configuration, request timeouts, and user-visible failure handling.
- [ ] V10: Operational monitoring and alerting for availability, database failures, email failures, resource exhaustion, and unexpected costs.

## Recommended implementation order

1. Refresh dependency audit and address S01–S08.
2. Fix chat pagination and read receipts (F01–F02).
3. Verify the complete coaching workflow, cross-account boundaries, and concurrency behavior.
4. Verify database backups, restoration, and email delivery.
5. Complete remaining P2 hardening and incomplete workflows.
6. Resume the AWS migration using this verified application baseline.
7. Select future product features explicitly before implementation.

AWS migration remains preparation only. Local deployment files and the architectural diagram do not indicate an actual deployment or completed security remediation.
