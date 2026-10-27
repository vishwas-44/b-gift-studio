# Bhasi Gift Studio — Production Launch Audit

## Decision

**NOT READY for a customer-facing production launch.** Local code, dependency, test, build, and browser checks were completed, but the live database, production configuration, and end-to-end payment workflows were not verified. A dedicated staging environment is required before launch approval.

This is a repository and local-environment audit, not a production deployment certification. No GitHub operation, database migration, authenticated customer workflow, real email, or live payment was performed. The configured backend project was not confirmed to be a safe staging target, so its credentials were not used for authenticated tests.

## Work completed

- Documented the complete repository migration sequence, including the multiple-artwork and COD migrations, and called out the signup/password-reset OTP tables that are referenced by the API but have no migrations in this repository. See [README.md](./README.md).
- Added a fail-fast production build check requiring `VITE_API_BASE_URL` to be an HTTPS origin without a path. Missing, HTTP, and path-bearing URLs were rejected; a build using `https://api.example.invalid` succeeded. The generated assets contained the placeholder origin and no `localhost:5000` reference. See [vite.config.ts](./vite.config.ts).
- Removed unused direct dependencies `zod` and `@hookform/resolvers`, upgraded Vite to `8.3.5`, and updated backend runtime dependency lock versions for `body-parser`, `multer`, and `nodemailer`.
- Upgraded the backend development runner `nodemon` to `3.1.14`; the backend dependency audit then reported zero vulnerabilities.

## Verification results

| Check                                              | Result                                                                                                                                                                                                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend tests (`npm.cmd test`)                    | Passed: 39 tests across 4 files.                                                                                                                                                                                                                                                      |
| Backend tests (`cd backend; npm.cmd test`)         | Passed: 13 tests.                                                                                                                                                                                                                                                                     |
| Frontend production build                          | Passed with `VITE_API_BASE_URL=https://api.example.invalid`; this placeholder is not a deployable API.                                                                                                                                                                                |
| Production build URL validation                    | Missing URL was rejected; HTTP and HTTPS-with-path values were rejected.                                                                                                                                                                                                              |
| Frontend dependency audit (`npm.cmd audit`)        | 0 vulnerabilities.                                                                                                                                                                                                                                                                    |
| Backend dependency audit (`backend\npm.cmd audit`) | 0 vulnerabilities after the `nodemon` update. The production-only audit also reported 0.                                                                                                                                                                                              |
| Full lint (`npm.cmd run lint`)                     | Not clean: 10 Prettier errors and 8 warnings. Errors were reported in `backend/scripts/test-email.js`, `backend/src/services/mailer.js`, and `src/routes/admin_.customers.tsx`. Warnings include existing Fast Refresh and hook-dependency diagnostics. No broad auto-format was run. |
| Browser checks                                     | `/customize` was checked at 320, 360, 375, 390, 430, 768, and 1280 px. `/`, `/products`, and `/customize` were also checked at 320 and 1280 px: no horizontal overflow, broken images, or page exceptions were observed. This was browser emulation, not physical-device testing.     |
| Local API checks                                   | Health endpoint returned 200; unauthenticated order, profile, and admin-order requests returned 401.                                                                                                                                                                                  |
| Local CORS preflight                               | Returned 204, but the response allowed `http://localhost:8080` while the test request came from `http://127.0.0.1:8081`. Production CORS was not verified.                                                                                                                            |
| Diff whitespace check                              | `git diff --check` passed.                                                                                                                                                                                                                                                            |

The browser used an intentionally unreachable local API URL to avoid using the unknown configured backend. These browser checks therefore do not verify authenticated or server-backed storefront behavior.

## Launch blockers and required checks

1. **OTP storage schema is not included in repository migrations.** [backend/src/routes/auth.js](./backend/src/routes/auth.js) reads and writes `pending_signup_otps` and `password_reset_otps`, but no migration in `supabase/migrations/` creates them. Confirm the tables, columns, constraints, expiry behavior, indexes, and access controls in the staging project. If they do not exist, add and apply a migration before testing signup and password reset.
2. **Payment setup can fail after order creation.** [backend/src/routes/orders.js](./backend/src/routes/orders.js) persists the order and [the checkout migration](./supabase/migrations/20261018000000_orders_checkout.sql) decrements stock before Razorpay order creation and payment-method linking finish. A provider or follow-up database failure can leave an unpaid order and consumed stock even though checkout returns an error. Add a reliable pending-payment/idempotency and recovery or compensation flow, then test provider and database failure cases before accepting customer orders.
3. **Live schema, RLS, and Storage policies are unverified.** Confirm the account/profile, saved-design, design-asset, order, and private `customer-design-assets` setup in a dedicated Supabase staging project. Apply the documented migrations in order and verify ownership boundaries and admin access using separate customer/admin accounts.
4. **Production environment and routing are unverified.** Configure the storefront HTTPS API origin and the API's exact HTTPS `FRONTEND_URL`; verify CORS, hosting, TLS, trusted proxy hops, API health, and Razorpay webhook delivery in staging. No deployment manifests or confirmed production service configuration were validated.
5. **Customer workflows were not end-to-end tested.** In staging, verify signup and password reset, uploads and saved-design ownership, cart and order snapshots, COD confirmation, manual UPI verification, Razorpay success/failure/webhook handling, admin permissions, and customer order tracking. Do not use the current unconfirmed `.env` target for these tests.
6. **Shipping and tax are currently zero.** Configure the business rules and verify the payable total and customer-facing disclosures before launch.
7. **Lint must be made clean.** Resolve the currently reported formatting errors and review the warnings, then rerun lint and the test/build checks.

## Recommended next milestone

Use a dedicated staging Supabase project and test payment credentials. Resolve the post-order payment failure/retry behavior, confirm or migrate the OTP schema, configure shipping/tax and production-like HTTPS/CORS settings, and run the complete customer-to-admin checkout scenarios. Re-audit the deployed staging system before making a production launch decision.
