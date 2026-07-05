// ============================================================
// Execution Tracker — Dashboard Layout
// ============================================================
// Wraps all dashboard pages.
// Registers the service worker for PWA functionality.

import { ServiceWorkerRegister } from "@/components/service-worker-register";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ServiceWorkerRegister />
      {children}
    </>
  );
}
