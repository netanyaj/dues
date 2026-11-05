"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

// Client invoice links are unguessable on purpose (D7). Never send the real id to analytics.
const mask = (url: string) => url.replace(/\/i\/[0-9a-f]{16,}/i, "/i/[id]");

export function SiteAnalytics() {
  return (
    <>
      <Analytics beforeSend={(e) => ({ ...e, url: mask(e.url) })} />
      <SpeedInsights beforeSend={(e) => ({ ...e, url: mask(e.url) })} />
    </>
  );
}
