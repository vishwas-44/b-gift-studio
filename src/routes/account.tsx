import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, PackageOpen, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/api/storefront";
export const Route = createFileRoute("/account")({
  head: () =>
    pageHead(
      "Your studio",
      "Your Bhasi Gift Studio account and orders. Authentication and order history are pending integration.",
    ),
  component: Account,
});
function Account() {
  return (
    <>
      <section className="page-heading">
        <div className="container">
          <span className="eyebrow text-primary">A space for your stories</span>
          <h1>Your studio.</h1>
          <p>Your people. Your gifts. Your favourite little moments.</p>
        </div>
      </section>
      <div className="container account-layout">
        <div className="account-section">
          <div className="flex items-center gap-3">
            <UserRound className="text-primary" />
            <h2>Make yourself at home.</h2>
          </div>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            You’re browsing as a guest. Profiles and account access will be available when
            authentication is connected.
          </p>
          <div className="mt-5 flex gap-3">
            <Button asChild>
              <Link to="/login">Preview login</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/signup">Preview sign up</Link>
            </Button>
          </div>
        </div>
        <div className="account-section">
          <h2>Your saved designs</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            Keep photo and text drafts only in this browser. No account or upload is involved; these
            are not print-ready files.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/designs">
              Open saved designs
              <ArrowRight />
            </Link>
          </Button>
        </div>
        <div className="account-section">
          <h2>Your orders</h2>
          <div className="empty-state">
            <PackageOpen size={42} strokeWidth={1.2} />
            <h2>A story waiting to begin.</h2>
            <p>
              Order history is not connected yet. Demo checkout does not create real orders or
              shipping updates.
            </p>
            <Button asChild variant="outline">
              <Link to="/products" search={{}}>
                Explore the collection
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
