"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center px-4 text-center">
      <div className="bg-red-500/10 p-4 rounded-2xl mb-6">
        <AlertTriangle className="h-10 w-10 text-red-500" />
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">Something went wrong</h1>
      <p className="text-sm text-zinc-400 mb-8 max-w-md">
        An unexpected error occurred. Try refreshing the page or go back to the dashboard.
      </p>
      <div className="flex items-center gap-3">
        <Button onClick={reset} variant="outline" className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-[#27272a]">
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
        <Button asChild className="bg-blue-500 hover:bg-blue-600 text-white">
          <Link href="/dashboard">
            <Home className="h-4 w-4" />
            Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
