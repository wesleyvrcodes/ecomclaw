"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Users,
  Bot,
  Store,
  Server,
  Activity,
  DollarSign,
  AlertCircle,
  Circle,
  Loader2,
  RefreshCw,
  CreditCard,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// Admin emails are checked server-side via ADMIN_EMAILS env var.
// This client-side list only controls UI visibility; the API enforces access.
const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "").split(",").filter(Boolean);

interface AdminStats {
  totalUsers: number;
  totalAgents: number;
  totalStores: number;
  totalDeployments: number;
  runningAgents: number;
  stoppedAgents: number;
  errorAgents: number;
  plans: Record<string, number>;
}

interface UserInfo {
  id: string;
  email: string;
  name: string;
  plan: string;
  agentCount: number;
  storeCount: number;
  createdAt: string;
}

interface RecentError {
  id: string;
  source: string;
  message: string;
  timestamp: string;
}

export default function AdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [errors, setErrors] = useState<RecentError[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = user && ADMIN_EMAILS.includes(user.email);

  const fetchAdminData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsData, usersData] = await Promise.all([
        api.get<AdminStats>("/admin/stats").catch(() => null),
        api.get<UserInfo[]>("/admin/users").catch(() => []),
      ]);

      if (statsData) {
        setStats(statsData);
      } else {
        // Mock data for development
        setStats({
          totalUsers: users.length || 1,
          totalAgents: 0,
          totalStores: 0,
          totalDeployments: 0,
          runningAgents: 0,
          stoppedAgents: 0,
          errorAgents: 0,
          plans: { free: 1 },
        });
      }

      setUsers(
        usersData.length > 0
          ? usersData
          : [
              {
                id: user?.id || "1",
                email: user?.email || "",
                name: user?.name || "",
                plan: "free",
                agentCount: 0,
                storeCount: 0,
                createdAt: new Date().toISOString(),
              },
            ]
      );

      setErrors([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push("/dashboard");
      return;
    }
    if (isAdmin) {
      fetchAdminData();
    }
  }, [authLoading, isAdmin, router, fetchAdminData]);

  if (authLoading || !isAdmin) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const planColors: Record<string, string> = {
    free: "bg-zinc-800 text-zinc-400",
    starter: "bg-blue-500/10 text-blue-400",
    pro: "bg-purple-500/10 text-purple-400",
    business: "bg-amber-500/10 text-amber-400",
  };

  return (
    <div className="min-h-screen bg-[#09090b] p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="bg-red-500/10 p-2.5 rounded-lg">
            <Shield className="h-6 w-6 text-red-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
            <p className="text-zinc-400 text-sm mt-0.5">
              ClawCommerce system overview
            </p>
          </div>
        </div>
        <Button
          onClick={fetchAdminData}
          variant="outline"
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-[#27272a]"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Total Users", value: stats?.totalUsers ?? 0, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
              { label: "Total Agents", value: stats?.totalAgents ?? 0, icon: Bot, color: "text-green-500", bg: "bg-green-500/10" },
              { label: "Total Stores", value: stats?.totalStores ?? 0, icon: Store, color: "text-purple-500", bg: "bg-purple-500/10" },
              { label: "Deployments", value: stats?.totalDeployments ?? 0, icon: Server, color: "text-amber-500", bg: "bg-amber-500/10" },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <Card key={label} className="bg-[#0a0a0a] border-[#27272a]">
                <CardContent className="p-5">
                  <div className={cn("p-2 rounded-lg w-fit mb-3", bg)}>
                    <Icon className={cn("h-5 w-5", color)} />
                  </div>
                  <p className="text-2xl font-bold text-white">{value}</p>
                  <p className="text-sm text-zinc-400 mt-0.5">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Machine Health + Revenue Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
            {/* Machine Health */}
            <Card className="bg-[#0a0a0a] border-[#27272a]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-white flex items-center gap-2">
                  <Activity className="h-5 w-5 text-green-500" />
                  Machine Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
                    <p className="text-2xl font-bold text-green-400">
                      {stats?.runningAgents ?? 0}
                    </p>
                    <p className="text-xs text-green-400/70 mt-1">Running</p>
                  </div>
                  <div className="text-center p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
                    <p className="text-2xl font-bold text-yellow-400">
                      {stats?.stoppedAgents ?? 0}
                    </p>
                    <p className="text-xs text-yellow-400/70 mt-1">Sleeping</p>
                  </div>
                  <div className="text-center p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
                    <p className="text-2xl font-bold text-red-400">
                      {stats?.errorAgents ?? 0}
                    </p>
                    <p className="text-xs text-red-400/70 mt-1">Error</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Revenue */}
            <Card className="bg-[#0a0a0a] border-[#27272a]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-white flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-500" />
                  Revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-[#09090b] border border-[#27272a] rounded-lg">
                    <p className="text-xs text-zinc-500 mb-1">MRR</p>
                    <p className="text-xl font-bold text-white">
                      €{((stats?.plans?.starter ?? 0) * 29 + (stats?.plans?.pro ?? 0) * 49 + (stats?.plans?.business ?? 0) * 99).toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 bg-[#09090b] border border-[#27272a] rounded-lg">
                    <p className="text-xs text-zinc-500 mb-1">Paying Users</p>
                    <p className="text-xl font-bold text-white">
                      {(stats?.plans?.starter ?? 0) + (stats?.plans?.pro ?? 0) + (stats?.plans?.business ?? 0)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  {Object.entries(stats?.plans ?? {}).map(([plan, count]) => (
                    <Badge key={plan} className={cn("text-xs", planColors[plan] || planColors.free)}>
                      {plan}: {count}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Errors */}
          <Card className="bg-[#0a0a0a] border-[#27272a] mb-8">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500" />
                Recent Errors
              </CardTitle>
            </CardHeader>
            <CardContent>
              {errors.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-zinc-500">No recent errors 🎉</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {errors.map((err) => (
                    <div
                      key={err.id}
                      className="flex items-start gap-3 p-3 bg-red-500/5 border border-red-500/10 rounded-lg"
                    >
                      <Circle className="h-2 w-2 fill-red-500 text-red-500 mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-red-300">{err.message}</p>
                        <p className="text-xs text-zinc-600 mt-0.5">
                          {err.source} · {new Date(err.timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Users Table */}
          <Card className="bg-[#0a0a0a] border-[#27272a]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                Users ({users.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#27272a]">
                      <th className="text-left py-2.5 px-3 text-zinc-500 font-medium text-xs">Name</th>
                      <th className="text-left py-2.5 px-3 text-zinc-500 font-medium text-xs">Email</th>
                      <th className="text-left py-2.5 px-3 text-zinc-500 font-medium text-xs">Plan</th>
                      <th className="text-left py-2.5 px-3 text-zinc-500 font-medium text-xs">Agents</th>
                      <th className="text-left py-2.5 px-3 text-zinc-500 font-medium text-xs">Stores</th>
                      <th className="text-left py-2.5 px-3 text-zinc-500 font-medium text-xs">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-[#27272a]/50 hover:bg-zinc-900/50">
                        <td className="py-2.5 px-3 text-white font-medium">{u.name}</td>
                        <td className="py-2.5 px-3 text-zinc-400">{u.email}</td>
                        <td className="py-2.5 px-3">
                          <Badge className={cn("text-xs", planColors[u.plan] || planColors.free)}>
                            {u.plan || "free"}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-400">{u.agentCount}</td>
                        <td className="py-2.5 px-3 text-zinc-400">{u.storeCount}</td>
                        <td className="py-2.5 px-3 text-zinc-500 text-xs">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
