// ============================================================
// Execution Tracker — Offline Page Route
// ============================================================

import { Card, CardContent } from "@/components/ui/card";
import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardContent className="py-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
            <WifiOff className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="mt-6 text-xl font-bold">You are offline</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Reconnect to the internet to continue using Execution Tracker. Your
            tasks and submissions will be available once you&apos;re back online.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-xs text-gray-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Waiting for connection
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
