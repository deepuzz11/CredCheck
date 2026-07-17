import Sentiment from "sentiment";
import { runSignal, type SignalResult } from "./types";
import { mockReviewSource, type ReviewSource } from "./reviewSource";

/**
 * Step 6 — Review sentiment.
 *
 * Runs AFINN-based sentiment analysis (the `sentiment` package — free, MIT,
 * no API key) over a set of review texts, and separately flags suspiciously
 * uniform rating patterns (a common fake-review tell), since a seller can
 * have positive *sentiment* while still having implausibly uniform *ratings*.
 *
 * The review data source is injected so the mock generator in
 * `reviewSource.ts` can be swapped for a real scraper/API later.
 */

export interface ReviewSentimentData {
  review_count: number;
  average_sentiment: number; // comparative score, roughly -1..1 in practice
  positive_count: number;
  negative_count: number;
  neutral_count: number;
  average_rating: number | null;
  rating_stddev: number | null;
  suspiciously_uniform: boolean;
}

const sentiment = new Sentiment();

function stddev(nums: number[]): number {
  if (nums.length === 0) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

export async function checkReviewSentiment(
  key: { normalizedKey: string; domain?: string; handle?: string },
  source: ReviewSource = mockReviewSource,
): Promise<SignalResult<ReviewSentimentData>> {
  return runSignal<ReviewSentimentData>(
    { signal_name: "review_sentiment", label: "Review sentiment" },
    async () => {
      const reviews = await source.fetchReviews(key);

      if (reviews.length === 0) {
        return {
          status: "unavailable",
          data: {
            review_count: 0,
            average_sentiment: 0,
            positive_count: 0,
            negative_count: 0,
            neutral_count: 0,
            average_rating: null,
            rating_stddev: null,
            suspiciously_uniform: false,
          },
          notes: "No reviews were available to analyze.",
        };
      }

      let posCount = 0;
      let negCount = 0;
      let neutCount = 0;
      let comparativeSum = 0;
      const ratings: number[] = [];

      for (const r of reviews) {
        const result = sentiment.analyze(r.text);
        comparativeSum += result.comparative;
        if (result.comparative > 0.05) posCount++;
        else if (result.comparative < -0.05) negCount++;
        else neutCount++;
        if (typeof r.rating === "number") ratings.push(r.rating);
      }

      const avgSentiment = comparativeSum / reviews.length;
      const avgRating = ratings.length
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : null;
      const ratingStddev = ratings.length ? stddev(ratings) : null;

      // Very low spread + very high average rating is the classic
      // "all 5-star, near-identical phrasing" fake-review pattern.
      const suspiciouslyUniform =
        ratings.length >= 5 && ratingStddev !== null && ratingStddev < 0.3 && (avgRating ?? 0) >= 4.5;

      const data: ReviewSentimentData = {
        review_count: reviews.length,
        average_sentiment: Number(avgSentiment.toFixed(3)),
        positive_count: posCount,
        negative_count: negCount,
        neutral_count: neutCount,
        average_rating: avgRating !== null ? Number(avgRating.toFixed(2)) : null,
        rating_stddev: ratingStddev !== null ? Number(ratingStddev.toFixed(2)) : null,
        suspiciously_uniform: suspiciouslyUniform,
      };

      if (suspiciouslyUniform) {
        return {
          status: "flag",
          data,
          notes: `${reviews.length} reviews analyzed — ratings are suspiciously uniform (avg ${data.average_rating}★, stddev ${data.rating_stddev}), a pattern common in fake review sets.`,
        };
      }

      if (avgRating !== null && avgRating < 2.5) {
        return {
          status: "flag",
          data,
          notes: `${reviews.length} reviews analyzed — average rating is low (${data.average_rating}★).`,
        };
      }

      if (avgSentiment < -0.1 || negCount > posCount) {
        return {
          status: "flag",
          data,
          notes: `${reviews.length} reviews analyzed — sentiment skews negative (${negCount} negative vs ${posCount} positive).`,
        };
      }

      return {
        status: "ok",
        data,
        notes: `${reviews.length} reviews analyzed — sentiment is net positive (${posCount} positive, ${negCount} negative, ${neutCount} neutral)${
          avgRating !== null ? `, average rating ${data.average_rating}★` : ""
        }.`,
      };
    },
  );
}
