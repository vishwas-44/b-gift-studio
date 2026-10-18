import mug from "@/assets/white-mug.jpg";
import sipper from "@/assets/sipper.jpg";
import pillow from "@/assets/pillow.jpg";
import shirt from "@/assets/t-shirt.jpg";
import magic from "@/assets/magic-mug.jpg";
import cards from "@/assets/portrait-cards.jpg";

export type Category = "All gifts" | "Mugs" | "Sippers" | "Cushions" | "Apparel" | "Photo gifts";
export interface Product {
  id: string;
  name: string;
  subtitle: string;
  price: number;
  category: Category;
  image: string;
  badge?: string;
  description: string;
  variants: [string, ...string[]];
  occasions: string[];
}
// Fallback catalogue used while the storefront API is unavailable.
export const products: Product[] = [
  {
    id: "white-mug",
    name: "Normal white mug",
    subtitle: "A little love in every sip",
    price: 279,
    category: "Mugs",
    image: mug,
    badge: "Bestseller",
    description:
      "Their favourite photo. An inside joke. A name that means everything. Turn an everyday white ceramic mug into a little reminder of you.",
    variants: ["White"],
    occasions: ["Birthday", "Anniversary", "Just because"],
  },
  {
    id: "sipper",
    name: "600 ml still sipper",
    subtitle: "Good memories, on the go",
    price: 759,
    category: "Sippers",
    image: sipper,
    badge: "Everyday favourite",
    description:
      "Make every water break a little more personal with your photo, a name, or your own artwork on a 600 ml sipper.",
    variants: ["White · 600 ml"],
    occasions: ["Birthday", "For friends", "Just because"],
  },
  {
    id: "pillow",
    name: "Pillow",
    subtitle: "A hug they can keep",
    price: 449,
    category: "Cushions",
    image: pillow,
    badge: "Made for your person",
    description:
      "A cosy canvas for your favourite people and most-loved moments. Add a photo and a few words that feel like home.",
    variants: ["White"],
    occasions: ["Anniversary", "Birthday", "Just because"],
  },
  {
    id: "t-shirt",
    name: "T-shirt",
    subtitle: "Wear a little personality",
    price: 349,
    category: "Apparel",
    image: shirt,
    description:
      "The best stories deserve to be worn. Create a personal tee with your own photo, name, or a message only your people understand.",
    variants: ["S", "M", "L", "XL"],
    occasions: ["Birthday", "For friends", "Just because"],
  },
  {
    id: "magic-mug",
    name: "Magic mug",
    subtitle: "A surprise with every warm sip",
    price: 449,
    category: "Mugs",
    image: magic,
    badge: "A little magic",
    description:
      "Give your memories a magical reveal. A personalised heat-sensitive mug designed for a warm little surprise.",
    variants: ["Black"],
    occasions: ["Anniversary", "Birthday", "Just because"],
  },
  {
    id: "portrait-cards",
    name: "Portrait cards",
    subtitle: "20 photos. Countless memories.",
    price: 149,
    category: "Photo gifts",
    image: cards,
    description:
      "Your camera roll, made tangible. Turn 20 favourite photos into individual, full-resolution portrait photo cards.",
    variants: ["Set of 20 photos"],
    occasions: ["Anniversary", "For friends", "Just because"],
  },
];
export const categories: Category[] = [
  "All gifts",
  "Mugs",
  "Sippers",
  "Cushions",
  "Apparel",
  "Photo gifts",
];
export const currency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
export const getProduct = (id: string) => products.find((product) => product.id === id);
export type CatalogueFilter = {
  search?: string | undefined;
  category?: string | undefined;
  occasion?: string | undefined;
  sort?: string | undefined;
};
export function filterProducts(filter: CatalogueFilter) {
  const query = (filter.search || "").trim().toLowerCase();
  const result = products.filter(
    (p) =>
      (!query || `${p.name} ${p.subtitle} ${p.category}`.toLowerCase().includes(query)) &&
      (!filter.category || filter.category === "All gifts" || p.category === filter.category) &&
      (!filter.occasion || p.occasions.includes(filter.occasion)),
  );
  if (filter.sort === "price-asc") result.sort((a, b) => a.price - b.price);
  if (filter.sort === "price-desc") result.sort((a, b) => b.price - a.price);
  return result;
}
