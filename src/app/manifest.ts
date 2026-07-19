import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CredCheck — Can I Trust This Seller?",
    short_name: "CredCheck",
    description:
      "Multi-signal trust scanner for online sellers: paste a website, Instagram handle, or marketplace listing and get a plain-English trust assessment.",
    start_url: "/",
    display: "standalone",
    background_color: "#05070a",
    theme_color: "#05070a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
