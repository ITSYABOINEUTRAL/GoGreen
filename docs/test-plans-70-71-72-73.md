# Implementation plans: issues #70, #71, #72, #73

Planning notes only. No source or test changes are included in this PR. Each section records what
exists today (verified by reading the files, not by running them), where the issue text differs from the
repository, and the proposed tests.

| Issue | Area | Layer |
|---|---|---|
| #73 | `auctionCron.js` successful-sale path | Backend (Jest) |
| #71 | `SPA_ENDPOINTS` routes are mounted | Backend (Jest) |
| #72 | `AdminOrdersPanel` | Frontend (Vitest + RTL) |
| #70 | `ProductForm` image validation / object URLs | Frontend (Vitest + RTL) |

Suggested order: #72 (smallest), #70, #71, #73 (needs a decision on the DB approach).
CONTRIBUTING.md asks for one logical change per PR, a conventional-commit title
(`test: ...`) and `Closes #NNN` in the PR description.

## Findings that change how the issues should be implemented

1. **Test locations in the issues do not match the repo.**
   - Frontend tests live in `frontend/src/test/` (and some `__tests__/` folders). There is no `frontend/src/tests/`.
     New files should go in `frontend/src/test/`.
   - Backend Jest runs `**/tests/**/*.test.js` and `**/src/__tests__/**/*.test.js`. `backend/src/tests/` exists but only holds one
     file; most suites are in `backend/src/__tests__/` and `backend/tests/`. The issues' `backend/src/tests/...` path is matched by the glob,
     but the surrounding convention is `src/__tests__/`. Pick one and say so in the PR.
2. **Partial coverage already exists** for #70, #71, #72 and #73 (details in each section). The new tests should extend,
   not duplicate, those files.
3. **Global Jest setup mocks the database and Stellar utils.** `backend/tests/jest.setup.js` (a `setupFilesAfterEnv` file) mocks
   `db/schema` and `utils/stellar` for every backend test. Any test that wants the real database must opt out (see #73).

---

## #73: auction cron successful-sale test

### Current state

- `backend/src/jobs/auctionCron.js` `closeExpiredAuctions()`: for every active auction past `ends_at` it picks the highest bid, then:
  no bid -> status `cancelled`; bid below `reserve_price` -> `ended_no_sale` and emails bidders; otherwise (reserve met or no reserve)
  it calls `sendPayment({ senderSecret: await decryptUserSecretKey(winner.buyer_secret), receiverPublicKey: auction.farmer_wallet, amount, memo: 'Auction#<id>' })`
  and then:
  - `UPDATE auctions SET status = 'ended', winner_id = ?, winner_notified = 1, closed_at = <now> WHERE id = ?`
  - `INSERT INTO orders (buyer_id, product_id, quantity, total_price, status, stellar_tx_hash) VALUES (?, ?, 1, ?, 'paid', ?)`
    (this is the exact column list; quantity is hard-coded to 1 and `total_price` is the winning bid amount)
  - then best-effort winner and sale emails. A thrown error in the block sets the auction to `cancelled`.
- `backend/src/__tests__/auctionCron.test.js` already exists. It mocks `db/schema` as PostgreSQL (`isPostgres: true`, `query` mock) and has a
  "closes a sale when reserve is met" test, but it only checks that `sendPayment` was called and that some query contained
  `status = 'ended'` with params `[2, 1]`. It never asserts the `orders` insert, its parameters, or `closed_at`.

### Problems with the approach in the issue

The issue asks to seed a real SQLite database through `backend/src/db/schema.js` and assert with `db.prepare(...).get()`. From reading the code:

- In SQLite mode `schema.js` exposes `query`, `exec` and `withTransaction` (it uses `sqlite.prepare` internally) and I could not find a public
  `db.prepare` export. The cron's non-Postgres branch calls `db.prepare(...)`, so I need to confirm whether that branch can run against the real module at all.
- The SQLite database path is fixed to `backend/market.db` (no `:memory:` / env override), so a real-DB test would touch the developer's local file.
- Migration `026_auction_winner_and_statuses.sql`, which adds `winner_id` and the `ended`/`ended_no_sale` statuses, is written with PostgreSQL-only syntax
  (`DO $$ ... $$`, `ADD COLUMN IF NOT EXISTS`). Migration 023 creates `auctions.status` with `CHECK (status IN ('active','closed','cancelled'))`.
  I need to check how the migration runner treats 026 on SQLite; if the check constraint is never relaxed there, writing `'ended'` would fail on SQLite.
  If that is true it is a real bug the test would uncover, and should be reported on the issue rather than papered over.
- `jest.setup.js` mocks `db/schema` globally, so the test must call `jest.unmock`/`jest.requireActual` (or use a purpose-built fake).

### Plan

1. Before writing code, run a short spike: load the real `db/schema` in a scratch script with a temporary copy of the DB and check (a) whether `db.prepare` exists,
   (b) the final `auctions` columns/constraints after migrations, (c) whether the SQLite branch of the cron works. Record the result on the issue and
   agree on an approach with the maintainer.
2. **Preferred approach (low risk):** extend the existing mocked-DB suite, since the issue's acceptance criteria are about observable writes. Add a test in a new
   file `auctionCron.success.test.js` (the issue's name) that mocks `db/schema` with `isPostgres: true` and a `query` mock keyed on SQL text, so we can
   assert the two writes precisely:
   - the `UPDATE auctions` call contains `status = 'ended'`, params `[winner.buyer_id, auction.id]`, and the SQL sets `closed_at`;
   - the `INSERT INTO orders` call has params `[buyer_id, product_id, amount, txHash]` and the SQL contains `'paid'` and `stellar_tx_hash`;
   - `sendPayment` was called with the decrypted secret, farmer wallet, bid amount and memo `Auction#<id>`;
   - `decryptUserSecretKey` received the stored (encrypted) secret; winner and sale emails were attempted;
   - ordering: payment first, then update, then insert (assert call order), and that a `sendPayment` rejection leads to `cancelled` with **no** order insert.
3. **If the maintainer insists on a real SQLite DB:** use a temp DB file via a test-only env override (needs a tiny change in `schema.js`, so out of scope for a
   test-only PR unless approved), run migrations, seed `users`, `products`, `auctions`, `bids`, then read back with `db.query`.
4. Mock `../utils/stellar`, `../utils/crypto` and `../utils/mailer` with `jest.mock` (no network, no real key material), as required by the acceptance criteria.

### Verification

`cd backend && npx jest src/__tests__/auctionCron` then `npm test`; `npm run lint` (`--max-warnings 0`). Temporarily break the order insert
(change `'paid'`) to prove the new test fails.

---

## #71: every `SPA_ENDPOINTS` entry is mounted on the router

### Current state

- `backend/src/openapi/spaPaths.js` exports `SPA_ENDPOINTS` (172 `[method, path, operationId]` rows, `{param}` templates) and `buildSpaPaths`.
- `backend/tests/spaRoutes.contract.test.js` already does most of what the issue describes, in the *client.js* direction: it regex-extracts endpoints from
  `frontend/src/api/client.js`, resolves each against `app._router.stack` with a recursive `resolve()` helper, and asserts it reaches a real handler (excluding the
  catch-all `GET /:productId` of the reviews router). It also has a `KNOWN_GAPS` allow-list of about 30 client calls with no backend route (for example
  `GET /admin/contracts`, `POST /products/{}/waitlist`, `GET /orders/{}/receipt`), plus a test that fails when a known gap gets fixed.
- What is genuinely missing is the reverse direction the issue describes: nothing iterates `SPA_ENDPOINTS` itself, so an entry in `spaPaths.js` that is absent from `client.js`
  (or drifts from it) is never checked against the router, and the failure message does not name the `operationId`.
- Important consequence for the acceptance criterion "passes against the current router without modifying any route file": the existing KNOWN_GAPS show
  that several `SPA_ENDPOINTS` entries probably have no mounted route today (the admin contract endpoints and others). The new test will fail on them unless it carries
  the same exemption list.

### Plan

1. New file `backend/tests/spaPathsMounts.test.js` (same folder as the sibling contract test, which is the closest convention; the issue's
   `src/tests/` path is also matched by the Jest glob).
2. Reuse, don't copy: move `resolve()` / `resolvesToRealHandler()` and `KNOWN_GAPS` into a small shared helper (for example `backend/tests/helpers/spaRouteResolver.js`)
   used by both files. This touches the existing contract test lightly; if the maintainers prefer zero edits there, duplicate the ~15 lines and add a comment.
3. For each `[method, template, operationId]`: build the URL by replacing `{param}` with a placeholder (`1`), resolve under `/api/v1`, and collect failures as
   `${operationId}: ${METHOD} ${template}`. Assert with one `expect(missing).toEqual([])` so the message lists every offending `operationId` (or use `it.each` with the operationId in the title).
4. Gap handling: build the exemption set from the existing `KNOWN_GAPS` by converting `{}` templates, so both tests share one source of truth. Include a "known gaps are still gaps"
   check so the list shrinks as routes land.
5. Extra checks that are cheap and valuable: no duplicate `(method, path)` pairs in `SPA_ENDPOINTS`; every `SPA_ENDPOINTS` entry also appears in the client.js-extracted set (and vice versa),
   which is the missing symmetry between the two files.
6. Prove it works: temporarily rename one mounted route locally and confirm the failure names the right `operationId`.

### Notes / risks

- Both tests load the whole Express app, which needs the environment variables used by the sibling tests (`jest.setup.js` already sets `JWT_SECRET`, `ENCRYPTION_SECRET`).
- Placeholder choice: numeric `1` can collide with literal-segment routes; the existing helper already uses it, so keep behaviour identical.
- The issue lists `backend/src/__tests__/routeMounts.test.js` and `routes-index.test.js` as conventions; those use `supertest` to hit URLs. The router-stack walk
  from the contract test is the better model because it runs no handlers and touches no DB.

---

## #72: `AdminOrdersPanel` rendering and pagination bounds

### Current state

- `frontend/src/components/admin/AdminOrdersPanel.jsx` renders `Orders ({orderPagination.total})`, a table (ID, Buyer, Product, Qty, Total (XLM), Status, Date),
  and Prev/Next buttons labelled `← Prev` / `Next →` with `Page {page} of {pages}`. Fallbacks: `o.buyer_name || o.buyer_id`, `o.product_name || o.product_id`.
  Total: `Number(o.total_price).toFixed(2)`. Prev is `disabled` when `page <= 1`, Next when `page >= pages`; clicks call `onPageChange?.(page ± 1)`.
- The component has no dedicated test file. `frontend/src/test/AdminPanels.test.jsx` has one test ("pages orders forward") that renders it with page 1 of 2 and checks
  `onPageChange(2)`. It does not cover fallbacks, decimals, the header count, Prev behaviour, or disabled bounds.

### Plan

New file `frontend/src/test/AdminOrdersPanel.test.jsx` (the issue says `src/tests/`, which does not exist; `src/test/` is where the siblings live). Vitest + React Testing Library, minimal two-order fixture:

- Order A has `buyer_name`/`product_name`; Order B has neither (only `buyer_id` and `product_id`), `total_price` values such as `12.5` (-> `12.50`) and the string `"7"` (-> `7.00`), plus `3.14159` (-> `3.14`) for rounding.
- Tests:
  1. Renders both names when present; renders `buyer_id`/`product_id` values when absent (scope queries with `within(row)`).
  2. Total rendered with exactly two decimals (`12.50`, `7.00`).
  3. Header shows the total count from `orderPagination.total`, which can differ from `orders.length` (page of 2, total of 57).
  4. Prev disabled on page 1; Next disabled on the last page; both enabled in the middle.
  5. Clicking Prev/Next calls `onPageChange` with `page - 1` / `page + 1` (and not on disabled buttons; use `userEvent` and `toHaveBeenCalledTimes`).
  6. Edge cases: empty `orders` renders headers and no rows; no `onPageChange` prop does not throw when clicking.
- The Date column uses `toLocaleDateString()`; assert with the same expression on the fixture date rather than a hard-coded string, to avoid locale flakiness.
- Optional follow-up (not in this issue): the empty table has no empty-state message.

Verification: `cd frontend && npx vitest run src/test/AdminOrdersPanel.test.jsx`, then `npm test`.

---

## #70: `ProductForm` image validation and object-URL lifecycle

### Current state

- `frontend/src/components/dashboard/ProductForm.jsx`: `validateAndSetImage(file)` rejects types outside `image/jpeg|png|webp` with
  `'Only JPEG, PNG, or WebP images are allowed.'`, rejects `file.size > 5 MB` with `'Image must be 5 MB or smaller.'`, otherwise revokes the previous
  `cropSrcRef` URL, calls `URL.createObjectURL(file)` and opens `ImageCropModal`. `handleCropConfirm`/`handleCropCancel` revoke the crop URL.
  The file input is rendered with `style={{ display: 'none' }}` and **no `data-testid` or label**; the visible trigger is a `role="button"` div named by `t('dashboard.productImage')`.
- Existing coverage in `frontend/src/test/`:
  - `ProductFormCropSrcLeak.test.jsx` already tests the revoke lifecycle: cancel, confirm, replacing an image, picking a second image while the modal is open, and a 4-image sequence.
  - `DashboardImageValidation.test.jsx` tests the validation rules against a copied helper, not the rendered component.
  - `ProductFormImageUpload.test.jsx` covers upload failure and loading states, not file validation.
- Not covered through the real component: the two error messages as rendered text, "no object URL is created for a rejected file", the exact "valid file creates exactly one object URL",
  and error clearing on the next valid pick.

### Plan

New file `frontend/src/test/ProductForm.image.test.jsx`, reusing the mocking setup from `ProductFormCropSrcLeak.test.jsx` (copy its mocks for `useTranslation`, `useXlmRate`, the API client and `ImageCropModal`, rather than inventing new ones):

1. Stub `URL.createObjectURL` (returning distinct `blob:1`, `blob:2`, ...) and `URL.revokeObjectURL` with `vi.fn()` in `beforeEach`; restore in `afterEach`.
2. Disallowed type (`new File(['x'], 'a.gif', { type: 'image/gif' })`): error text is shown and `createObjectURL` is **not** called.
3. Oversize: a `File` whose `size` is overridden via `Object.defineProperty` to `5 * 1024 * 1024 + 1` (do not allocate 5 MB): size error shown, no object URL. Add the boundary case, exactly 5 MB accepted.
4. Happy path: valid PNG -> exactly one `createObjectURL`, no error, crop modal rendered.
5. Second valid file while the first crop is pending: `revokeObjectURL` called once with the first URL **before** the second `createObjectURL` (compare `mock.invocationCallOrder`).
6. A valid file after a rejected one clears the previous error.
7. Query the input: add `data-testid="product-image-input"` to the hidden input in `ProductForm.jsx` as the issue allows (a one-attribute change), or use `container.querySelector('input[type="file"]')` to keep the PR test-only. I would prefer the `querySelector` route unless the maintainers want the attribute.

Overlap: item 5 duplicates a scenario in `ProductFormCropSrcLeak.test.jsx`. Keep a single short assertion for it (the issue's acceptance criteria require it) and mention the overlap in the PR.

Verification: `cd frontend && npx vitest run src/test/ProductForm.image.test.jsx`, then `npm test`.

---

## Cross-cutting

- Claim each issue (comment and wait for assignment) before starting, per the project's contribution norms, and keep one PR per issue.
- Branch names: `test/auction-cron-success-73`, `test/spa-paths-mounted-71`, `test/admin-orders-panel-72`, `test/product-form-image-70`.
- Backend checks: `cd backend && npm test && npm run lint`. Frontend: `cd frontend && npm test`.
- Do not modify route files or components except the optional `data-testid` in #70; each issue's acceptance criteria are test-only.

## Open questions for maintainers

1. #73: is a real SQLite database required, given that `schema.js` has a fixed DB path and (as far as I can see) no public `db.prepare`?
   Is the PostgreSQL-style mocked approach acceptable? Also, does migration 026 actually apply on SQLite?
2. #71: should the new test share `KNOWN_GAPS` with `spaRoutes.contract.test.js`, and is moving the resolver into a shared helper acceptable?
3. #70/#72: confirm `frontend/src/test/` as the target folder.
4. #70: OK to add a `data-testid` to the file input, or keep the PR test-only?
