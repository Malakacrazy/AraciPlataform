# Code quality & maintainability review — 31 Aug 2026

Scope: `apps/api`, `apps/web`, `packages/db` (source, not `node_modules`/build
output). Method: dependency-graph tracing (imports vs. declarations), model
usage tracing (schema vs. query call sites), file-size/complexity scan, and
manual reading of the flagged areas. Every finding below was verified by
reading the actual code before being listed — nothing here is a guess from
filename pattern-matching alone. Two categories the request asked about
(unused UI components, orphaned Prisma models) come back essentially clean;
that's reported too, since "checked and found nothing" is a real result, not
a skipped step.

None of this has been applied yet — this is the review only.

---

## 1. Dead code

### 1.1 `nfewizard-io` — unused npm dependency, drags in a duplicate package tree

**Where:** `apps/api/package.json`

**Why it's unnecessary:** Two separate NFS-e client libraries are declared —
`@nfewizard/nfse` (`^1.0.5`) and `nfewizard-io` (`^1.1.2`). Only
`@nfewizard/nfse` is ever imported (`nfse-client.ts:4`). `nfewizard-io` has
zero import sites anywhere in `apps/api/src`. It's not a peer dependency of
anything else installed either — it's its own independent package with its
own `@nfewizard/shared`/`@nfewizard/types` transitive versions (older ones:
1.1.4/1.0.7, vs. the 1.1.5/1.0.8 that `@nfewizard/nfse` actually uses) — so
today the install tree carries two versions of the same underlying shared
code for no reason.

**Impact of removing it:** Smaller `node_modules`, smaller lockfile, one
less transitive-dependency surface to security-scan. No behavior change —
nothing references it.

**Risk:** None found. Confirmed via `grep -rl "nfewizard-io"` across
`apps/api/src` and `apps/api/scripts` — zero hits outside a comment that
uses "nfewizard-io" as a project-name reference, not an import.

**Cleanup plan:**
1. Remove the `"nfewizard-io": "^1.1.2"` line from `apps/api/package.json`.
2. `npm install` to regenerate the lockfile.
3. `npm run build` (apps/api) to confirm nothing broke.

---

### 1.2 `apps/api/test/` — orphaned, broken NestJS scaffold e2e test

**Where:** `apps/api/test/app.e2e-spec.ts`, `apps/api/test/jest-e2e.json`,
the `test:e2e` script in `apps/api/package.json`

**Why it's unnecessary:** This is the unmodified default file NestJS's CLI
generates on `nest new`. It boots the whole `AppModule` and asserts
`GET /` returns `200` with body `'Hello World!'`. `AppController` today has
exactly one route — `GET /health` (added later, to do a real `SELECT 1`
healthcheck) — there is no `GET /` handler at all. This test would fail if
anyone ran it: it's not just unused, it's actively wrong. It was also never
wired into CI — `ci.yml` runs `npx turbo run test`, which maps to `jest`
(matching `*.spec.ts`, and Jest's `rootDir` for the api package is `src/`,
which doesn't even reach `test/`). Nothing has run this file since the
project's initial scaffold.

**Impact of removing it:** None on running behavior — it's already dead
weight, never executed. Removes a `jest-e2e.json` config file, a broken
spec, and an npm script that would error if anyone tried it, believing it
verifies something.

**Risk:** None. If real e2e coverage is wanted later, it should be written
against actual routes and wired into CI deliberately — this scaffold isn't
a starting point worth keeping, since it tests a route that doesn't exist.

**Cleanup plan:**
1. Delete `apps/api/test/` (both files).
2. Remove `"test:e2e": "jest --config ./test/jest-e2e.json"` from
   `apps/api/package.json`.
3. No other reference to update — confirmed nothing else points at `test/e2e`.

---

### 1.3 Two empty, disconnected route directories on the frontend

**Where:** `apps/web/src/app/projects/[id]/` and `apps/web/src/app/api/portal/`

**Why they're unnecessary:** Both are empty directories with no `page.tsx`
or `route.ts` inside — they produce no route in Next's App Router, they're
just filesystem clutter.
- `app/projects/[id]/` (outside the `(dashboard)` route group) is a
  leftover from before routes were moved under `(dashboard)/projects/[id]/`
  — the real, live route.
- `app/api/portal/` is the empty parent left behind by this session's own
  A44 fix, which moved `api/portal/data-export/route.ts` to
  `portal/data-export/route.ts` (fixing a cookie-path bug) without deleting
  the now-empty ancestor directory.

**Impact of removing them:** Zero — they don't compile into anything.
Purely a "why does this exist" question for the next person browsing the
tree.

**Risk:** None.

**Cleanup plan:** `rm -rf` both directories.

---

### 1.4 Stale comment: `apps/web/src/middleware.ts` doesn't exist

**Where:** `apps/api/src/app.module.ts` (ThrottlerModule comment)

**Why it's unnecessary:** The comment points future readers at
`apps/web/src/middleware.ts` for "where the real rate limiting lives." That
file was renamed to `apps/web/src/proxy.ts` when Next 16 deprecated the
`middleware.ts` convention — the external audit from 30 Aug already caught
this exact staleness once in `auth/public.decorator.ts` (already fixed
there, confirmed correct on recheck) but missed this second call site. Not
dead code, but actively misleading documentation — the kind of thing that
sends the next engineer looking for a file that isn't there.

**Impact of fixing:** None functionally; saves a confused `find` next time
someone reads this comment and goes looking.

**Risk:** None — comment-only change.

**Cleanup plan:** Update the comment to say `apps/web/src/proxy.ts`.

---

### 1.5 Checked and found clean: no orphaned Prisma models, no unused UI components

Two things worth reporting as **not** findings, since they're exactly what
this kind of review usually turns up and didn't here:

- **Prisma models:** all 39 models in `schema.prisma` were checked against
  application code for actual read/write usage. Two (`ProposalStage`,
  `InvoiceLine`) initially looked unused because they're never queried via
  a top-level `prisma.db.proposalStage.…`/`prisma.db.invoiceLine.…` call —
  but both are used constantly through Prisma's nested-relation syntax
  (`include: { stages: true }`, `stages: { create: [...] }` on `Proposal`;
  same pattern for `Invoice.lines`). No genuinely orphaned table exists.
- **UI components/lib files:** every file under `apps/web/src/components`
  and `apps/web/src/lib` was checked for at least one importer elsewhere in
  the tree. Zero came back with no importers.

---

## 2. Duplicate logic that should be consolidated

### 2.1 Five copies of "most recent row per grouping key" reducer

**Where:** `apps/api/src/activities/activities.service.ts` —
`getLastActivityAtByOpportunityIds`, `getLastActivityAtByClientIds`,
`getLastActivityAtByProjectIds`; `apps/api/src/notifications/notifications.service.ts`
— `getLastStalledNotificationAtByOpportunityIds`, `getLastNotifiedAtByClientIds`

**Why it's duplicate:** All five methods do the identical thing: run one
`findMany` with `orderBy: { createdAt: 'desc' }`, then loop the rows and
build a `Map<string, Date>` keeping only the first (= most recent) entry
per key, guarded by `if (!map.has(key))`. They differ only in which model
(`activity` vs. `notification`), which `where` filter, and which field name
holds the grouping key (`entityId`, `opportunityId`, `clientId`). Each was
clearly written by copying the previous one and adjusting three lines — the
comments even say so ("Mesmo espírito de...").

**Impact of consolidating:** ~60 lines become ~15. One reducer to test and
reason about instead of five. Any future bug fix (e.g., a null-key edge
case) needs fixing once, not five times in sync.

**Risk:** Low. This is pure refactoring — the query shapes differ (which
model, which where-clause), so the shared piece is only the "reduce rows to
latest-per-key" logic, not the query itself. Each call site keeps its own
`findMany`; only the grouping loop gets extracted. No behavior change if
done as a straight extraction.

**Cleanup plan:**
1. Add a small shared helper (e.g., in `apps/api/src/common/`):
   ```ts
   export function latestByKey<T extends { createdAt: Date }>(
     rows: T[],
     keyOf: (row: T) => string | null,
   ): Map<string, Date> {
     const result = new Map<string, Date>();
     for (const row of rows) {
       const key = keyOf(row);
       if (key && !result.has(key)) result.set(key, row.createdAt);
     }
     return result;
   }
   ```
2. Replace the loop body in each of the five methods with a call to it,
   keeping each method's own `findMany` as-is.
3. Run the existing Jest suite + the cron verification scripts
   (`verify-stalled-cron.ts`, `verify-data-retention-cron.ts`) to confirm
   no behavior drift.

---

### 2.2 Six byte-identical custom error classes on the frontend

**Where:** `apps/web/src/lib/api.ts` (`ApiError`), `portalApi.ts`
(`PortalApiError`), `publicApi.ts` (`PublicApiError`),
`collaboratorPortalApi.ts` (`CollaboratorPortalApiError`),
`whiteboardGuestPortalApi.ts` (`WhiteboardGuestPortalApiError`),
`leadApi.ts` (`LeadApiError`)

**Why it's duplicate:** Each file declares its own `class XError extends
Error { constructor(public status: number, message: string) { super(message); } }`
— identical in every file except the class name. These six `lib/*Api.ts`
files exist as separate modules on purpose (they hit different backends
with different auth mechanisms — staff BFF proxy, public token-in-URL,
portal session cookie, collaborator session header, whiteboard guest
session header — that separation is legitimate, not something to merge).
The error class inside each one didn't need to be reinvented, though.

**Impact of consolidating:** ~40 lines removed. One error shape to import
instead of six near-identical ones; a future addition (e.g., attaching a
response body to the error) only needs to happen once.

**Risk:** Low-medium. Every call site currently does `err instanceof
PublicApiError` (etc.) to narrow the catch block. If consolidated into one
shared class, either (a) all `instanceof` checks need to reference the same
shared class — safe, but touches every catch block across the six files —
or (b) keep the six exported names as type aliases/re-exports of one
underlying class, which preserves every existing `instanceof` check
untouched. Option (b) is the lower-risk path.

**Cleanup plan:**
1. Add `export class HttpApiError extends Error { constructor(public status: number, message: string) { super(message); } }` to a shared file (e.g., `apps/web/src/lib/httpError.ts`).
2. In each of the six files, replace the local class declaration with
   `export { HttpApiError as ApiError } from './httpError'` (adjusting the
   alias per file) — zero changes needed at any call site.
3. Build (`next build`) to confirm the re-exports type-check.

---

## 3. Unused UI components

None found. See §1.5 — every component and lib file has at least one real
importer.

---

## 4. Overly complex implementations that could be simplified

### 4.1 `apps/api/scripts/smoke-test.ts` — 4,069 lines in one file

**Why it's a problem:** This is the project's real, high-value end-to-end
test suite (it caught several genuine regressions during this session's
audit-remediation work) — it is **not** dead code and should not be
deleted. But at over 4,000 lines in a single file, it's hard to navigate,
hard to review in a diff, and slow to reason about when something in the
middle fails. New checks keep getting appended to the end (this session
added several), so the file only grows.

**Impact of splitting it:** Purely a maintainability win — easier to find
the block that tests a given feature, smaller diffs when adding a check,
easier for a new contributor to read.

**Risk: real, and non-trivial.** The suite is **stateful and order-
dependent** — later blocks reuse `projectId`, tokens, and IDs created by
earlier blocks (confirmed directly this session: reordering or isolating
a block without carrying its dependencies forward breaks downstream
assertions). A naive split into files-that-each-run-independently would
require either (a) a shared fixture-setup phase all files import, or (b)
keeping one long-lived script that just imports and sequentially calls
exported functions from several files. Getting this wrong produces exactly
the kind of flaky, hard-to-debug test failures this file currently avoids
by being one linear script.

**Cleanup plan (recommended, not urgent):**
1. Don't attempt a mechanical split. Instead, extract self-contained
   sections (ones with no downstream dependents — e.g., the LGPD/lead
   capture block, the collaborator-portal block) into their own files that
   export an `async function run(ctx)` taking the shared `api`/`prisma`
   helpers and whatever IDs they need as arguments.
2. Keep `smoke-test.ts` itself as the orchestrator: mint the token, create
   shared fixtures, then call each extracted block in sequence, passing
   forward whatever the next block needs.
3. Do this incrementally, one section at a time, running the full suite
   after each extraction to confirm no behavior change — never as one big
   mechanical refactor.

### 4.2 `apps/web/src/components/office-links/office-links-section.tsx` — 690 lines, three providers in one component

**Why it's a problem:** This single component handles Drive linking,
Calendar event creation/listing, and Gmail compose/list — three fairly
independent feature areas sharing one file and one set of `useState` hooks.

**Impact of splitting:** Easier to review a Calendar-only change without
scrolling past Gmail/Drive code; smaller re-render surface per concern.

**Risk:** Low — the three provider sections don't appear to share much
state beyond the parent `links` list and `error` banner. A prop-drilled
split into `DriveLinkSection`/`CalendarLinkSection`/`GmailLinkSection`
subcomponents (still rendered together from the same parent) is a
mechanical, low-risk refactor. Not urgent — flagged as an opportunity, not
a problem causing active pain.

---

## 5. Legacy code no longer needed

Nothing beyond what's already covered in §1 (the e2e scaffold, the stale
`middleware.ts` comments). Worth noting explicitly: the `MoodboardItem`
table appears in several old migrations (created, then altered, then
dropped) and is referenced in two code comments as "ver MoodboardItem no
histórico" ("see MoodboardItem in the history"). That is **not** a dead-code
finding — migrations are an append-only historical record and should never
be edited or deleted retroactively, and the comments correctly point at
history rather than live code. Flagging it here only to say it was checked
and is fine as-is, not overlooked.

---

## 6. Redundant database queries / API calls

### 6.1 `GoogleDriveService.checkBrokenLinksForAccount` — serial per-link Drive API calls

**Where:** `apps/api/src/office/google-drive.service.ts`

**Why it looks redundant:** The loop makes one Google Drive API call and
one DB update per `OfficeLink` in the account, serially, with no batching
or concurrency limit. For an account with hundreds of linked files, this is
hundreds of round-trips in one request/cron tick.

**This is already a known, triaged issue, not a fresh finding** — it was
flagged by the external audit (finding A34) and addressed this session to
the extent that mattered for correctness (a failure on one link no longer
aborts the whole account or loses notifications for links already
processed). Full pagination + bounded concurrency was explicitly deferred
at the time, because the Drive API itself doesn't offer a batch
"check many file IDs" endpoint — the per-link round-trip is close to
unavoidable without a bigger redesign (e.g., using the Drive Changes API
instead of polling each file). Listed here for completeness, not as a new
action item.

**Recommended plan (if ever prioritized):** Bound concurrency (e.g.,
process 10 links at a time with `Promise.all` batches) rather than fully
serial — cuts wall-clock time for large accounts without needing a Drive
API redesign.

### 6.2 The duplicate-reducer pattern in §2.1 also counts here

Each of the five near-identical methods does run its own `findMany` — that
part is correct and necessary (different filters). Nothing to fix on the
query side beyond the code-duplication fix already described in §2.1.

No other N+1 or redundant-query pattern was found in a systematic sweep for
per-iteration `await this.prisma...` calls inside `for`/`.map(async …)`
loops across `apps/api/src`.

---

## 7. Files that appear abandoned or disconnected

Covered in §1.2 and §1.3 (the e2e scaffold and the two empty directories).
Nothing else came back from the orphaned-file sweep in §1.5.

---

## 8. Summary — recommended cleanup order

Roughly in order of "safest and cheapest first":

1. Delete the two empty directories (§1.3) — zero risk, one command.
2. Delete `apps/api/test/` and its `test:e2e` script (§1.2) — zero risk,
   it's already broken and unrun.
3. Remove `nfewizard-io` from `apps/api/package.json` and reinstall (§1.1)
   — zero risk, confirmed unused.
4. Fix the two stale `middleware.ts` comments (§1.4) — zero risk,
   comment-only.
5. Consolidate the five latest-by-key methods (§2.1) — low risk, run tests
   after.
6. Consolidate the six error classes (§2.2) — low-medium risk (touches
   import lines in six files), run `next build` after.
7. Split `office-links-section.tsx` by provider (§4.2) — low risk, do when
   next touching that file rather than as a standalone change.
8. Plan (don't rush) the `smoke-test.ts` decomposition (§4.1) — real risk
   if done mechanically; worth doing incrementally over time, never as one
   big refactor.

Items 1-4 could reasonably be done together as one "chore: remove dead
code" commit. Items 5-6 are small, mechanical, and independent of each
other — fine as one or two follow-up commits. Item 7 and 8 are structural
improvements, not urgent, best done opportunistically.
