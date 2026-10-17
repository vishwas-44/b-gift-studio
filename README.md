# Bhasi Gift Studio — Frontend milestone

Personalized-gifting storefront for the hackathon. Built with the Lovable scaffold: React 19, TypeScript, TanStack Start, Tailwind v4 and shadcn/ui. **No backend is connected.**

## Run
```sh
bun install
bun run dev      # development server
bun run test     # Vitest
bun run build    # production build (run outside the Lovable editing harness)
```

## Routes
- `/`: homepage, occasions, featured categories and gifts
- `/products`: catalogue with `search`, `category`, `occasion`, `sort` query parameters
- `/products/$productId`: product details, variants and quantity
- `/customize?product=white-mug`: one editor with normal, AI Design and AI Photo Transform modes
- `/customize?designId=<id>`: restores a saved local design, including its product and variant
- `/designs`: browser-only saved designs with previews, edit/reuse and confirmed deletion
- `/cart`: local shopping bag; drawer also available in header
- `/checkout`: demo summary only; no payment or order
- `/login`, `/signup`: validation-only forms; no account created or sign-in
- `/account`: guest account and order-history placeholder

## Files & boundaries
- `src/data/catalogue.ts`: all six products and canonical INR prices, filters and image imports
- `src/lib/api/storefront.ts`: replaceable data adapter, explicit unavailable capabilities and shared page metadata
- `src/features/storefront/`: reusable shell, product cards, cart model/provider/views, auth form and customizer
- `src/features/storefront/design-storage.ts`: typed IndexedDB adapter, metadata validation and storage failure messages
- `src/features/storefront/design-preview.tsx`: local saved-design preview using separate photo/text layers
- `src/styles.css`: semantic light/charcoal tokens, typography, responsive layouts
- `src/test/storefront.test.ts`: catalogue/pricing/cart regression tests
- `src/test/design-storage.test.ts`: IndexedDB save/read/update/delete, validation, cart reference privacy and failure tests
- `src/test/app-routing.test.tsx`: direct matching for all customer pages, including `/designs`

## Demo behaviour
Images are generated illustrative product visuals, not manufacturing references. Browsing, search, filtering, sorting, size selection, quantity edits, local bag feedback, dark-theme preference and mobile navigation work.
Cart rows persist in `bhasi-demo-cart-v1`. Rows are validated; price is always read from the catalogue. Personalized rows store only a `designId` plus cart metadata in localStorage, never images, text or prices. Saved records live in IndexedDB database `bhasi-local-designs-v1` with ID, name, product, variant, artwork data URL, independent text layers and update time. Save design commits before success feedback; Save & add to demo bag commits before adding a reference. Save a copy makes an independent reusable design. Editing a saved design updates its bag references (including product/variant); removing it leaves a safe missing-draft state without removing bag quantities. Unavailable browser storage offers retry guidance, while quota errors suggest deleting designs or smaller photos. Failed saves keep the current editor open and never add an unsaved design to the bag.

Saved designs survive refresh only in this browser/profile and origin; they are not uploaded, backed up, synced or print-ready. Clearing browser data deletes them; private browsing may restrict or discard them. Unsaved editor changes still disappear on refresh. JPG/PNG/WebP uploads support up to 8 MB. Text supports editing, size, colour, pointer drag and accessible position sliders. Product photo mockups retain their sample artwork and are not print proofs. Portrait cards show a single photo preview, not a finished 20-photo layout. Existing older bag rows without a design reference cannot recover previously lost artwork.
Auth checks form validity only, never sends/saves passwords or claims a session. AI prompts/styles/uploads stay local and no results are generated. Checkout never collects personal/payment details, clears the bag or creates an order. Tax/shipping are excluded and pending configuration.

## Integration handoff (teammate)
1. Replace the local catalogue adapter with typed Express API requests; add pending/error handling via route loaders and query caching when requests become asynchronous.
2. Connect authentication/session and protected profile/order reads; validate server-side and authorize with database policies. No admin keys in browser.
3. Replace/extend the local IndexedDB adapter with authenticated design storage and signed uploads, with consent, server-side size/type validation, lifecycle management and explicit migration from local records. Keep artwork and text layers separate; local IDs are not server authorization. No migration/upload occurs in this milestone.
4. Connect real AI prompt/style and photo-transform APIs; add progress, errors and authentic returned artwork only.
5. Connect server-validated variant availability, prices, shipping/tax calculation, payment and order creation. Verify payment via backend; never trust client totals.
6. Connect order history and real fulfilment state, print-area/product templates and 20-photo card layout.
No credentials, backend, Supabase client or private API keys are included.

## Manual test steps
1. Open home on desktop and mobile; navigate occasions/categories and search the catalogue. Sort prices.
2. Open a T-shirt, select L, increment quantity and add to bag; edit/remove in drawer and reload `/cart` to verify persistence.
3. Open `/customize?product=t-shirt&variant=L`, upload a small PNG/JPG, add/edit/colour/resize/drag text, name it and Save design. Refresh, open `/designs`, then Edit / reuse. Confirm the photo, text, T-shirt and L restore. Save a copy to keep a second independent draft if desired.
4. Save & add to demo bag, refresh `/cart`, confirm the photo/text summary and Edit design still work. Edit text, save, then return to the bag and check the updated summary. Delete that design from `/designs` with confirmation, refresh the bag and verify missing-draft feedback plus Create replacement design. Bag quantities and canonical prices remain unchanged.
5. Switch both AI tabs and check integration-pending feedback; no output is invented.
6. Review `/checkout`; verify the explicit no-order/no-payment status and unchanged bag.
7. Submit sample valid/invalid login/sign-up forms. Verify no session or account is claimed. Check guest account page and Saved designs link.
8. Toggle charcoal theme; check mobile menu, empty search/cart/design states and keyboard labels.

## Saved-design verification
- Small-slice recovery (2026-10-17): inspected the current files and confirmed the adapter, Save design, `/designs` previews/Edit/Delete and `/customize?designId=<id>` restoration were already implemented; no duplicate editor or storage adapter was created. Cart persistence, catalogue prices, theme and service integrations were not changed in this pass.
- Added two tests in `src/test/design-storage.test.ts` for optional artwork (text-only and photo-only designs) and quota rejection preserving the previously committed draft. Fresh `bunx vitest run`: **34 tests passed across three files**. Automatic build reported **build OK**; no manual build was run in the Lovable editing harness.
- Fresh browser check: photo + independent text → Save design → refresh → `/designs` preview → Edit restores T-shirt/L/photo/text → confirmed Delete → refresh stays deleted. No page errors or horizontal overflow on `/designs` and `/customize` at 375px and 320px. This check did not exercise the bag. Screenshots inspected for saved, restored, mobile and deleted states.
- To repeat this smaller slice, follow manual step 3, then delete the saved design on `/designs` and refresh to confirm it remains removed. Storage failure tests simulate unsupported IndexedDB and quota failure; real disk-full/private-mode behavior remains unverified.

Earlier full-milestone verification (not rerun as a cart flow in the small-slice recovery):
- All 32 Vitest tests passed, including eight new saved-design tests and `/designs` matching. The Lovable automatic build/typecheck passed; no manual build was run inside the editing harness.
- Playwright passed the actual photo + text → save → refresh → designs → restore T-shirt/L → add → refreshed cart → edit/save → updated summary → delete → refreshed missing-draft flow, with no page errors.
- No horizontal page overflow at 375px and 320px for `/cart`, `/designs` and `/customize`. Desktop screenshots checked the saved card, personalized bag and missing-draft state.
- Storage unavailable/quota feedback is covered by tests; real browser disk-full/private-mode behavior is not claimed as tested. Authentication, server storage, AI, payment and orders remain unconnected.
