import { createFileRoute } from "@tanstack/react-router";
import { AuthForm } from "@/features/storefront/auth-form";
import { pageHead } from "@/lib/api/storefront";
export const Route = createFileRoute("/login")({
  head: () =>
    pageHead(
      "Welcome back",
      "Preview the Bhasi Gift Studio login form. Authentication integration is pending.",
    ),
  component: () => <AuthForm />,
});
