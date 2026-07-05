// ============================================================
// Execution Tracker — Service Worker Registration
// ============================================================

"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    // Guard: Only run in browser environments that support service workers
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Register the service worker
    // Uses the native API — no Workbox, no next-pwa
    async function registerServiceWorker() {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          // Scope to the entire app so the worker controls all pages
          scope: "/",
        });

        // Log successful registration in development
        if (process.env.NODE_ENV === "development") {
          console.log(
            "[PWA] Service worker registered:",
            registration.scope
          );
        }

        // Listen for updates to the service worker
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // New content is available — the user can refresh to get it
              if (process.env.NODE_ENV === "development") {
                console.log(
                  "[PWA] New content available — refresh to update"
                );
              }
            }
          });
        });
      } catch (error) {
        // Registration failed — log but don't block the app
        console.error("[PWA] Service worker registration failed:", error);
      }
    }

    registerServiceWorker();
  }, []);

  // This component renders nothing — it only runs the registration side effect
  return null;
}
