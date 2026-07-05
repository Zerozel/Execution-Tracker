// ============================================================
// Execution Tracker — Root Layout (Production Ready)
// ============================================================

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Nav } from "@/components/nav";
import { ErrorBoundary } from "@/components/error-boundary";
import { getCurrentUser } from "@/lib/auth";
import { validateEnv } from "@/lib/env";
import "./globals.css";

// Validate environment variables at startup
// This will throw immediately if configuration is missing
if (typeof window === "undefined") {
  validateEnv();
}

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Execution Tracker",
  description: "Lightweight accountability for startup teams",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <html lang="en" className={inter.className}>
      <body className="min-h-screen bg-gray-50">
        <Nav user={user} />
        <ErrorBoundary>
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </ErrorBoundary>
      </body>
    </html>
  );
}
