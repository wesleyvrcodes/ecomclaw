"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  Bot,
  Store,
  ShoppingBag,
  MessageSquare,
  BarChart3,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronLeft,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/agents", label: "Agents", icon: Bot },
  { href: "/dashboard/store", label: "Agent Store", icon: ShoppingBag },
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard/stores", label: "Stores", icon: Store },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [isLoading, user, router]);

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    // Exact match or match with trailing slash/subpath to avoid /store matching /stores
    return pathname === href || pathname.startsWith(href + "/");
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-[#09090b] flex">
        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={cn(
            "fixed top-0 left-0 h-full bg-[#0a0a0a] border-r border-[#27272a] z-50 flex flex-col transition-all duration-300",
            collapsed ? "w-[68px]" : "w-64",
            mobileOpen
              ? "translate-x-0"
              : "-translate-x-full lg:translate-x-0"
          )}
        >
          {/* Header */}
          <div
            className={cn(
              "flex items-center h-16 px-4",
              collapsed ? "justify-center" : "justify-between"
            )}
          >
            {!collapsed && (
              <div className="flex items-center gap-2">
                <Bot className="h-6 w-6 text-blue-500 shrink-0" />
                <span className="text-lg font-bold text-white tracking-tight">
                  ClawCommerce
                </span>
              </div>
            )}
            {collapsed && <Bot className="h-6 w-6 text-blue-500" />}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setCollapsed(!collapsed);
                setMobileOpen(false);
              }}
              className="hidden lg:flex h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              <ChevronLeft
                className={cn(
                  "h-4 w-4 transition-transform",
                  collapsed && "rotate-180"
                )}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(false)}
              className="lg:hidden text-zinc-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <Separator className="bg-[#27272a]" />

          {/* Navigation */}
          <ScrollArea className="flex-1 py-4 px-3">
            <nav className="space-y-1">
              {navItems.map(({ href, label, icon: Icon }) => {
                const linkContent = (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      isActive(href)
                        ? "bg-blue-500/10 text-blue-500"
                        : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {!collapsed && <span>{label}</span>}
                  </Link>
                );

                if (collapsed) {
                  return (
                    <Tooltip key={href}>
                      <TooltipTrigger render={<span />}>
                        {linkContent}
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>{label}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return linkContent;
              })}
            </nav>
          </ScrollArea>

          {/* User area */}
          <Separator className="bg-[#27272a]" />
          <div className="p-3">
            <div
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg",
                collapsed && "justify-center"
              )}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {user.name}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">
                    {user.email}
                  </p>
                </div>
              )}
              {!collapsed && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={logout}
                  className="text-zinc-500 hover:text-white h-8 w-8"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main
          className={cn(
            "flex-1 transition-all duration-300 h-screen flex flex-col",
            collapsed ? "lg:ml-[68px]" : "lg:ml-64"
          )}
        >
          {/* Mobile header */}
          <div className="lg:hidden flex items-center h-16 px-4 border-b border-[#27272a] bg-[#0a0a0a]">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(true)}
              className="text-zinc-400 hover:text-white"
            >
              <Menu className="h-6 w-6" />
            </Button>
            <div className="flex items-center gap-2 ml-4">
              <Bot className="h-5 w-5 text-blue-500" />
              <span className="text-base font-bold text-white">
                ClawCommerce
              </span>
            </div>
          </div>

          <div className={cn(
            "flex-1 min-h-0 relative",
            pathname.startsWith("/dashboard/chat")
              ? "overflow-hidden"
              : "p-6 lg:p-8 overflow-auto"
          )}>{children}</div>
        </main>
      </div>
    </TooltipProvider>
  );
}
