import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Gift,
  Heart,
  Menu,
  Moon,
  Search,
  ShoppingBag,
  Sparkles,
  Sun,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { categories } from "@/data/catalogue";
import { useStore } from "./store-context";
import { CartContent } from "./cart-content";
export function Brand({ footer = false }: { footer?: boolean }) {
  return (
    <Link
      to="/"
      className={`brand ${footer ? "brand-footer" : ""}`}
      aria-label="Bhasi Gift Studio home"
    >
      <span className="brand-symbol">
        <Gift size={28} strokeWidth={1.5} />
        <Heart size={11} className="brand-heart" fill="currentColor" />
      </span>
      <span>
        <span className="brand-name">
          bhasi<span className="text-primary">.</span>
        </span>
        <span className="brand-subtitle">GIFT STUDIO</span>
      </span>
    </Link>
  );
}
export function SiteShell({ children }: { children: ReactNode }) {
  const store = useStore();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    navigate({ to: "/products", search: { search } });
  };
  return (
    <>
      <div className="announcement">
        <span>A photo. A name. A whole lot of love.</span>
        <Heart size={11} fill="currentColor" />
        <span className="hidden sm:inline">Made personal, just for you.</span>
      </div>
      <header className="site-header">
        <div className="container header-main">
          <Brand />
          <form className="header-search" onSubmit={submitSearch} role="search">
            <Search size={18} />
            <input
              aria-label="Search gifts"
              placeholder="Find a little something special…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>⌕</kbd>
          </form>
          <div className="header-actions">
            <Button
              variant="ghost"
              size="icon"
              title={store.dark ? "Switch to light theme" : "Switch to charcoal theme"}
              aria-label="Toggle color theme"
              onClick={store.toggleTheme}
            >
              {store.dark ? <Sun /> : <Moon />}
            </Button>
            <Button variant="ghost" size="icon" asChild title="My account">
              <Link to="/account" aria-label="My account">
                <UserRound />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="cart-trigger"
              onClick={() => store.setCartOpen(true)}
              title="Open shopping bag"
              aria-label={`Shopping bag, ${store.count} items`}
            >
              <ShoppingBag />
              {store.count > 0 && <span className="cart-count">{store.count}</span>}
            </Button>
            <Button
              className="mobile-menu-button"
              variant="ghost"
              size="icon"
              aria-label="Open menu"
              onClick={() => setMenu(true)}
            >
              <Menu />
            </Button>
          </div>
        </div>
        <nav className="desktop-nav container" aria-label="Main navigation">
          <div className="nav-links">
            <Link to="/products" search={{}} activeProps={{ className: "nav-active" }}>
              All gifts
            </Link>
            {categories.slice(1).map((category) => (
              <Link key={category} to="/products" search={{ category }}>
                {category}
              </Link>
            ))}
            <Link to="/products" search={{ occasion: "Birthday" }}>
              By occasion
            </Link>
          </div>
          <Link to="/customize" search={{}} className="nav-custom">
            <Sparkles size={14} />
            Create your own <ArrowRight size={14} />
          </Link>
        </nav>
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        <div className="container footer-grid">
          <div>
            <Brand footer />
            <p className="mt-5 max-w-xs text-sm leading-7 text-muted-foreground">
              For the big days, the little moments,
              <br />
              and the people who make them matter.
            </p>
            <p className="mt-4 text-xs text-primary">Made personal. Made with love. ♡</p>
          </div>
          <div>
            <h3>Find their little something</h3>
            <Link to="/products" search={{}}>
              All gifts
            </Link>
            <Link to="/products" search={{ category: "Mugs" }}>
              Personalized mugs
            </Link>
            <Link to="/products" search={{ category: "Photo gifts" }}>
              Photo gifts
            </Link>
            <Link to="/customize" search={{}}>
              Create your own
            </Link>
          </div>
          <div>
            <h3>Your studio</h3>
            <Link to="/account">My account</Link>
            <Link to="/designs">Saved designs</Link>
            <Link to="/cart">Your bag</Link>
            <Link to="/login">Log in</Link>
            <Link to="/signup">Join the studio</Link>
          </div>
          <div className="footer-note">
            <Heart size={23} />
            <h3>A little more you.</h3>
            <p>
              Turn a favourite memory into
              <br />
              their new favourite thing.
            </p>
            <span className="demo-tag">Frontend demo · Made in India</span>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} Bhasi Gift Studio</span>
          <span>Little things. Lasting memories.</span>
          <span>Demo catalogue · Illustrative product images</span>
        </div>
      </footer>
      <Sheet open={store.cartOpen} onOpenChange={store.setCartOpen}>
        <SheetContent className="cart-sheet">
          <SheetTitle className="text-xl">
            Your bag <span className="text-muted-foreground">({store.count})</span>
          </SheetTitle>
          <SheetDescription>A few little things, a lot of meaning. Demo cart.</SheetDescription>
          <CartContent close={() => store.setCartOpen(false)} />
        </SheetContent>
      </Sheet>
      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="left">
          <SheetTitle>Bhasi Gift Studio</SheetTitle>
          <SheetDescription>Little things. Lasting memories.</SheetDescription>
          <form
            className="mobile-search"
            onSubmit={(e) => {
              submitSearch(e);
              setMenu(false);
            }}
          >
            <input
              placeholder="Search gifts…"
              aria-label="Search gifts in menu"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button size="icon" aria-label="Search" type="submit">
              <Search />
            </Button>
          </form>
          <nav className="mobile-nav" aria-label="Mobile navigation">
            {categories.map((category) => (
              <Link
                key={category}
                to="/products"
                search={{ category }}
                onClick={() => setMenu(false)}
              >
                {category}
                <ArrowRight size={16} />
              </Link>
            ))}
            <Link to="/customize" search={{}} onClick={() => setMenu(false)}>
              Create your own
              <Sparkles size={16} />
            </Link>
            <Link to="/designs" onClick={() => setMenu(false)}>
              Saved designs
              <Sparkles size={16} />
            </Link>
            <Link to="/account" onClick={() => setMenu(false)}>
              My account
              <UserRound size={16} />
            </Link>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
