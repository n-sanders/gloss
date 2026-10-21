import type { MetadataRoute } from "next";

/** A private family library: no crawler is welcome anywhere. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
