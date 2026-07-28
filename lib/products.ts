export type Product = {
  id: string;
  name: string;
  description: string;
  /** Amount in the smallest currency unit — cents. $19.00 => 1900. */
  amount: number;
  currency: string;
  emoji: string;
};

// A tiny hard-coded catalog. In a real app this lives in your database, and the
// price is ALWAYS looked up on the server — never trusted from the request body.
export const PRODUCTS: Product[] = [
  {
    id: "sticker-pack",
    name: "Sticker Pack",
    description: "12 vinyl stickers. The cheapest way to test a card.",
    amount: 500,
    currency: "usd",
    emoji: "🎨",
  },
  {
    id: "coffee-beans",
    name: "Coffee Beans, 1kg",
    description: "Single origin. Ground or whole bean.",
    amount: 2400,
    currency: "usd",
    emoji: "☕",
  },
  {
    id: "mechanical-keyboard",
    name: "Mechanical Keyboard",
    description: "65% layout, hot-swappable switches.",
    amount: 12900,
    currency: "usd",
    emoji: "⌨️",
  },
];

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function formatAmount(amount: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}
