<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Storefront architecture

- Use the existing TanStack Start file routes and a shared root storefront shell; this preserves SSR and type-safe navigation.
- Keep product values in the central catalogue and read through the storefront API adapter; a teammate can replace local reads with Express calls without rewriting views.
- Keep the cart in a shared React provider, hydrate storage after mount and validate persisted rows; localStorage contains only cart metadata and design references, never artwork or text.
- Store local saved artwork and independent text layers through the typed IndexedDB adapter; hydrate cart personalization from validated records, and keep deleted or unavailable references as safe missing drafts. This preserves browser-only editing across refresh without a backend.
- Keep customizer text layers and artwork as separate typed data; this allows later print preparation without flattening editable text.
- Frontend-only auth, AI and checkout never call services or manufacture success; integration capabilities are explicitly false until real services are connected.
- Use global semantic design tokens and shared UI controls for all storefront styling; customizer coordinates and chosen text properties are user data, not theme values.
