// ============================================================
// Execution Tracker — Root Layout (PWA Enabled)
// ============================================================
// Amendment: Added PWA metadata links for installability.
// All existing layout logic (auth, nav, error boundary) is unchanged.

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Nav } from "@/components/nav";
import { ErrorBoundary } from "@/components/error-boundary";
import { getCurrentUser } from "@/lib/auth";
import { validateEnv } from "@/lib/env";
import "./globals.css";

// Validate environment variables at startup
if (typeof window === "undefined") {
  validateEnv();
}

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

// ============================================================
// PWA METADATA
// ============================================================

export const metadata: Metadata = {
  title: "Execution Tracker",
  description: "Lightweight accountability for startup teams",
  // Link to the web app manifest
  manifest: "/manifest.json",
  // Apple-specific metadata for iOS home screen
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ExecTracker",
  },
  // Prevent search engines from indexing internal tools
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#111827",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// ============================================================
// LAYOUT COMPONENT
// ============================================================

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <html lang="en" className={inter.className}>
      <head>
        {/* Apple touch icon — used when adding to iOS home screen */}
        <link
          rel="apple-touch-icon"
          href="/icons/icon-192x192.png"
          sizes="192x192"
        />
      </head>
      <body className="min-h-screen bg-gray-50">
        <Nav user={user} />
        <ErrorBoundary>
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </ErrorBoundary>
      </body>
    </html>
  );
}
