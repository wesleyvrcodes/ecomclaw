"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Coins,
  ArrowDownLeft,
  ArrowUpRight,
  DollarSign,
  BarChart3,
  Store,
  Loader2,
  Cpu,
  Bot,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface UsageSummary {
  period: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalRequests: number;
  totalCostCents: number;
  totalCostUsd: number;
  limitCents: number;
  limitUsd: number;
  remainingCents: number;
  percentUsed: number;
  byAgent: {
    agentId: string;
    agentName: string;
    storeName: string;
    inputTokens: number;
    outputTokens: number;
    requests: number;
    costCents: number;
  }[];
  byModel: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    requests: number;
    costCents: number;
  }[];
}

interface StoreItem {
  id: string;
  name: string;
}

interface Agent {
  id: string;
  name: string;
  storeId: string;
  storeName: string;
}

const modelColors: Record<string, string> = {
  "claude-sonnet-4-5-20250514": "bg-orange-500",
  "claude-sonnet-4-5": "bg-orange-500",
  "claude-3-5-sonnet-20241022": "bg-orange-400",
  "claude-haiku-3-5": "bg-yellow-500",
  "claude-3-5-haiku-20241022": "bg-yellow-400",
  "gpt-4o": "bg-emerald-500",
  "gpt-4o-mini": "bg-emerald-400",
  "gpt-4.1": "bg-teal-500",
  "gpt-4.1-mini": "bg-teal-400",
};

function getModelColor(model: string): string {
  return modelColors[model] || "bg-zinc-500";
}

function getModelDisplayName(model: string): string {
  // Strip provider prefix
  const name = model.includes("/") ? model.split("/").pop()! : model;
  const map: Record<string, string> = {
    "claude-sonnet-4-5-20250514": "Claude Sonnet 4.5",
    "claude-sonnet-4-5": "Claude Sonnet 4.5",
    "claude-3-5-sonnet-20241022": "Claude 3.5 Sonnet",
    "claude-haiku-3-5": "Claude Haiku 3.5",
    "claude-3-5-haiku-20241022": "Claude 3.5 Haiku",
    "claude-3-haiku-20240307": "Claude 3 Haiku",
    "gpt-4o": "GPT-4o",
    "gpt-4o-2024-11-20": "GPT-4o",
    "gpt-4o-mini": "GPT-4o Mini",
    "gpt-4o-mini-2024-07-18": "GPT-4o Mini",
    "gpt-4.1": "GPT-4.1",
    "gpt-4.1-mini": "GPT-4.1 Mini",
    "gpt-4.1-nano": "GPT-4.1 Nano",
  };
  return map[name] || name;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const storeColors = [
  "bg-purple-500/10 border-purple-500/20",
  "bg-blue-500/10 border-blue-500/20",
  "bg-emerald-500/10 border-emerald-500/20",
  "bg-amber-500/10 border-amber-500/20",
  "bg-pink-500/10 border-pink-500/20",
];

export default function AnalyticsPage() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [usageData, storesData, agentsData] = await Promise.all([
        api.get<UsageSummary>("/analytics/usage").catch(() => null),
        api.get<StoreItem[]>("/stores").catch((): StoreItem[] => []),
        api.get<Agent[]>("/agents").catch((): Agent[] => []),
      ]);
      setUsage(usageData);
      setStores(storesData);
      setAgents(agentsData);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalTokens = usage
    ? usage.totalInputTokens + usage.totalOutputTokens
    : 0;
  const hasData = usage && totalTokens > 0;

  // Group usage by store
  const usageByStore: Record<
    string,
    { storeName: string; inputTokens: number; outputTokens: number; requests: number; costCents: number; agentCount: number }
  > = {};
  if (usage) {
    for (const au of usage.byAgent) {
      const key = au.storeName || "Unassigned";
      if (!usageByStore[key]) {
        usageByStore[key] = { storeName: key, inputTokens: 0, outputTokens: 0, requests: 0, costCents: 0, agentCount: 0 };
      }
      usageByStore[key].inputTokens += au.inputTokens;
      usageByStore[key].outputTokens += au.outputTokens;
      usageByStore[key].requests += au.requests;
      usageByStore[key].costCents += au.costCents;
      usageByStore[key].agentCount += 1;
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Token usage &amp; costs — {usage?.period || "this month"}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-zinc-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card className="bg-[#0a0a0a] border-[#27272a]">
              <CardContent className="p-5">
                <div className="p-2 rounded-lg w-fit mb-3 bg-blue-500/10">
                  <Coins className="h-5 w-5 text-blue-500" />
                </div>
                <p className="text-2xl font-bold text-white">
                  {formatTokens(totalTokens)}
                </p>
                <p className="text-sm text-zinc-400 mt-0.5">Total Tokens</p>
                {hasData && (
                  <div className="flex gap-3 mt-2 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <ArrowDownLeft className="h-3 w-3 text-blue-400" />
                      {formatTokens(usage!.totalInputTokens)} in
                    </span>
                    <span className="flex items-center gap-1">
                      <ArrowUpRight className="h-3 w-3 text-purple-400" />
                      {formatTokens(usage!.totalOutputTokens)} out
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-[#0a0a0a] border-[#27272a]">
              <CardContent className="p-5">
                <div className="p-2 rounded-lg w-fit mb-3 bg-green-500/10">
                  <DollarSign className="h-5 w-5 text-green-500" />
                </div>
                <p className="text-2xl font-bold text-white">
                  {formatCost(usage?.totalCostCents || 0)}
                </p>
                <p className="text-sm text-zinc-400 mt-0.5">Estimated Cost</p>
                {usage && usage.limitCents > 0 && (
                  <p className="text-xs text-zinc-500 mt-2">
                    {formatCost(usage.remainingCents)} remaining of{" "}
                    {formatCost(usage.limitCents)} limit
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="bg-[#0a0a0a] border-[#27272a]">
              <CardContent className="p-5">
                <div className="p-2 rounded-lg w-fit mb-3 bg-purple-500/10">
                  <Zap className="h-5 w-5 text-purple-500" />
                </div>
                <p className="text-2xl font-bold text-white">
                  {(usage?.totalRequests || 0).toLocaleString()}
                </p>
                <p className="text-sm text-zinc-400 mt-0.5">API Requests</p>
              </CardContent>
            </Card>

            <Card className="bg-[#0a0a0a] border-[#27272a]">
              <CardContent className="p-5">
                <div className="p-2 rounded-lg w-fit mb-3 bg-amber-500/10">
                  <Bot className="h-5 w-5 text-amber-500" />
                </div>
                <p className="text-2xl font-bold text-white">
                  {usage?.byModel?.length || 0}
                </p>
                <p className="text-sm text-zinc-400 mt-0.5">Models Used</p>
              </CardContent>
            </Card>
          </div>

          {/* Budget Progress */}
          {usage && usage.limitCents > 0 && (
            <Card className="bg-[#0a0a0a] border-[#27272a] mb-6">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-white">
                    Monthly Budget
                  </span>
                  <span className="text-sm text-zinc-400">
                    {formatCost(usage.totalCostCents)} /{" "}
                    {formatCost(usage.limitCents)}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      usage.percentUsed > 90
                        ? "bg-red-500"
                        : usage.percentUsed > 70
                          ? "bg-amber-500"
                          : "bg-blue-500"
                    )}
                    style={{ width: `${Math.min(usage.percentUsed, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-zinc-500 mt-1.5">
                  {usage.percentUsed}% used
                </p>
              </CardContent>
            </Card>
          )}

          {/* Usage by Model */}
          <Card className="bg-[#0a0a0a] border-[#27272a] mb-6">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <Cpu className="h-4 w-4 text-zinc-400" />
                Usage by Model
              </CardTitle>
            </CardHeader>
            <CardContent>
              {usage && usage.byModel.length > 0 ? (
                <div className="space-y-3">
                  {usage.byModel.map((m) => {
                    const modelTokens = m.inputTokens + m.outputTokens;
                    const pct =
                      totalTokens > 0
                        ? Math.round((modelTokens / totalTokens) * 100)
                        : 0;
                    return (
                      <div key={m.model} className="border border-[#27272a] rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div
                              className={cn(
                                "h-3 w-3 rounded-full",
                                getModelColor(m.model)
                              )}
                            />
                            <span className="text-sm font-medium text-white">
                              {getModelDisplayName(m.model)}
                            </span>
                            <Badge
                              variant="secondary"
                              className="bg-zinc-800 text-zinc-400 text-[10px] hover:bg-zinc-800"
                            >
                              {m.model}
                            </Badge>
                          </div>
                          <span className="text-sm font-semibold text-white">
                            {formatCost(m.costCents)}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-2">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              getModelColor(m.model)
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="grid grid-cols-4 gap-4 text-xs">
                          <div>
                            <p className="text-zinc-500">Input</p>
                            <p className="text-white font-medium">
                              {formatTokens(m.inputTokens)}
                            </p>
                          </div>
                          <div>
                            <p className="text-zinc-500">Output</p>
                            <p className="text-white font-medium">
                              {formatTokens(m.outputTokens)}
                            </p>
                          </div>
                          <div>
                            <p className="text-zinc-500">Requests</p>
                            <p className="text-white font-medium">
                              {m.requests}
                            </p>
                          </div>
                          <div>
                            <p className="text-zinc-500">Share</p>
                            <p className="text-white font-medium">{pct}%</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8">
                  <BarChart3 className="h-8 w-8 text-zinc-700 mb-3" />
                  <p className="text-sm text-zinc-500">No usage data yet</p>
                  <p className="text-xs text-zinc-600 mt-1">
                    Use your agents to see model-level cost breakdown.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Usage by Agent */}
          <Card className="bg-[#0a0a0a] border-[#27272a] mb-6">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                <Bot className="h-4 w-4 text-zinc-400" />
                Usage by Agent
              </CardTitle>
            </CardHeader>
            <CardContent>
              {usage && usage.byAgent.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#27272a]">
                        <th className="text-left py-2 pr-4 text-zinc-500 font-medium text-xs">
                          Agent
                        </th>
                        <th className="text-left py-2 pr-4 text-zinc-500 font-medium text-xs">
                          Store
                        </th>
                        <th className="text-right py-2 pr-4 text-zinc-500 font-medium text-xs">
                          Input
                        </th>
                        <th className="text-right py-2 pr-4 text-zinc-500 font-medium text-xs">
                          Output
                        </th>
                        <th className="text-right py-2 pr-4 text-zinc-500 font-medium text-xs">
                          Requests
                        </th>
                        <th className="text-right py-2 text-zinc-500 font-medium text-xs">
                          Cost
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.byAgent.map((a) => (
                        <tr
                          key={a.agentId}
                          className="border-b border-[#27272a]/50"
                        >
                          <td className="py-2.5 pr-4 text-white font-medium">
                            {a.agentName}
                          </td>
                          <td className="py-2.5 pr-4 text-zinc-400">
                            {a.storeName || "—"}
                          </td>
                          <td className="py-2.5 pr-4 text-right text-zinc-300">
                            {formatTokens(a.inputTokens)}
                          </td>
                          <td className="py-2.5 pr-4 text-right text-zinc-300">
                            {formatTokens(a.outputTokens)}
                          </td>
                          <td className="py-2.5 pr-4 text-right text-zinc-300">
                            {a.requests}
                          </td>
                          <td className="py-2.5 text-right text-white font-medium">
                            {formatCost(a.costCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8">
                  <BarChart3 className="h-8 w-8 text-zinc-700 mb-3" />
                  <p className="text-sm text-zinc-500">
                    No agent usage to display
                  </p>
                  <p className="text-xs text-zinc-600 mt-1">
                    Agent usage breakdown will appear here once you start using
                    agents.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Per Store Breakdown */}
          {Object.keys(usageByStore).length > 0 && (
            <Card className="bg-[#0a0a0a] border-[#27272a]">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
                  <Store className="h-4 w-4 text-zinc-400" />
                  Usage by Store
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.values(usageByStore).map((s, index) => (
                    <div
                      key={s.storeName}
                      className={cn(
                        "border rounded-lg p-4",
                        storeColors[index % storeColors.length]
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Store className="h-4 w-4 text-zinc-400" />
                          <span className="text-sm font-medium text-white">
                            {s.storeName}
                          </span>
                        </div>
                        <Badge
                          variant="secondary"
                          className="bg-transparent text-zinc-500 hover:bg-transparent"
                        >
                          {s.agentCount} agent
                          {s.agentCount !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-4 mt-3">
                        <div>
                          <p className="text-xs text-zinc-500">Tokens</p>
                          <p className="text-sm font-semibold text-white">
                            {formatTokens(s.inputTokens + s.outputTokens)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500">Requests</p>
                          <p className="text-sm font-semibold text-white">
                            {s.requests}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500">Cost</p>
                          <p className="text-sm font-semibold text-white">
                            {formatCost(s.costCents)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
