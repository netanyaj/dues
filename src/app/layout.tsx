import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteAnalytics } from "@/components/analytics";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Geist, chosen on purpose (DECISIONS.md D27): true tabular figures for columns of rupees,
// a ₹ glyph drawn to match, and it stays legible at 12–14px on low-end Android screens.
const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const description = "Ask Claude to draft a GST invoice. Check it and send it from Dues. Your client pays by bank transfer or UPI, and you see who still owes you.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: { default: "Dues · Invoices and payment follow-up for Indian freelancers", template: "%s · Dues" },
  description,
  applicationName: "Dues",
  openGraph: { type: "website", siteName: "Dues", title: "Dues · Invoice from Claude. Get paid on time.", description, locale: "en_IN" },
  twitter: { card: "summary_large_image", title: "Dues · Invoice from Claude. Get paid on time.", description },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#17151c" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${geist.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:shadow">Skip to content</a>
        {children}
        <Toaster position="top-center" closeButton />
        {/* Page views and Core Web Vitals only. Product metrics come from the events table (METRICS.md). */}
        <SiteAnalytics />
      </body>
    </html>
  );
}
