import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { CartContent } from "@/features/storefront/cart-content";
import { pageHead } from "@/lib/api/storefront";
export const Route = createFileRoute("/cart")({
  head: () =>
    pageHead(
      "Your gift bag",
      "Review the gifts in your local demo cart and continue to demo checkout.",
    ),
  component: () => (
    <>
      <section className="page-heading">
        <div className="container">
          <div className="breadcrumb">
            <Link to="/">Home</Link>
            <ChevronRight size={12} />
            Your bag
          </div>
          <h1>A few little things. A lot of love.</h1>
          <p>
            Your gifts are saved on this browser. Saved design artwork and text stay only in this
            browser.
          </p>
        </div>
      </section>
      <div className="container cart-page">
        <CartContent />
      </div>
    </>
  ),
});
