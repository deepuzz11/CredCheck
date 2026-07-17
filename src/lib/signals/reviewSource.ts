/**
 * Review data source interface.
 *
 * Deliberately isolated from the sentiment-analysis logic so the mock
 * implementation below can be swapped for a real scraper/API later without
 * touching `reviewSentiment.ts` at all.
 */

export interface RawReview {
  text: string;
  /** star rating 1–5, when the source provides one */
  rating?: number;
}

export interface ReviewSource {
  fetchReviews(input: { normalizedKey: string; domain?: string; handle?: string }): Promise<
    RawReview[]
  >;
}

/**
 * Deterministic mock source: derives a plausible-looking review set from the
 * input key (no network, no key). This exists purely so the sentiment module
 * is exercised end-to-end during the MVP; swap `mockReviewSource` for a real
 * `ReviewSource` implementation once a scraper/API is wired up.
 */
function seededRandom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 1000) / 1000;
  };
}

const POSITIVE_SNIPPETS = [
  "Fast shipping and exactly as described, would buy again.",
  "Great customer service, they resolved my issue quickly.",
  "Product quality exceeded my expectations.",
  "Smooth checkout and arrived earlier than expected.",
  "Been ordering from them for a year, always reliable.",
];
const NEGATIVE_SNIPPETS = [
  "Never received my order and support went silent.",
  "Item was completely different from the listing photos.",
  "Charged twice and refund still hasn't come through.",
  "Packaging was damaged and customer service was unhelpful.",
  "Tracking number never updated, feels like a scam.",
];
const NEUTRAL_SNIPPETS = [
  "Order arrived on time, nothing special either way.",
  "It's fine, does what it says.",
  "Average experience, would consider ordering again.",
];

export const mockReviewSource: ReviewSource = {
  async fetchReviews({ normalizedKey }) {
    const rand = seededRandom(normalizedKey);
    const count = 8 + Math.floor(rand() * 8); // 8–15 reviews

    // Bias the mix based on the seed so different inputs produce visibly
    // different (but stable) sentiment/uniformity patterns in the demo.
    const positivity = rand();
    const suspiciouslyUniform = rand() > 0.7;

    const reviews: RawReview[] = [];
    for (let i = 0; i < count; i++) {
      const roll = rand();
      if (suspiciouslyUniform) {
        // Nearly all 5-star, near-identical phrasing — a common fake-review pattern.
        reviews.push({
          text: POSITIVE_SNIPPETS[Math.floor(rand() * POSITIVE_SNIPPETS.length)],
          rating: 5,
        });
        continue;
      }
      if (roll < positivity * 0.6) {
        reviews.push({
          text: POSITIVE_SNIPPETS[Math.floor(rand() * POSITIVE_SNIPPETS.length)],
          rating: 4 + Math.round(rand()),
        });
      } else if (roll < positivity * 0.6 + 0.25) {
        reviews.push({
          text: NEUTRAL_SNIPPETS[Math.floor(rand() * NEUTRAL_SNIPPETS.length)],
          rating: 3,
        });
      } else {
        reviews.push({
          text: NEGATIVE_SNIPPETS[Math.floor(rand() * NEGATIVE_SNIPPETS.length)],
          rating: 1 + Math.round(rand()),
        });
      }
    }
    return reviews;
  },
};
