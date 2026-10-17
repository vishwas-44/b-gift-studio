import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Cake,
  Camera,
  Flower2,
  Heart,
  ImagePlus,
  PartyPopper,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import hero from "@/assets/gift-hero.jpg";
import { Button } from "@/components/ui/button";
import { categories } from "@/data/catalogue";
import { storefrontApi, pageHead } from "@/lib/api/storefront";
import { ProductCard } from "@/features/storefront/product-card";
export const Route = createFileRoute("/")({
  head: () =>
    pageHead(
      "Personalized gifts, made meaningful",
      "Personalize mugs, photo gifts, pillows and more with your favourite photos and names. Little things. Lasting memories.",
    ),
  component: Home,
});
function Home() {
  const [category, setCategory] = useState("All gifts");
  const featured = storefrontApi.listProducts({ category }).slice(0, 4);
  return (
    <>
      <section className="hero">
        <img
          src={hero}
          alt="Personalized photo mug, floral pillow, sipper, T-shirt and memories tied with red ribbons"
          width={1536}
          height={1024}
          className="hero-image"
          fetchPriority="high"
        />
        <div className="container hero-content">
          <div className="hero-eyebrow">
            <Heart size={12} />
            Thoughtful gifts. Uniquely yours.
          </div>
          <h1>
            Little things.
            <br />
            <span>Lasting memories.</span>
          </h1>
          <p>
            Turn your favourite photos, names, and inside jokes into gifts that feel a little more
            them.
          </p>
          <div className="hero-buttons">
            <Button size="lg" asChild>
              <Link to="/products" search={{}}>
                Find their perfect gift <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-foreground" asChild>
              <Link to="/customize" search={{}}>
                <Sparkles />
                Make it personal
              </Link>
            </Button>
          </div>
          <div className="hero-caption">
            <Heart size={12} /> A little something, made only for them.
          </div>
        </div>
      </section>
      <section className="studio-strip" aria-label="The Bhasi way">
        <div className="container studio-strip-inner">
          <div className="studio-strip-item">
            <ImagePlus />
            <div>
              <strong>Your photos, your stories</strong>
              <span>Memories worth making tangible</span>
            </div>
          </div>
          <div className="studio-strip-item">
            <WandSparkles />
            <div>
              <strong>Made personal, by you</strong>
              <span>A name, a photo, a little imagination</span>
            </div>
          </div>
          <div className="studio-strip-item">
            <Heart />
            <div>
              <strong>Thoughtful, not ordinary</strong>
              <span>For your one-in-a-million people</span>
            </div>
          </div>
        </div>
      </section>
      <section className="section container">
        <div className="section-heading">
          <div>
            <span className="eyebrow text-primary">Every moment deserves a little love</span>
            <h2>What are we celebrating?</h2>
          </div>
          <Link className="text-link" to="/products" search={{}}>
            Find a gift <ArrowRight size={15} />
          </Link>
        </div>
        <div className="occasion-grid">
          {[
            { name: "Birthday", copy: "Make their day, their way", icon: Cake, tone: "rose" },
            {
              name: "Anniversary",
              copy: "For your favourite love story",
              icon: Heart,
              tone: "lilac",
            },
            {
              name: "For friends",
              copy: "Your kind of wonderful",
              icon: PartyPopper,
              tone: "peach",
            },
            { name: "Just because", copy: "No occasion. Just love.", icon: Flower2, tone: "mint" },
          ].map(({ name, copy, icon: Icon, tone }) => (
            <Link
              to="/products"
              search={{ occasion: name }}
              key={name}
              className={`occasion-tile occasion-${tone}`}
            >
              <Icon />
              <div>
                <strong>{name}</strong>
                <span>{copy}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <section className="section featured-section container">
        <div className="section-heading">
          <div>
            <span className="eyebrow text-primary">Small gifts. Big feelings.</span>
            <h2>A few favourites, made yours</h2>
            <p>Everyday things. Extraordinary meaning.</p>
          </div>
          <Link to="/products" search={{}} className="text-link">
            Shop all gifts <ArrowRight size={15} />
          </Link>
        </div>
        <div className="category-tabs" aria-label="Featured gift categories">
          {categories.map((c) => (
            <Button
              key={c}
              variant={category === c ? "default" : "outline"}
              size="sm"
              onClick={() => setCategory(c)}
            >
              {c}
            </Button>
          ))}
        </div>
        <div className="product-grid">
          {featured.map((product) => (
            <ProductCard product={product} key={product.id} />
          ))}
        </div>
      </section>
      <section className="custom-band">
        <div className="container custom-band-inner">
          <div className="custom-band-icon">
            <Camera size={30} strokeWidth={1.3} />
          </div>
          <div>
            <span className="eyebrow text-primary">Your memory. Your masterpiece.</span>
            <h2>Something only you could give.</h2>
            <p>A favourite photo, a special name, a little bit of you. Let’s make it a gift.</p>
          </div>
          <Button size="lg" asChild>
            <Link to="/customize" search={{}}>
              Create your own <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
