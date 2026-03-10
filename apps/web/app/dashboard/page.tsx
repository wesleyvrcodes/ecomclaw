"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Bot,
  Coins,
  ArrowRight,
  MessageSquare,
  BarChart3,
  Rocket,
  CheckCircle,
  Clock,
  Store,
  Loader2,
  Circle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface StoreItem {
  id: string;
  name: string;
  connected: boolean;
  agentCount: number;
}

interface Agent {
  id: string;
  name: string;
  type: string;
  status: string;
  storeId: string;
  storeName: string;
}

const quickActions = [
  {
    label: "Deploy Agent",
    icon: Rocket,
    href: "/dashboard/store",
    color: "bg-blue-500 hover:bg-blue-600",
  },
  {
    label: "Open Chat",
    icon: MessageSquare,
    href: "/dashboard/chat",
    color: "bg-zinc-800 hover:bg-zinc-700",
  },
  {
    label: "View Analytics",
    icon: BarChart3,
    href: "/dashboard/analytics",
    color: "bg-zinc-800 hover:bg-zinc-700",
  },
];

const storeColors = [
  "border-purple-500/30 bg-purple-500/5",
  "border-blue-500/30 bg-blue-500/5",
  "border-emerald-500/30 bg-emerald-500/5",
  "border-amber-500/30 bg-amber-500/5",
  "border-pink-500/30 bg-pink-500/5",
];

function getStoreCardColor(index: number) {
  return storeColors[index % storeColors.length];
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false);
    localStorage.setItem("clawcommerce_onboarding_seen", "true");
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [storesData, agentsData] = await Promise.all([
        api.get<StoreItem[]>("/stores").catch((): StoreItem[] => []),
        api.get<Agent[]>("/agents").catch((): Agent[] => []),
      ]);
      setStores(storesData);
      setAgents(agentsData);
      // Show onboarding only once — never again after dismissed
      const alreadySeen = localStorage.getItem("clawcommerce_onboarding_seen");
      if (!alreadySeen && storesData.length === 0 && agentsData.length === 0) {
        setShowOnboarding(true);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeAgentCount = agents.filter(
    (a) => a.status.toLowerCase() === "running"
  ).length;
  const storeCount = stores.length;

  const agentsByStore: Record<string, Agent[]> = {};
  agents.forEach((agent) => {
    const key = agent.storeName || "Unassigned";
    if (!agentsByStore[key]) agentsByStore[key] = [];
    agentsByStore[key].push(agent);
  });

  const stats = [
    {
      label: "Active Agents",
      value: loading ? "..." : String(activeAgentCount),
      icon: Bot,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Tasks Today",
      value: "0",
      icon: CheckCircle,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      label: "Tokens Used",
      value: "0",
      icon: Coins,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
    {
      label: "Stores",
      value: loading ? "..." : String(storeCount),
      icon: Store,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
  ];

  return (
    <div>
      {/* Onboarding Popup */}
      {showOnboarding && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Blurred backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={dismissOnboarding}
          />

          {/* Modal content */}
          <div className="relative z-10 w-full max-w-lg animate-in fade-in zoom-in-95 duration-300">
            <Card className="bg-[#0a0a0a] border-[#27272a] shadow-2xl shadow-blue-500/5 overflow-hidden">
              {/* Gradient top accent */}
              <div className="h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500" />

              <CardContent className="p-8">
                {/* Header */}
                <div className="text-center mb-8">
                  <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mb-5">
                    <Rocket className="h-8 w-8 text-blue-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">
                    Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}!
                  </h2>
                  <p className="text-zinc-400 text-sm leading-relaxed max-w-sm mx-auto">
                    Let&apos;s get your first AI agent running. It only takes 2
                    minutes to connect your store and deploy an agent.
                  </p>
                </div>

                {/* Steps preview */}
                <div className="space-y-3 mb-8">
                  {[
                    {
                      step: 1,
                      icon: Bot,
                      label: "Choose an AI agent",
                      desc: "Pick from product lister, ad optimizer, customer service & more",
                      color: "text-blue-500",
                      bg: "bg-blue-500/10",
                    },
                    {
                      step: 2,
                      icon: Store,
                      label: "Connect your Shopify store",
                      desc: "Secure OAuth connection with only the permissions needed",
                      color: "text-purple-500",
                      bg: "bg-purple-500/10",
                    },
                    {
                      step: 3,
                      icon: Rocket,
                      label: "Deploy & start chatting",
                      desc: "Your agent goes live instantly — talk to it in real-time",
                      color: "text-emerald-500",
                      bg: "bg-emerald-500/10",
                    },
                  ].map(({ step, icon: Icon, label, desc, color, bg }) => (
                    <div
                      key={step}
                      className="flex items-start gap-4 p-3 rounded-xl bg-[#09090b] border border-[#27272a]"
                    >
                      <div
                        className={cn(
                          "shrink-0 w-9 h-9 rounded-lg flex items-center justify-center",
                          bg
                        )}
                      >
                        <Icon className={cn("h-4.5 w-4.5", color)} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">
                          {label}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <Button
                  onClick={() => {
                    dismissOnboarding();
                    router.push("/dashboard/onboarding");
                  }}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold h-11 text-base"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>

                <button
                  onClick={dismissOnboarding}
                  className="w-full mt-3 text-center text-xs text-zinc-600 hover:text-zinc-400 transition-colors py-1"
                >
                  I&apos;ll set up later
                </button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Dashboard content */}
      <div className={cn(showOnboarding && "pointer-events-none")}>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}. Here&apos;s what your agents are up to.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map(({ label, value, icon: Icon, color, bgColor }) => (
            <Card key={label} className="bg-[#0a0a0a] border-[#27272a]">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={`${bgColor} p-2 rounded-lg`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-white">
                  {value === "..." ? (
                    <Loader2 className="h-6 w-6 text-zinc-600 animate-spin" />
                  ) : (
                    value
                  )}
                </p>
                <p className="text-sm text-zinc-400 mt-0.5">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Agents by Store */}
        {Object.keys(agentsByStore).length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-white">
                Agents by Store
              </h2>
              <Link
                href="/dashboard/agents"
                className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Object.entries(agentsByStore).map(
                ([storeName, storeAgents], index) => (
                  <Card
                    key={storeName}
                    className={cn("border", getStoreCardColor(index))}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Store className="h-4 w-4 text-zinc-400" />
                        <h3 className="text-sm font-semibold text-white">
                          {storeName}
                        </h3>
                        <Badge
                          variant="secondary"
                          className="ml-auto text-xs bg-transparent text-zinc-500 px-0"
                        >
                          {storeAgents.length} agent
                          {storeAgents.length !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        {storeAgents.slice(0, 4).map((agent) => (
                          <div
                            key={agent.id}
                            className="flex items-center gap-2 text-xs"
                          >
                            <Circle
                              className={cn(
                                "h-1.5 w-1.5 fill-current shrink-0",
                                agent.status.toLowerCase() === "running"
                                  ? "text-green-500"
                                  : agent.status === "error"
                                    ? "text-red-500"
                                    : "text-yellow-500"
                              )}
                            />
                            <span className="text-zinc-300 truncate">
                              {agent.name}
                            </span>
                            <span className="text-zinc-600 ml-auto shrink-0">
                              {agent.type}
                            </span>
                          </div>
                        ))}
                        {storeAgents.length > 4 && (
                          <p className="text-xs text-zinc-600">
                            +{storeAgents.length - 4} more
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              )}
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <Card className="bg-[#0a0a0a] border-[#27272a] mb-8">
          <CardHeader className="flex flex-row items-center justify-between px-5 py-4 border-b border-[#27272a]">
            <CardTitle className="text-base font-semibold text-white">
              Recent Activity
            </CardTitle>
            <Link
              href="/dashboard/analytics"
              className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-12 px-5">
            <Clock className="h-8 w-8 text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500">No recent activity</p>
            <p className="text-xs text-zinc-600 mt-1">
              Deploy an agent to get started
            </p>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div>
          <h2 className="text-base font-semibold text-white mb-4">
            Quick Actions
          </h2>
          <div className="flex flex-wrap gap-3">
            {quickActions.map(({ label, icon: Icon, href, color }) => (
              <Button
                key={label}
                asChild
                className={`${color} text-white font-medium border border-[#27272a]`}
              >
                <Link href={href}>
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
