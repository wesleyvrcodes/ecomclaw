"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Bot,
  Play,
  Square,
  Settings,
  Trash2,
  Plus,
  Circle,
  Clock,
  Loader2,
  AlertCircle,
  ChevronDown,
  Sparkles,
  Store,
  RefreshCw,
  Shield,
  Activity,
  Globe,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type AgentStatus = "running" | "stopped" | "error";

interface DeploymentStatusInfo {
  status: string;
  serverStatus: string;
  agentHealthy: boolean;
  tunnelUrl: string;
  region: string;
  createdAt: string;
  lastHealthCheck: string | null;
  errorMessage: string | null;
}

interface Deployment {
  id: string;
  agentId: string;
  status: string;
  region: string;
  serverId: number;
  serverIp: string;
  serverName: string;
  tunnelUrl: string;
  createdAt: string;
  lastHealthCheck: string | null;
  errorMessage: string | null;
}

interface Agent {
  id: string;
  name: string;
  type: string;
  status: AgentStatus;
  lastActive: string;
  storeId: string;
  storeName: string;
  customPrompt: string;
  configuration: Record<string, string>;
  deployment?: Deployment;
}

interface StoreItem {
  id: string;
  name: string;
  niche: string;
}

const statusConfig: Record<
  AgentStatus,
  { color: string; bg: string; label: string; badgeVariant: "default" | "secondary" | "destructive" }
> = {
  running: { color: "text-green-500", bg: "bg-green-500", label: "Running", badgeVariant: "default" },
  stopped: {
    color: "text-yellow-500",
    bg: "bg-yellow-500",
    label: "Stopped",
    badgeVariant: "secondary",
  },
  error: { color: "text-red-500", bg: "bg-red-500", label: "Error", badgeVariant: "destructive" },
};

const deploymentStatusMap: Record<string, { label: string; color: string; icon: typeof Loader2 }> = {
  Provisioning: { label: "Provisioning server...", color: "text-blue-400", icon: Loader2 },
  Installing: { label: "Installing agent...", color: "text-amber-400", icon: Loader2 },
  Starting: { label: "Starting up...", color: "text-blue-400", icon: Loader2 },
  Running: { label: "Running", color: "text-green-400", icon: Activity },
  Sleeping: { label: "Sleeping", color: "text-zinc-400", icon: Clock },
  Stopped: { label: "Stopped", color: "text-yellow-400", icon: Square },
  Error: { label: "Error", color: "text-red-400", icon: AlertCircle },
};

const storeColors = [
  "bg-purple-500/10 text-purple-400",
  "bg-blue-500/10 text-blue-400",
  "bg-emerald-500/10 text-emerald-400",
  "bg-amber-500/10 text-amber-400",
  "bg-pink-500/10 text-pink-400",
  "bg-cyan-500/10 text-cyan-400",
];

function getStoreColor(storeName: string) {
  let hash = 0;
  for (let i = 0; i < storeName.length; i++) {
    hash = storeName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return storeColors[Math.abs(hash) % storeColors.length];
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStore, setFilterStore] = useState("all");
  const [configureAgent, setConfigureAgent] = useState<Agent | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [logsModal, setLogsModal] = useState<{ deploymentId: string; agentName: string } | null>(null);
  const [logs, setLogs] = useState<string>("");
  const [logsLoading, setLogsLoading] = useState(false);

  // Configure form
  const [editPrompt, setEditPrompt] = useState("");
  const [editConfig, setEditConfig] = useState<Record<string, string>>({});
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Polling for provisioning deployments
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [agentsData, storesData, deploymentsData] = await Promise.all([
        api.get<Agent[]>("/agents"),
        api.get<StoreItem[]>("/stores"),
        api.get<Deployment[]>("/deployments"),
      ]);
      const deploymentMap = new Map(deploymentsData.map(d => [d.agentId, d]));
      const enrichedAgents = agentsData.map(a => ({
        ...a,
        status: (a.status?.toLowerCase() || "stopped") as AgentStatus,
        deployment: deploymentMap.get(a.id),
      }));
      setAgents(enrichedAgents);
      setStores(storesData);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load agents";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll status for deployments that are provisioning/installing/starting
  useEffect(() => {
    const provisioningDeployments = agents
      .filter(a => a.deployment)
      .map(a => a.deployment!)
      .filter(d => ["Provisioning", "Installing", "Starting"].includes(d.status));

    if (provisioningDeployments.length === 0) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    // Poll every 5 seconds
    pollingRef.current = setInterval(async () => {
      for (const dep of provisioningDeployments) {
        try {
          const statusInfo = await api.get<DeploymentStatusInfo>(`/deployments/${dep.id}/status`);
          setAgents(prev => prev.map(a => {
            if (a.deployment?.id !== dep.id) return a;
            return {
              ...a,
              status: statusInfo.status === "Running" ? "running" as AgentStatus : a.status,
              deployment: {
                ...a.deployment!,
                status: statusInfo.status,
                lastHealthCheck: statusInfo.lastHealthCheck,
                errorMessage: statusInfo.errorMessage,
              },
            };
          }));
        } catch {
          // Ignore polling errors
        }
      }
    }, 5000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [agents]);

  const toggleAgent = async (id: string) => {
    const agent = agents.find((a) => a.id === id);
    if (!agent) return;
    const newStatus = agent.status === "running" ? "stopped" : "running";

    try {
      setActionLoading(id);

      if (agent.deployment) {
        if (newStatus === "stopped") {
          await api.post(`/deployments/${agent.deployment.id}/stop`, {});
        } else {
          await api.post(`/deployments/${agent.deployment.id}/start`, {});
        }
      } else {
        await api.put(`/agents/${id}/toggle`, {});
      }

      setAgents((prev) =>
        prev.map((a) =>
          a.id === id
            ? {
                ...a,
                status: newStatus as AgentStatus,
                lastActive: new Date().toISOString(),
                deployment: a.deployment
                  ? { ...a.deployment, status: newStatus === "running" ? "Starting" : "Stopped" }
                  : undefined,
              }
            : a
        )
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update agent";
      setError(message);
    } finally {
      setActionLoading(null);
    }
  };

  const redeployAgent = async (deploymentId: string) => {
    try {
      setActionLoading(deploymentId);
      await api.post(`/deployments/${deploymentId}/redeploy`, {});
      setAgents(prev => prev.map(a => {
        if (a.deployment?.id !== deploymentId) return a;
        return { ...a, deployment: { ...a.deployment!, status: "Provisioning" } };
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to redeploy";
      setError(message);
    } finally {
      setActionLoading(null);
    }
  };

  const openLogs = async (deploymentId: string, agentName: string) => {
    setLogsModal({ deploymentId, agentName });
    setLogs("");
    setLogsLoading(true);
    try {
      const data = await api.get<{ logs: string }>(`/deployments/${deploymentId}/logs`);
      setLogs(data.logs);
    } catch {
      setLogs("Failed to fetch logs.");
    } finally {
      setLogsLoading(false);
    }
  };

  const deleteAgent = async (id: string) => {
    try {
      setActionLoading(id);
      await api.delete(`/agents/${id}`);
      setAgents((prev) => prev.filter((a) => a.id !== id));
      setDeleteConfirm(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete agent";
      setError(message);
    } finally {
      setActionLoading(null);
    }
  };

  const openConfigure = (agent: Agent) => {
    setConfigureAgent(agent);
    setEditPrompt(agent.customPrompt || "");
    setEditConfig(agent.configuration || {});
    setSaveError(null);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configureAgent) return;

    try {
      setSaveLoading(true);
      setSaveError(null);
      await api.put(`/agents/${configureAgent.id}`, {
        customPrompt: editPrompt.trim(),
        configuration: editConfig,
      });
      setAgents((prev) =>
        prev.map((a) =>
          a.id === configureAgent.id
            ? { ...a, customPrompt: editPrompt.trim(), configuration: editConfig }
            : a
        )
      );
      setConfigureAgent(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save configuration";
      setSaveError(message);
    } finally {
      setSaveLoading(false);
    }
  };

  const filteredAgents =
    filterStore === "all"
      ? agents
      : agents.filter((a) => a.storeId === filterStore);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Agents</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Manage your deployed AI agents
          </p>
        </div>
        <Button asChild className="bg-blue-500 hover:bg-blue-600 text-white font-medium">
          <a href="/dashboard/store">
            <Plus className="h-4 w-4" />
            Deploy New Agent
          </a>
        </Button>
      </div>

      {/* Store Filter */}
      {stores.length > 0 && (
        <div className="mb-6">
          <div className="relative w-64">
            <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <select
              value={filterStore}
              onChange={(e) => setFilterStore(e.target.value)}
              className="w-full appearance-none bg-[#0a0a0a] border border-[#27272a] rounded-lg py-2.5 pl-10 pr-10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
            >
              <option value="all">All Stores</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAgents.map((agent) => {
            const status = statusConfig[agent.status.toLowerCase() as AgentStatus] ?? statusConfig.stopped;
            const isLoading = actionLoading === agent.id || actionLoading === agent.deployment?.id;
            const depStatus = agent.deployment ? deploymentStatusMap[agent.deployment.status] : null;
            const isProvisioning = agent.deployment && ["Provisioning", "Installing", "Starting"].includes(agent.deployment.status);

            return (
              <Card key={agent.id} className="bg-[#0a0a0a] border-[#27272a]">
                <CardContent className="p-5">
                  <div className="flex items-center gap-4">
                    {/* Icon */}
                    <div className="bg-blue-500/10 p-2.5 rounded-lg shrink-0">
                      <Bot className="h-5 w-5 text-blue-500" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <h3 className="text-sm font-semibold text-white">
                          {agent.name}
                        </h3>
                        <Badge
                          variant={status.badgeVariant}
                          className={cn(
                            "text-xs",
                            agent.status === "running" && "bg-green-500/10 text-green-500 hover:bg-green-500/20",
                            agent.status === "stopped" && "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20",
                            agent.status === "error" && "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                          )}
                        >
                          <Circle className={cn("h-2 w-2 fill-current mr-1", status.color)} />
                          {status.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
                        <Badge variant="secondary" className="bg-zinc-800 text-zinc-400 hover:bg-zinc-800">
                          {agent.type}
                        </Badge>
                        {agent.deployment && (
                          <>
                            <Badge variant="secondary" className="text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20">
                              <Globe className="h-3 w-3 mr-1" />
                              {agent.deployment.region}
                            </Badge>
                            {agent.deployment.tunnelUrl && (
                              <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20">
                                <Shield className="h-3 w-3 mr-1" />
                                Secure Tunnel
                              </Badge>
                            )}
                          </>
                        )}
                        {agent.storeName && (
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-xs font-medium hover:opacity-80",
                              getStoreColor(agent.storeName)
                            )}
                          >
                            {agent.storeName}
                          </Badge>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {agent.lastActive && !isNaN(new Date(agent.lastActive).getTime()) ? new Date(agent.lastActive).toLocaleString() : agent.lastActive || "Never"}
                        </span>
                      </div>
                      {agent.customPrompt && (
                        <p className="text-xs text-zinc-600 mt-1.5 truncate max-w-md">
                          <Sparkles className="h-3 w-3 inline mr-1 text-amber-500/50" />
                          {agent.customPrompt}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleAgent(agent.id)}
                        disabled={isLoading || !!isProvisioning}
                        className={cn(
                          "h-9 w-9",
                          agent.status === "running"
                            ? "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20"
                            : "bg-green-500/10 text-green-500 hover:bg-green-500/20"
                        )}
                        title={
                          agent.status === "running" ? "Stop agent" : "Start agent"
                        }
                      >
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : agent.status === "running" ? (
                          <Square className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      {agent.deployment && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => redeployAgent(agent.deployment!.id)}
                            disabled={isLoading || !!isProvisioning}
                            className="h-9 w-9 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                            title="Redeploy agent"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openLogs(agent.deployment!.id, agent.name)}
                            className="h-9 w-9 bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700"
                            title="View logs"
                          >
                            <Terminal className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        asChild
                        className="h-9 w-9 bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700"
                        title="Configure"
                      >
                        <Link href={`/dashboard/agents/${agent.id}`}>
                          <Settings className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteConfirm(agent.id)}
                        className="h-9 w-9 bg-zinc-800 text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Provisioning Progress Bar */}
                  {isProvisioning && depStatus && (
                    <div className="mt-4 border-t border-[#27272a] pt-3">
                      <div className="flex items-center gap-3">
                        <depStatus.icon className={cn("h-4 w-4 animate-spin", depStatus.color)} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className={cn("text-xs font-medium", depStatus.color)}>
                              {depStatus.label}
                            </span>
                            <span className="text-xs text-zinc-600">
                              {agent.deployment?.status === "Provisioning" && "~2 min"}
                              {agent.deployment?.status === "Installing" && "~3 min"}
                              {agent.deployment?.status === "Starting" && "~30 sec"}
                            </span>
                          </div>
                          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-1000",
                                agent.deployment?.status === "Provisioning" && "w-1/4 bg-blue-500",
                                agent.deployment?.status === "Installing" && "w-2/3 bg-amber-500",
                                agent.deployment?.status === "Starting" && "w-[90%] bg-blue-500",
                              )}
                            />
                          </div>
                        </div>
                      </div>
                      {agent.deployment?.errorMessage && (
                        <div className="mt-2 bg-red-500/10 border border-red-500/20 rounded p-2">
                          <p className="text-xs text-red-400">{agent.deployment.errorMessage}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error state with details */}
                  {agent.deployment?.status === "Error" && agent.deployment.errorMessage && (
                    <div className="mt-4 border-t border-[#27272a] pt-3">
                      <div className="bg-red-500/10 border border-red-500/20 rounded p-3 flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs text-red-400">{agent.deployment.errorMessage}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => redeployAgent(agent.deployment!.id)}
                            className="mt-2 h-7 text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20"
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Retry Deploy
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {filteredAgents.length === 0 && !loading && (
            <Card className="bg-[#0a0a0a] border-[#27272a]">
              <CardContent className="p-12 text-center">
                <Bot className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-sm font-medium text-zinc-400 mb-1">
                  {filterStore !== "all"
                    ? "No agents deployed to this store"
                    : "No agents deployed yet"}
                </p>
                <p className="text-xs text-zinc-600 mb-5">
                  Browse the Agent Store to find and deploy your first AI agent.
                </p>
                <Button asChild className="bg-blue-500 hover:bg-blue-600 text-white font-medium">
                  <a href="/dashboard/store">
                    Browse Agent Store
                  </a>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="bg-[#0a0a0a] border-[#27272a] sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="bg-red-500/10 p-2.5 rounded-lg">
                <Trash2 className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-white">
                  Delete Agent
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-500 mt-0.5">
                  This action cannot be undone
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <p className="text-sm text-zinc-400">
            Are you sure you want to delete this agent? It will be stopped and
            permanently removed, including its VPS server.
          </p>
          <DialogFooter className="gap-3">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirm(null)}
              disabled={deleteConfirm ? actionLoading === deleteConfirm : false}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-[#27272a]"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteAgent(deleteConfirm)}
              disabled={deleteConfirm ? actionLoading === deleteConfirm : false}
              className="bg-red-500 hover:bg-red-600"
            >
              {deleteConfirm && actionLoading === deleteConfirm && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Delete Agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Configure Modal */}
      <Dialog open={!!configureAgent} onOpenChange={(open) => !open && setConfigureAgent(null)}>
        <DialogContent className="bg-[#0a0a0a] border-[#27272a] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="bg-blue-500/10 p-2 rounded-lg">
                <Bot className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-white">
                  Configure {configureAgent?.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-500">
                  {configureAgent?.storeName}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleSaveConfig} className="space-y-5">
            {saveError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                <p className="text-sm text-red-400">{saveError}</p>
              </div>
            )}

            <div>
              <Label className="text-zinc-300 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  Custom Prompt
                </span>
              </Label>
              <Textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder="Tell the agent how to behave..."
                rows={4}
                className="bg-[#09090b] border-[#27272a] text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500 resize-none"
              />
            </div>

            {Object.keys(editConfig).length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-[#27272a]" />
                  <span className="text-xs text-zinc-500 font-medium">
                    Configuration
                  </span>
                  <div className="h-px flex-1 bg-[#27272a]" />
                </div>

                {Object.entries(editConfig).map(([key, value]) => (
                  <div key={key}>
                    <Label className="text-zinc-300 mb-1.5 capitalize">
                      {key.replace(/([A-Z])/g, " $1").trim()}
                    </Label>
                    <Input
                      type="text"
                      value={value}
                      onChange={(e) =>
                        setEditConfig((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      className="bg-[#09090b] border-[#27272a] text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500"
                    />
                  </div>
                ))}
              </div>
            )}

            <Button
              type="submit"
              disabled={saveLoading}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium"
            >
              {saveLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Configuration"
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Logs Modal */}
      <Dialog open={!!logsModal} onOpenChange={(open) => !open && setLogsModal(null)}>
        <DialogContent className="bg-[#0a0a0a] border-[#27272a] sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="bg-zinc-800 p-2 rounded-lg">
                <Terminal className="h-4 w-4 text-zinc-400" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-white">
                  Logs — {logsModal?.agentName}
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-500">
                  Server bootstrap and agent output
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="bg-[#09090b] border border-[#27272a] rounded-lg p-4 font-mono text-xs text-zinc-300 overflow-auto max-h-[50vh] whitespace-pre-wrap">
            {logsLoading ? (
              <div className="flex items-center gap-2 text-zinc-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading logs...
              </div>
            ) : (
              logs || "No logs available yet."
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => logsModal && openLogs(logsModal.deploymentId, logsModal.agentName)}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-[#27272a]"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Refresh
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
