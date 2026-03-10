"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Key, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

const settingsTabs = [
  { href: "/dashboard/settings/account", label: "Account", icon: User },
  { href: "/dashboard/settings/api", label: "API & Model", icon: Key },
  { href: "/dashboard/settings/billing", label: "Billing", icon: CreditCard },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Manage your account, API keys, and billing
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 border-b border-[#27272a] pb-px">
        {settingsTabs.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px",
              isActive(href)
                ? "text-blue-400 border-blue-500 bg-blue-500/5"
                : "text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-zinc-800/50"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </div>

      <div className="max-w-2xl">{children}</div>
    </div>
  );
}
