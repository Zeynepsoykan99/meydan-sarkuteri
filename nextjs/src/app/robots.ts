import type { MetadataRoute } from "next";

/* robots.txt — Next.js metadata API'si ile üretiliyor.
   Panel, giriş ve API uçları indekslenmemeli. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/panel", "/giris", "/api/", "/afis"],
    },
    sitemap: "https://meydan-sarkuteri.vercel.app/sitemap.xml",
  };
}
