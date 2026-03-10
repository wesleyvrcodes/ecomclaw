"use client";

import Link from "next/link";
import { Bot, Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center px-4 text-center">
      <Bot className="h-16 w-16 text-zinc-700 mb-6" />
      <h1 className="text-6xl font-bold text-white mb-2">404</h1>
      <p className="text-lg text-zinc-400 mb-8">
        This page doesn&apos;t exist or has been moved.
      </p>
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-[#27272a]">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </Link>
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
