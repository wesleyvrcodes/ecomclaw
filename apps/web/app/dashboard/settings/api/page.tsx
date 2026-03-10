"use client";

import { useState, useEffect } from "react";
import {
  Key,
  Eye,
  EyeOff,
  Check,
  Loader2,
  AlertCircle,
  ChevronDown,
  Info,
  Zap,
  DollarSign,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface UserSettings {
  aiProvider: string;
  apiKey: string;
  openAiApiKey: string;
  openRouterApiKey: string;
  defaultModel: string;
}

const PROVIDERS = [
  {
    id: "openrouter",
    label: "OpenRouter",
    keyPrefix: "sk-or-",
    description: "One API key for all models. Claude, GPT, Gemini, Llama & more.",
    setupUrl: "openrouter.ai/keys",
    setupSteps: [
      "Go to openrouter.ai/keys",
      'Click "Create Key"',
      "Add credits to your account",
      "Paste the key here",
    ],
    recommended: true,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    keyPrefix: "sk-ant-",
    description: "Direct access to Claude models.",
    setupUrl: "console.anthropic.com",
    setupSteps: [
      "Go to console.anthropic.com",
      'Click "API Keys" in the sidebar',
      'Click "Create Key"',
      "Copy and paste it here",
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    keyPrefix: "sk-",
    description: "Direct access to GPT models.",
    setupUrl: "platform.openai.com",
    setupSteps: [
      "Go to platform.openai.com",
      'Click your profile, then "API Keys"',
      'Click "Create new secret key"',
      "Copy and paste it here",
    ],
  },
];

interface ModelInfo {
  id: string;
  label: string;
  description: string;
  speed: "fast" | "medium" | "slow";
  quality: "good" | "great" | "best";
  costPer1kTokens: number; // approximate cost in USD per 1K output tokens
  listingsPerDollar: number; // estimated product listings per $1
}

const MODELS: Record<string, ModelInfo[]> = {
  openrouter: [
    {
      id: "anthropic/claude-sonnet-4-5",
      label: "Claude Sonnet 4.5",
      description: "Best for product listings. Fast, smart, great with tools.",
      speed: "fast",
      quality: "best",
      costPer1kTokens: 0.015,
      listingsPerDollar: 25,
    },
    {
      id: "anthropic/claude-haiku-4-5",
      label: "Claude Haiku 4.5",
      description: "Ultra fast & cheap. Good for simple tasks and reports.",
      speed: "fast",
      quality: "good",
      costPer1kTokens: 0.005,
      listingsPerDollar: 80,
    },
    {
      id: "openai/gpt-4o",
      label: "GPT-4o",
      description: "OpenAI's flagship. Good all-rounder.",
      speed: "fast",
      quality: "great",
      costPer1kTokens: 0.01,
      listingsPerDollar: 35,
    },
    {
      id: "openai/gpt-4o-mini",
      label: "GPT-4o Mini",
      description: "Budget option. Fast but less capable with complex tasks.",
      speed: "fast",
      quality: "good",
      costPer1kTokens: 0.0006,
      listingsPerDollar: 500,
    },
    {
      id: "google/gemini-2.5-pro-preview",
      label: "Gemini 2.5 Pro",
      description: "Google's latest. Strong reasoning, competitive pricing.",
      speed: "medium",
      quality: "great",
      costPer1kTokens: 0.01,
      listingsPerDollar: 35,
    },
  ],
  anthropic: [
    {
      id: "claude-sonnet-4-5-20250514",
      label: "Claude Sonnet 4.5",
      description: "Best for product listings. Fast, smart, great with tools.",
      speed: "fast",
      quality: "best",
      costPer1kTokens: 0.015,
      listingsPerDollar: 25,
    },
    {
      id: "claude-haiku-4-5-20251001",
      label: "Claude Haiku 4.5",
      description: "Ultra fast & cheap. Good for simple tasks.",
      speed: "fast",
      quality: "good",
      costPer1kTokens: 0.005,
      listingsPerDollar: 80,
    },
  ],
  openai: [
    {
      id: "gpt-4o",
      label: "GPT-4o",
      description: "OpenAI's flagship. Good all-rounder.",
      speed: "fast",
      quality: "great",
      costPer1kTokens: 0.01,
      listingsPerDollar: 35,
    },
    {
      id: "gpt-4o-mini",
      label: "GPT-4o Mini",
      description: "Budget option. Fast but less capable.",
      speed: "fast",
      quality: "good",
      costPer1kTokens: 0.0006,
      listingsPerDollar: 500,
    },
  ],
};

const SPEED_LABELS = { fast: "Fast", medium: "Medium", slow: "Slow" };
const QUALITY_LABELS = { good: "Good", great: "Great", best: "Best" };
const QUALITY_COLORS = {
  good: "text-zinc-400",
  great: "text-blue-400",
  best: "text-emerald-400",
};

export default function ApiSettingsPage() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [provider, setProvider] = useState("openrouter");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [model, setModel] = useState("anthropic/claude-sonnet-4-5");

  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .get<UserSettings>("/settings")
      .then((data) => {
        if (data.aiProvider) setProvider(data.aiProvider);
        if (data.apiKey) setAnthropicKey(data.apiKey);
        if (data.openAiApiKey) setOpenaiKey(data.openAiApiKey);
        if (data.openRouterApiKey) setOpenrouterKey(data.openRouterApiKey);
        if (data.defaultModel) setModel(data.defaultModel);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);

    const activeKey = provider === "anthropic" ? anthropicKey : provider === "openai" ? openaiKey : openrouterKey;
    if (!activeKey.trim()) {
      setError(`Please enter your ${PROVIDERS.find((p) => p.id === provider)?.label} API key.`);
      setSaving(false);
      return;
    }

    try {
      await api.put("/settings", {
        aiProvider: provider,
        apiKey: anthropicKey.trim(),
        openAiApiKey: openaiKey.trim(),
        openRouterApiKey: openrouterKey.trim(),
        defaultModel: model,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const activeModels = MODELS[provider] || [];
  const selectedModel = activeModels.find((m) => m.id === model) || activeModels[0];
  const activeProvider = PROVIDERS.find((p) => p.id === provider)!;

  const activeKey = provider === "anthropic" ? anthropicKey : provider === "openai" ? openaiKey : openrouterKey;
  const setActiveKey = provider === "anthropic" ? setAnthropicKey : provider === "openai" ? setOpenaiKey : setOpenrouterKey;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Provider Selection */}
      <Card className="bg-[#0a0a0a] border-[#27272a]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-white">
            <Key className="h-5 w-5 text-amber-500" />
            AI Provider
          </CardTitle>
          <p className="text-xs text-zinc-500 mt-1">
            Choose where your agents send API requests. Keys are encrypted and never shared.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setProvider(p.id);
                  setModel(MODELS[p.id][0].id);
                  setShowKey(false);
                }}
                className={cn(
                  "relative flex items-start gap-3 p-3 rounded-lg border text-left transition-all duration-200",
                  provider === p.id
                    ? "bg-blue-500/10 border-blue-500/50"
                    : "bg-[#09090b] border-[#27272a] hover:border-zinc-600"
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 transition-colors",
                    provider === p.id ? "border-blue-500 bg-blue-500" : "border-zinc-600"
                  )}
                >
                  {provider === p.id && (
                    <div className="h-full w-full flex items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-medium", provider === p.id ? "text-blue-400" : "text-zinc-300")}>
                      {p.label}
                    </span>
                    {p.recommended && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">{p.description}</p>
                </div>
              </button>
            ))}
          </div>

          {/* API Key Input */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Label className="text-zinc-300">
                {activeProvider.label} API Key <span className="text-red-400">*</span>
              </Label>
              <div className="group relative">
                <Info className="h-3.5 w-3.5 text-zinc-600 hover:text-zinc-400 cursor-help transition-colors" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-zinc-800 border border-[#27272a] rounded-lg p-3 text-xs text-zinc-300 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 shadow-xl">
                  <p className="font-medium text-white mb-1">How to get your key:</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-zinc-400">
                    {activeProvider.setupSteps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-zinc-800" />
                </div>
              </div>
            </div>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={activeKey}
                onChange={(e) => setActiveKey(e.target.value)}
                placeholder={`${activeProvider.keyPrefix}...`}
                className="bg-[#09090b] border-[#27272a] pr-10 text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Model Selection */}
      <Card className="bg-[#0a0a0a] border-[#27272a]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-white">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Model
          </CardTitle>
          <p className="text-xs text-zinc-500 mt-1">
            Choose which AI model powers your agents. This affects quality, speed, and cost.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeModels.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setModel(m.id)}
              className={cn(
                "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all duration-200",
                model === m.id
                  ? "bg-blue-500/10 border-blue-500/50"
                  : "bg-[#09090b] border-[#27272a] hover:border-zinc-600"
              )}
            >
              <div
                className={cn(
                  "mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 transition-colors",
                  model === m.id ? "border-blue-500 bg-blue-500" : "border-zinc-600"
                )}
              >
                {model === m.id && (
                  <div className="h-full w-full flex items-center justify-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={cn("text-sm font-medium", model === m.id ? "text-blue-400" : "text-zinc-300")}>
                    {m.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", QUALITY_COLORS[m.quality], "bg-zinc-800/50")}>
                      {QUALITY_LABELS[m.quality]}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">{m.description}</p>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-zinc-600">
                  <span className="flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    {SPEED_LABELS[m.speed]}
                  </span>
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    ${m.costPer1kTokens}/1K tokens
                  </span>
                  <span>~{m.listingsPerDollar} listings/$1</span>
                </div>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Cost Estimate */}
      {selectedModel && (
        <Card className="bg-[#0a0a0a] border-[#27272a]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-white">
              <DollarSign className="h-5 w-5 text-emerald-500" />
              Cost Estimate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-[#09090b] border border-[#27272a] rounded-lg p-3 text-center">
                <p className="text-lg font-semibold text-white">{selectedModel.listingsPerDollar}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">listings per $1</p>
              </div>
              <div className="bg-[#09090b] border border-[#27272a] rounded-lg p-3 text-center">
                <p className="text-lg font-semibold text-white">
                  ~${(10 / selectedModel.listingsPerDollar).toFixed(2)}
                </p>
                <p className="text-[10px] text-zinc-500 mt-0.5">cost for 10 listings</p>
              </div>
              <div className="bg-[#09090b] border border-[#27272a] rounded-lg p-3 text-center">
                <p className="text-lg font-semibold text-white">
                  ~${(100 / selectedModel.listingsPerDollar).toFixed(2)}
                </p>
                <p className="text-[10px] text-zinc-500 mt-0.5">cost for 100 listings</p>
              </div>
            </div>
            <p className="text-[10px] text-zinc-600 mt-2">
              Estimates based on average product listing with description, tags, and variants.
              Actual cost depends on product complexity and description length. Chat messages cost less.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Save */}
      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : saved ? (
          <>
            <Check className="h-4 w-4" />
            Saved — changes pushed to all active agents
          </>
        ) : (
          "Save Settings"
        )}
      </Button>
    </div>
  );
}
