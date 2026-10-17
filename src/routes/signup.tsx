import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/features/storefront/auth-form";
import { pageHead } from "@/lib/api/storefront";
export const Route = createFileRoute("/signup")({
  head: () =>
    pageHead(
      "Join the studio",
      "Preview your Bhasi Gift Studio sign-up form. Account creation is pending integration.",
    ),
  component: () => <AuthForm signup />,
});
