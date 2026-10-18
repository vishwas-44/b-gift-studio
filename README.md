# Bhasi Gift Studio

Personalized-gifting storefront built with React, TypeScript, TanStack Start, Tailwind and an Express API backed by Supabase. The storefront supports customer accounts, saved designs, order placement with Cash on Delivery, manual UPI QR or Razorpay, and an administrator dashboard. Live deployment still needs the environment and service setup listed below.

## Project structure

- `src/routes/`: storefront, account, checkout and admin pages using TanStack file routes.
- `src/features/storefront/`: shared storefront shell, cart, product cards, customizer and IndexedDB design storage.
- `src/lib/api/`: typed browser API adapters.
- `src/data/catalogue.ts`: fallback product catalogue and imagery.
- `backend/src/routes/`: Express API endpoints for auth, orders, account, artwork, AI, analytics and admin.
- `backend/src/middleware/`: authentication and admin authorization.
- `backend/src/services/`: payment, email, shipment validation and product variant services.
- `supabase/migrations/`: required database schema and database functions, applied in filename order.

The cart stores product and design references only. Browser saved designs use IndexedDB; signed-in designs and uploaded artwork use the backend and private Supabase Storage. Admin artwork links are short-lived signed URLs.

## Local development

1. Install dependencies with `npm ci` in the project root and `npm ci` in `backend/`.
2. Create `backend/.env` from `backend/.env.example`; fill Supabase URL, anon key and service-role key. Keep service-role and payment keys on the backend only.
3. Configure `VITE_API_BASE_URL` in `.env.local` to the local API origin if it is not `http://localhost:5000`.
4. Start API with `npm run dev` from `backend/`; start storefront with `npm run dev` from the project root.

## Supabase setup

Apply these migrations in order in the Supabase SQL Editor:

1. `20261018000000_orders_checkout.sql`
2. `20261018010000_correct_product_variants.sql`
3. `20261018020000_manual_courier_tracking.sql`
4. `20261018030000_traction_analytics.sql`
5. `20261018040000_razorpay_checkout.sql`
6. `20261018050000_link_order_artwork.sql`
7. `20261018060000_customer_feedback.sql`
8. `20261018070000_courier_bill_tracking.sql`
9. `20261018080000_manual_upi_qr_payment.sql`

The account, `profiles`, `saved_designs` and `design_assets` schema and the private `customer-design-assets` Storage bucket must also exist with the expected policies. Verify these in the target Supabase project; they are not all created by the migrations in this repository. Assign the `admin` role only to trusted staff. Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser or build variables.

## Deployment configuration

Deploy the TanStack storefront and Express API as separate services unless the hosting platform explicitly supports both. Configure:

- Storefront: `VITE_API_BASE_URL` pointing to the HTTPS API URL.
- API: `NODE_ENV=production`, `FRONTEND_URL` set to the storefront origin (HTTPS, no path), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, a random `OTP_HASH_SECRET` of at least 32 characters, and the SMTP variables shown in `backend/.env.example`. If the API sits behind a reverse proxy, set `TRUST_PROXY_HOPS` to the exact number of trusted proxy hops so request IP rate limits work correctly; never set blanket proxy trust.
- Razorpay: test `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` first. Set the provider webhook to `/api/webhooks/razorpay` and subscribe to `payment.captured`. Use live keys only after test verification and explicit business approval.
- Manual UPI QR: set `UPI_QR_IMAGE_URL` to the public HTTPS URL of the merchant QR image and `MERCHANT_UPI_ID` to the matching merchant UPI ID. Customers submit their UPI transaction reference; an admin must verify the transfer in the bank account and mark it paid. Never treat a customer-provided reference or payment screenshot as proof of receipt.
- AI image generation: `OPENAI_API_KEY` on the backend if AI tools are offered. Never put it in a `VITE_` variable.
- Email/OTP: set the SMTP and sender values required by `backend/src/services/mailer.js` and verify signup and password-reset delivery.

Do not deploy with placeholder values from `.env.example`. Confirm HTTPS, allowed CORS origin, webhook delivery, backend health, and required migrations before opening checkout to customers.

## Current limitations and launch checklist

- Shipping and tax are currently zero and are not configured. Add the correct rules and show the final payable amount before launch.
- COD, manual UPI QR and Razorpay are supported in the code. Manual QR payments remain unpaid until an administrator verifies the transaction reference against the bank account. Net banking, UPI, cards and wallets are presented by Razorpay according to the merchant account configuration; verify enabled modes in Razorpay test checkout.
- Courier updates are entered by an administrator; no carrier API is connected. Confirm the team can fulfill orders and contact customers using the required phone number.
- Product photos are illustrative and customizer previews are not print proofs. Confirm product print areas, artwork output resolution, card layouts, packaging and print/fulfillment operations.
- AI features require a valid backend OpenAI key and have per-user rate limits. Verify cost limits, consent and customer image retention before enabling them publicly.
- Review privacy, terms, cancellation/returns, shipping, tax invoices and customer support policies for the markets where the store will operate.
- Admin and account access depend on the existing Supabase `profiles` and role schema. Confirm database RLS, Storage policies and staff roles in the production project.
- Existing order items with an empty `customization_snapshot` have no artwork reference to recover.
- Customer feedback is submitted from the signed-in account profile and reviewed under the separate admin Feedback module.

## Verification

```sh
npm run build
npm test
npm run lint
```

Run backend tests with `npm test` from `backend/`. The optional SMTP utility only sends a message when explicitly invoked with `npm run email:check -- --send`. Perform an end-to-end checkout in Razorpay test mode and verify COD, payment failure, webhook payment capture, admin permissions, artwork download and order tracking in the deployed staging environment before production.
