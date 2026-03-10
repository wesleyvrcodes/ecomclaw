"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Bot,
  Settings,
  Shield,
  ListChecks,
  Plus,
  X,
  Save,
  ArrowLeft,
  Clock,
  Zap,
  Loader2,
  AlertCircle,
  Circle,
  ChevronDown,
  FileText,
  CheckCircle,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Agent {
  id: string;
  name: string;
  type: string;
  status: string;
  templateId: string;
  storeId: string;
  storeName: string;
  language: string;
  toneOfVoice: string;
  customRules: string[];
  schedule: string;
  configuration: Record<string, string>;
}

interface TaskDefinition {
  id: string;
  name: string;
  description: string;
  trigger: string;
}

interface ConfigField {
  key: string;
  label: string;
  type: string;
  defaultValue: string;
  placeholder: string;
  required: boolean;
}

interface Template {
  id: string;
  name: string;
  description: string;
  requiredScopes: string[];
  tools: string[];
  taskDefinitions: TaskDefinition[];
  configFields: ConfigField[];
  defaultConfig: Record<string, string>;
}

const triggerConfig: Record<string, { color: string; icon: typeof Clock }> = {
  daily: { color: "bg-blue-500/10 text-blue-400", icon: Clock },
  hourly: { color: "bg-purple-500/10 text-purple-400", icon: Clock },
  on_request: { color: "bg-amber-500/10 text-amber-400", icon: Zap },
  on_event: { color: "bg-emerald-500/10 text-emerald-400", icon: Zap },
};

const statusStyles: Record<string, { badge: string; label: string }> = {
  running: { badge: "bg-green-500/10 text-green-500", label: "Running" },
  stopped: { badge: "bg-yellow-500/10 text-yellow-500", label: "Stopped" },
  error: { badge: "bg-red-500/10 text-red-500", label: "Error" },
};

export default function AgentConfigPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en");
  const [toneOfVoice, setToneOfVoice] = useState("professional");
  const [schedule, setSchedule] = useState("hourly");
  const [customRules, setCustomRules] = useState<string[]>([]);
  const [newRule, setNewRule] = useState("");
  const [enabledTasks, setEnabledTasks] = useState<Record<string, boolean>>({});
  const [configValues, setConfigValues] = useState<Record<string, string>>({});

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const agentData = await api.get<Agent>(`/agents/${agentId}`);
      setAgent(agentData);

      // Initialize form state from agent data
      setName(agentData.name || "");
      setLanguage(agentData.language || "en");
      setToneOfVoice(agentData.toneOfVoice || "professional");
      setSchedule(agentData.schedule || "hourly");
      setCustomRules(agentData.customRules || []);
      setConfigValues(agentData.configuration || {});

      // Fetch template if available
      if (agentData.templateId) {
        try {
          const templateData = await api.get<Template>(
            `/templates/${agentData.templateId}`
          );
          setTemplate(templateData);
          // Initialize task toggles (all enabled by default)
          const tasks: Record<string, boolean> = {};
          templateData.taskDefinitions?.forEach((t) => {
            tasks[t.id] = true;
          });
          setEnabledTasks(tasks);
        } catch {
          // Template fetch is optional, don't block the page
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to load agent";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addRule = () => {
    const trimmed = newRule.trim();
    if (!trimmed) return;
    setCustomRules((prev) => [...prev, trimmed]);
    setNewRule("");
  };

  const removeRule = (index: number) => {
    setCustomRules((prev) => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addRule();
    }
  };

  const toggleTask = (taskId: string) => {
    setEnabledTasks((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveSuccess(false);
      setError(null);
      await api.put(`/agents/${agentId}`, {
        name,
        language,
        toneOfVoice,
        schedule,
        customRules,
        configuration: configValues,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save changes";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error && !agent) {
    return (
      <div>
        <Button
          variant="ghost"
          onClick={() => router.push("/dashboard/agents")}
          className="mb-6 text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Agents
        </Button>
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!agent) return null;

  const status = statusStyles[agent.status?.toLowerCase()] ?? statusStyles.stopped;

  return (
    <div className="max-w-3xl">
      {/* Back button */}
      <Button
        variant="ghost"
        onClick={() => router.push("/dashboard/agents")}
        className="mb-6 text-zinc-400 hover:text-white -ml-2"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Agents
      </Button>

      {/* Agent header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="bg-blue-500/10 p-3 rounded-xl shrink-0">
          <Bot className="h-6 w-6 text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white">{agent.name}</h1>
            <Badge
              className={cn("text-xs", status.badge)}
            >
              <Circle className="h-2 w-2 fill-current mr-1" />
              {status.label}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-sm text-zinc-400 flex-wrap">
            <Badge variant="secondary" className="bg-zinc-800 text-zinc-400 hover:bg-zinc-800">
              {agent.type}
            </Badge>
            {agent.storeName && (
              <span className="text-zinc-500">{agent.storeName}</span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {saveSuccess && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mb-6 flex items-center gap-3">
          <Circle className="h-5 w-5 text-green-500 fill-green-500 shrink-0" />
          <p className="text-sm text-green-400">Changes saved successfully.</p>
        </div>
      )}

      <div className="space-y-6">
        {/* Section 1: General Settings */}
        <Card className="bg-[#0a0a0a] border-[#27272a]">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-blue-500/10 p-2 rounded-lg">
                <Settings className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">General Settings</h2>
                <p className="text-xs text-zinc-500">Basic agent configuration</p>
              </div>
            </div>

            <div className="grid gap-5">
              <div>
                <Label className="text-zinc-300 mb-1.5 text-sm">Agent Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Agent"
                  className="bg-[#09090b] border-[#27272a] text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-zinc-300 mb-1.5 text-sm">Language</Label>
                  <div className="relative">
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full appearance-none bg-[#09090b] border border-[#27272a] rounded-md py-2 pl-3 pr-9 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
                    >
                      <option value="en">English</option>
                      <option value="nl">Dutch</option>
                      <option value="de">German</option>
                      <option value="fr">French</option>
                      <option value="es">Spanish</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <Label className="text-zinc-300 mb-1.5 text-sm">Tone of Voice</Label>
                  <div className="relative">
                    <select
                      value={toneOfVoice}
                      onChange={(e) => setToneOfVoice(e.target.value)}
                      className="w-full appearance-none bg-[#09090b] border border-[#27272a] rounded-md py-2 pl-3 pr-9 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
                    >
                      <option value="professional">Professional</option>
                      <option value="casual">Casual</option>
                      <option value="luxury">Luxury</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <Label className="text-zinc-300 mb-1.5 text-sm">Schedule</Label>
                  <div className="relative">
                    <select
                      value={schedule}
                      onChange={(e) => setSchedule(e.target.value)}
                      className="w-full appearance-none bg-[#09090b] border border-[#27272a] rounded-md py-2 pl-3 pr-9 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors"
                    >
                      <option value="hourly">Every hour</option>
                      <option value="daily">Daily at 9:00</option>
                      <option value="on_request">On request only</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Agent Configuration */}
        {template?.configFields && template.configFields.length > 0 && (
          <Card className="bg-[#0a0a0a] border-[#27272a]">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-purple-500/10 p-2 rounded-lg">
                  <FileText className="h-4 w-4 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Agent Configuration</h2>
                  <p className="text-xs text-zinc-500">Customize how this agent works for your store</p>
                </div>
              </div>

              <div className="grid gap-5">
                {template.configFields.map((field) => (
                  <div key={field.key}>
                    <Label className="text-zinc-300 mb-1.5 text-sm">
                      {field.label}
                      {field.required && <span className="text-red-400 ml-1">*</span>}
                    </Label>
                    {field.type === "textarea" ? (
                      <Textarea
                        value={configValues[field.key] || ""}
                        onChange={(e) =>
                          setConfigValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        placeholder={field.placeholder}
                        rows={3}
                        className="bg-[#09090b] border-[#27272a] text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500 resize-none text-sm"
                      />
                    ) : field.type.startsWith("select:") ? (
                      <div className="relative">
                        <select
                          value={configValues[field.key] || field.defaultValue}
                          onChange={(e) =>
                            setConfigValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          className="w-full appearance-none bg-[#09090b] border border-[#27272a] rounded-md py-2 pl-3 pr-9 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors capitalize"
                        >
                          {field.type.replace("select:", "").split(",").map((opt) => (
                            <option key={opt} value={opt} className="capitalize">{opt}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                      </div>
                    ) : (
                      <Input
                        type="text"
                        value={configValues[field.key] || ""}
                        onChange={(e) =>
                          setConfigValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        placeholder={field.placeholder}
                        className="bg-[#09090b] border-[#27272a] text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500"
                      />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Section 2b: Connection Status */}
        <Card className="bg-[#0a0a0a] border-[#27272a]">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-emerald-500/10 p-2 rounded-lg">
                <Shield className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Connection Status</h2>
                <p className="text-xs text-zinc-500">Verify all integrations are working</p>
              </div>
            </div>

            <div className="space-y-3">
              {/* Shopify Connection */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[#09090b] border border-[#27272a]">
                <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">Shopify Store</p>
                  <p className="text-xs text-zinc-500">{agent.storeName || "Connected"}</p>
                </div>
                <Badge className="bg-green-500/10 text-green-400 text-[10px]">Connected</Badge>
              </div>

              {/* Google Sheet Connection */}
              {configValues.googleSheetUrl !== undefined && (
                <div className="rounded-lg bg-[#09090b] border border-[#27272a]">
                  <div className="flex items-center gap-3 p-3">
                    {configValues.googleSheetUrl ? (
                      <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white">Google Sheet</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {configValues.googleSheetUrl || "No sheet URL configured"}
                      </p>
                    </div>
                    {configValues.googleSheetUrl ? (
                      <a
                        href={configValues.googleSheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zinc-500 hover:text-blue-400 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <Badge className="bg-red-500/10 text-red-400 text-[10px]">Missing</Badge>
                    )}
                  </div>
                  <div className="px-3 pb-3 ml-7">
                    <p className="text-[11px] text-amber-400/70">
                      Your sheet must be set to &quot;Anyone with the link can view&quot; for the agent to read it.
                      We only read data — we never modify your sheet.
                    </p>
                  </div>
                </div>
              )}

              {/* Shopify Scopes */}
              {template?.requiredScopes && template.requiredScopes.length > 0 && (
                <div className="p-3 rounded-lg bg-[#09090b] border border-[#27272a]">
                  <div className="flex items-center gap-3 mb-2">
                    <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
                    <p className="text-sm text-white">Required Shopify Scopes</p>
                  </div>
                  <div className="flex flex-wrap gap-1 ml-7">
                    {template.requiredScopes.map((scope) => (
                      <span
                        key={scope}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400/80 font-mono"
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-600 mt-2 ml-7">
                    Make sure your Shopify app has all these scopes enabled
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Agent Capabilities */}
        {template && template.taskDefinitions?.length > 0 && (
          <Card className="bg-[#0a0a0a] border-[#27272a]">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-purple-500/10 p-2 rounded-lg">
                  <ListChecks className="h-4 w-4 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Agent Capabilities</h2>
                  <p className="text-xs text-zinc-500">Tasks this agent can perform</p>
                </div>
              </div>

              <div className="space-y-3">
                {template.taskDefinitions.map((task) => {
                  const trigger = triggerConfig[task.trigger] ?? triggerConfig.on_request;
                  const TriggerIcon = trigger.icon;
                  const enabled = enabledTasks[task.id] !== false;

                  return (
                    <div
                      key={task.id}
                      className={cn(
                        "flex items-center gap-4 p-3.5 rounded-lg border transition-colors",
                        enabled
                          ? "bg-[#09090b] border-[#27272a]"
                          : "bg-[#09090b]/50 border-[#27272a]/50 opacity-60"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-0.5">
                          <span className="text-sm font-medium text-white">
                            {task.name}
                          </span>
                          <Badge
                            className={cn("text-[10px] font-medium px-1.5 py-0", trigger.color)}
                          >
                            <TriggerIcon className="h-2.5 w-2.5 mr-1" />
                            {task.trigger.replace("_", " ")}
                          </Badge>
                        </div>
                        <p className="text-xs text-zinc-500">{task.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleTask(task.id)}
                        className={cn(
                          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
                          enabled ? "bg-blue-500" : "bg-zinc-700"
                        )}
                      >
                        <span
                          className={cn(
                            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform",
                            enabled ? "translate-x-4" : "translate-x-0"
                          )}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Section 3: Business Rules */}
        <Card className="bg-[#0a0a0a] border-[#27272a]">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-amber-500/10 p-2 rounded-lg">
                <Zap className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Business Rules</h2>
                <p className="text-xs text-zinc-500">
                  Custom rules that guide agent behavior
                </p>
              </div>
            </div>

            {customRules.length > 0 && (
              <div className="space-y-2 mb-4">
                {customRules.map((rule, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 bg-[#09090b] rounded-lg border border-[#27272a] group"
                  >
                    <span className="flex-1 text-sm text-zinc-300">{rule}</span>
                    <button
                      type="button"
                      onClick={() => removeRule(index)}
                      className="text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {customRules.length === 0 && (
              <div className="text-center py-6 mb-4">
                <p className="text-xs text-zinc-600">
                  No rules added yet. Examples:
                </p>
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {[
                    "Always respond in Dutch",
                    "Never discount more than 20%",
                    "Escalate orders over \u20AC500",
                  ].map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setCustomRules((prev) => [...prev, example])}
                      className="text-xs text-zinc-500 bg-zinc-800/50 hover:bg-zinc-800 border border-[#27272a] rounded-md px-2.5 py-1 transition-colors cursor-pointer"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Input
                value={newRule}
                onChange={(e) => setNewRule(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a new rule..."
                className="bg-[#09090b] border-[#27272a] text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500"
              />
              <Button
                type="button"
                onClick={addRule}
                disabled={!newRule.trim()}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-[#27272a] shrink-0"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Rule
              </Button>
            </div>
          </CardContent>
        </Card>


        {/* Save Button */}
        <div className="flex justify-end pt-2 pb-8">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-500 hover:bg-blue-600 text-white font-medium px-8"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
