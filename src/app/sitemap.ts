import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/about", "/stats", "/history", "/compare"].map((path) => ({
    url: `${BASE_URL}${path}`,
    changeFrequency: path === "/" ? "daily" : "weekly",
  }));
}
