"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Rocket,
  Store,
  Loader2,
  AlertCircle,
  ChevronDown,
  Sparkles,
  Bot,
  Check,
  Plus,
  ShoppingBag,
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  MessageCircle,
  DollarSign,
  Type,
  AlignLeft,
  BookOpen,
  Tag,
  X,
  ToggleLeft,
  ToggleRight,
  Info,
  Copy,
} from "lucide-react";
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
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ConfigField {
  key: string;
  label: string;
  type: string;
  defaultValue: string;
  placeholder: string;
  required: boolean;
}

interface ApiTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  configFields: ConfigField[];
  requiredScopes: string[];
}

interface StoreItem {
  id: string;
  name: string;
  storeUrl: string;
  isConnected: boolean;
  productCount: number;
}

interface SopRuleCategory {
  name: string;
  icon: string;
  rules: string[];
}

const sopIconMap: Record<string, React.ElementType> = {
  "message-circle": MessageCircle,
  "check-circle": CheckCircle,
  "x-circle": XCircle,
  type: Type,
  "align-left": AlignLeft,
  "dollar-sign": DollarSign,
  tag: Tag,
  "book-open": BookOpen,
};

const categoryColors: Record<string, { color: string; bgColor: string }> = {
  Google: { color: "text-blue-500", bgColor: "bg-blue-500/10" },
  Meta: { color: "text-indigo-500", bgColor: "bg-indigo-500/10" },
  Analytics: { color: "text-purple-500", bgColor: "bg-purple-500/10" },
  Marketing: { color: "text-emerald-500", bgColor: "bg-emerald-500/10" },
  Support: { color: "text-amber-500", bgColor: "bg-amber-500/10" },
  Operations: { color: "text-rose-500", bgColor: "bg-rose-500/10" },
};

function getTemplateStyle(category: string) {
  return categoryColors[category] || { color: "text-zinc-400", bgColor: "bg-zinc-500/10" };
}

export default function StorePage() {
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>(["All"]);

  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [deployTemplate, setDeployTemplate] = useState<ApiTemplate | null>(null);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);

  // Deploy form state
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [agentName, setAgentName] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [deployLoading, setDeployLoading] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deploySuccess, setDeploySuccess] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  // Add store inline state
  const [showAddStore, setShowAddStore] = useState(false);
  const [scopesCopied, setScopesCopied] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreUrl, setNewStoreUrl] = useState("");
  const [newClientId, setNewClientId] = useState("");
  const [newClientSecret, setNewClientSecret] = useState("");
  const [addStoreLoading, setAddStoreLoading] = useState(false);
  const [addStoreError, setAddStoreError] = useState<string | null>(null);
  const [addStoreValidating, setAddStoreValidating] = useState(false);
  const [addStoreValidation, setAddStoreValidation] = useState<{valid: boolean; message: string; storeName?: string; productCount?: number} | null>(null);

  // SOP upload state
  const [sopMode, setSopMode] = useState<"upload" | "manual">("upload");
  const [sopFile, setSopFile] = useState<File | null>(null);
  const [sopParsing, setSopParsing] = useState(false);
  const [sopError, setSopError] = useState<string | null>(null);
  const [sopRules, setSopRules] = useState<SopRuleCategory[]>([]);
  const [sopRuleToggles, setSopRuleToggles] = useState<Record<string, boolean>>({});
  const [sopParsed, setSopParsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setTemplatesLoading(true);
        setTemplatesError(null);
        const data = await api.get<ApiTemplate[]>("/templates");
        setTemplates(data);
        const uniqueCategories = Array.from(new Set(data.map((t) => t.category)));
        setCategories(["All", ...uniqueCategories]);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to load templates";
        setTemplatesError(message);
      } finally {
        setTemplatesLoading(false);
      }
    };
    fetchTemplates();
  }, []);

  const fetchStores = useCallback(async () => {
    try {
      setStoresLoading(true);
      const data = await api.get<StoreItem[]>("/stores");
      setStores(data);
      // Auto-select if only one store
      if (data.length === 1) {
        setSelectedStoreId(data[0].id);
      }
    } catch {
      setStores([]);
    } finally {
      setStoresLoading(false);
    }
  }, []);

  // SOP file upload & parsing
  const handleSopFile = useCallback(async (file: File) => {
    const allowed = [".pdf", ".docx", ".txt"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowed.includes(ext)) {
      setSopError("Only PDF, DOCX, and TXT files are supported.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setSopError("File too large. Maximum 10MB.");
      return;
    }

    setSopFile(file);
    setSopError(null);
    setSopParsing(true);
    setSopParsed(false);
    setSopRules([]);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("clawcommerce_token");
      const res = await fetch("/api/onboarding/parse-sop", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Upload failed (${res.status})`);
      }

      const data = await res.json();
      const rules: SopRuleCategory[] = data.rules || [];
      setSopRules(rules);

      const toggles: Record<string, boolean> = {};
      rules.forEach((cat) => {
        cat.rules.forEach((_, i) => {
          toggles[`${cat.name}-${i}`] = true;
        });
      });
      setSopRuleToggles(toggles);
      setSopParsed(true);

      buildPromptFromRules(rules, toggles);
    } catch (err) {
      setSopError(err instanceof Error ? err.message : "Failed to parse file");
      setSopFile(null);
    } finally {
      setSopParsing(false);
    }
  }, []);

  const buildPromptFromRules = (rules: SopRuleCategory[], toggles: Record<string, boolean>) => {
    const sections: string[] = [];
    rules.forEach((cat) => {
      const enabledRules = cat.rules.filter((_, i) => toggles[`${cat.name}-${i}`] !== false);
      if (enabledRules.length > 0) {
        sections.push(`## ${cat.name}\n${enabledRules.map((r) => `- ${r}`).join("\n")}`);
      }
    });
    if (sections.length > 0) {
      setCustomPrompt(sections.join("\n\n"));
    }
  };

  const toggleSopRule = (key: string) => {
    setSopRuleToggles((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      buildPromptFromRules(sopRules, updated);
      return updated;
    });
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleSopFile(file);
    },
    [handleSopFile]
  );

  const resetAddStore = () => {
    setShowAddStore(false);
    setNewStoreName("");
    setNewStoreUrl("");
    setNewClientId("");
    setNewClientSecret("");
    setAddStoreError(null);
    setAddStoreValidating(false);
    setAddStoreValidation(null);
  };

  const handleValidateStore = async () => {
    if (!newStoreUrl || !newClientId || !newClientSecret) return;
    try {
      setAddStoreValidating(true);
      setAddStoreError(null);
      setAddStoreValidation(null);
      const result = await api.post<{valid: boolean; message: string; storeName?: string; productCount?: number}>("/stores/validate", {
        storeUrl: newStoreUrl.trim(),
        clientId: newClientId.trim(),
        clientSecret: newClientSecret.trim(),
      });
      setAddStoreValidation(result);
      if (result.valid && result.storeName && !newStoreName) {
        setNewStoreName(result.storeName);
      }
    } catch (err) {
      setAddStoreError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setAddStoreValidating(false);
    }
  };

  const handleAddStore = async () => {
    if (!newStoreName.trim() || !newStoreUrl.trim() || !newClientId.trim() || !newClientSecret.trim()) {
      setAddStoreError("All fields are required");
      return;
    }
    try {
      setAddStoreLoading(true);
      setAddStoreError(null);
      const store = await api.post<StoreItem>("/stores", {
        name: newStoreName.trim(),
        storeUrl: newStoreUrl.trim(),
        clientId: newClientId.trim(),
        clientSecret: newClientSecret.trim(),
      });
      // Add to stores list and auto-select
      setStores(prev => [...prev, store]);
      setSelectedStoreId(store.id);
      resetAddStore();
    } catch (err) {
      setAddStoreError(err instanceof Error ? err.message : "Failed to add store");
    } finally {
      setAddStoreLoading(false);
    }
  };

  const openDeployModal = async (template: ApiTemplate) => {
    setDeployTemplate(template);
    setSelectedStoreId("");
    setAgentName("");
    setCustomPrompt("");
    const defaults: Record<string, string> = {};
    template.configFields.forEach((f) => {
      if (f.defaultValue) {
        defaults[f.key] = f.defaultValue;
      }
    });
    setConfigValues(defaults);
    setDeployError(null);
    setDeploySuccess(false);
    setSopMode("upload");
    setSopFile(null);
    setSopParsed(false);
    setSopRules([]);
    setSopRuleToggles({});
    setSopError(null);
    fetchStores();

    // Check if user has an API key configured
    try {
      const settings = await api.get<{ apiKey?: string; openAiApiKey?: string }>("/settings");
      setHasApiKey(!!(settings.apiKey || settings.openAiApiKey));
    } catch {
      setHasApiKey(false);
    }
  };

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deployTemplate) return;

    // Form validation
    if (!selectedStoreId) {
      setDeployError("Please select a store before deploying.");
      return;
    }
    if (!agentName.trim()) {
      setDeployError("Please enter an agent name.");
      return;
    }
    if (hasApiKey === false) {
      setDeployError("An API key is required. Add one in Settings before deploying.");
      return;
    }
    // Validate required config fields
    const missingFields = deployTemplate.configFields
      .filter((f) => f.required && !configValues[f.key]?.trim())
      .map((f) => f.label);
    if (missingFields.length > 0) {
      setDeployError(`Please fill in required fields: ${missingFields.join(", ")}`);
      return;
    }

    try {
      setDeployLoading(true);
      setDeployError(null);

      // Step 1: Create agent
      const agent = await api.post<{ id: string }>("/agents", {
        templateId: deployTemplate.id,
        storeId: selectedStoreId,
        name: agentName.trim(),
        customPrompt: customPrompt.trim(),
        configuration: configValues,
      });

      // Step 2: Deploy via Fly.io (mock mode in dev)
      try {
        await api.post("/deployments", {
          agentId: agent.id,
        });
      } catch (deployErr: unknown) {
        // Agent created but deployment failed — still show as created
        const msg = deployErr instanceof Error ? deployErr.message : "Deployment failed";
        setDeployError(`Agent created but deployment failed: ${msg}. You can retry from the Agents page.`);
        setDeployLoading(false);
        return;
      }

      setDeploySuccess(true);
      setTimeout(() => {
        setDeployTemplate(null);
        setDeploySuccess(false);
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to deploy agent";
      setDeployError(message);
    } finally {
      setDeployLoading(false);
    }
  };

  // Keep filtered templates in sync


  const filtered = templates.filter((t) => {
    const matchesCategory =
      activeCategory === "All" || t.category === activeCategory;
    const matchesSearch =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Agent Store</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Browse and deploy pre-built AI agent templates
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <Input
          type="text"
          placeholder="Search agents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md bg-[#0a0a0a] border-[#27272a] pl-10 text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500"
        />
      </div>

      {/* Category tabs */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory} className="mb-6">
        <TabsList className="bg-transparent gap-2 h-auto p-0">
          {categories.map((cat) => (
            <TabsTrigger
              key={cat}
              value={cat}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap data-[state=active]:bg-blue-500 data-[state=active]:text-white",
                "bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 border border-[#27272a] data-[state=active]:border-blue-500"
              )}
            >
              {cat}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Loading state */}
      {templatesLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
        </div>
      )}

      {/* Error state */}
      {templatesError && !templatesLoading && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-400">{templatesError}</p>
        </div>
      )}

      {/* Grid */}
      {!templatesLoading && !templatesError && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((template) => {
              const style = getTemplateStyle(template.category);
              return (
                <Card
                  key={template.id}
                  className="bg-[#0a0a0a] border-[#27272a] hover:border-zinc-600 transition-colors group flex flex-col"
                >
                  <CardContent className="p-5 flex flex-col flex-1">
                    <div className="flex items-start justify-between mb-4">
                      <div className={cn("p-2.5 rounded-lg", style.bgColor)}>
                        <Bot className={cn("h-5 w-5", style.color)} />
                      </div>
                      <Badge variant="secondary" className="bg-zinc-800 text-zinc-400 hover:bg-zinc-800">
                        {template.category}
                      </Badge>
                    </div>
                    <h3 className="text-sm font-semibold text-white mb-2">
                      {template.name}
                    </h3>
                    <p className="text-xs text-zinc-500 leading-relaxed flex-1 mb-4">
                      {template.description}
                    </p>
                    <Button
                      onClick={() => openDeployModal(template)}
                      variant="outline"
                      className="w-full bg-zinc-800 hover:bg-blue-500 text-zinc-300 hover:text-white border-[#27272a] hover:border-blue-500 group-hover:bg-blue-500 group-hover:text-white group-hover:border-blue-500 transition-all"
                    >
                      <Rocket className="h-3.5 w-3.5" />
                      Deploy
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <Card className="bg-[#0a0a0a] border-[#27272a]">
              <CardContent className="p-12 text-center">
                <Search className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400 text-sm">
                  No agents found matching your search.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Deploy Modal */}
      <Dialog open={!!deployTemplate} onOpenChange={(open) => !open && setDeployTemplate(null)}>
        <DialogContent className="bg-[#0a0a0a] border-[#27272a] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            {deployTemplate && (
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", getTemplateStyle(deployTemplate.category).bgColor)}>
                  <Bot
                    className={cn("h-4 w-4", getTemplateStyle(deployTemplate.category).color)}
                  />
                </div>
                <div>
                  <DialogTitle className="text-base font-semibold text-white">
                    Deploy {deployTemplate.name}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-zinc-500">
                    Configure and deploy to a store
                  </DialogDescription>
                </div>
              </div>
            )}
          </DialogHeader>

          {deploySuccess ? (
            <div className="p-10 text-center">
              <div className="bg-green-500/10 p-4 rounded-full w-fit mx-auto mb-4">
                <Rocket className="h-8 w-8 text-green-500" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-1">
                Agent Deployed!
              </h3>
              <p className="text-sm text-zinc-400">
                Your agent is now running and ready to work.
              </p>
            </div>
          ) : storesLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
            </div>
          ) : (
            <form onSubmit={handleDeploy} className="space-y-5">
              {deployError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                  <p className="text-sm text-red-400">{deployError}</p>
                </div>
              )}

              {hasApiKey === false && (
                <div className="bg-amber-500/10 border-2 border-amber-500/40 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                    <p className="text-sm font-semibold text-amber-400">AI API key required</p>
                  </div>
                  <p className="text-xs text-zinc-400 ml-7 mb-3">
                    Your agent needs an Anthropic or OpenAI API key to function.
                    You must configure one before deploying any agents.
                  </p>
                  <div className="ml-7">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => window.location.href = "/dashboard/settings/api"}
                      className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30 hover:border-amber-500/50 text-xs h-8"
                    >
                      <Sparkles className="h-3 w-3" />
                      Add API Key
                    </Button>
                  </div>
                </div>
              )}

              {/* Store selector */}
              <div>
                <Label className="text-zinc-300 mb-2">
                  Select Store <span className="text-red-400">*</span>
                </Label>
                <div className="space-y-2">
                  {stores.map((store) => {
                    const isSelected = selectedStoreId === store.id;
                    return (
                      <button
                        key={store.id}
                        type="button"
                        onClick={() => setSelectedStoreId(store.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-200 text-left",
                          isSelected
                            ? "bg-blue-500/10 border-blue-500/50 ring-1 ring-blue-500/20"
                            : "bg-[#09090b] border-[#27272a] hover:border-zinc-600"
                        )}
                      >
                        <div className={cn(
                          "p-2 rounded-lg shrink-0",
                          isSelected ? "bg-blue-500/20" : "bg-zinc-800"
                        )}>
                          <ShoppingBag className={cn(
                            "h-4 w-4",
                            isSelected ? "text-blue-400" : "text-zinc-500"
                          )} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm font-medium truncate",
                            isSelected ? "text-white" : "text-zinc-300"
                          )}>
                            {store.name}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {store.productCount > 0
                              ? `${store.productCount} products`
                              : store.storeUrl
                                ? `${store.storeUrl}.myshopify.com`
                                : "Connected"}
                                                      </p>
                        </div>
                        {isSelected && (
                          <div className="bg-blue-500 rounded-full p-0.5 shrink-0">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </button>
                    );
                  })}

                  {/* Add new store inline */}
                  {!showAddStore ? (
                    <button
                      type="button"
                      onClick={() => setShowAddStore(true)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-[#27272a] hover:border-zinc-600 transition-colors text-left group"
                    >
                      <div className="p-2 rounded-lg bg-zinc-800 group-hover:bg-zinc-700 transition-colors shrink-0">
                        <Plus className="h-4 w-4 text-zinc-500 group-hover:text-zinc-300" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-400 group-hover:text-zinc-300">
                          Connect a new store
                        </p>
                      </div>
                    </button>
                  ) : (
                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-white">Connect Shopify Store</p>
                        <button type="button" onClick={resetAddStore} className="text-zinc-500 hover:text-zinc-300">
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {addStoreError && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                          <p className="text-red-400 text-xs">{addStoreError}</p>
                        </div>
                      )}

                      {addStoreValidation && (
                        <div className={cn(
                          "rounded-lg px-3 py-2 border",
                          addStoreValidation.valid
                            ? "bg-green-500/10 border-green-500/20"
                            : "bg-red-500/10 border-red-500/20"
                        )}>
                          <p className={cn("text-xs", addStoreValidation.valid ? "text-green-400" : "text-red-400")}>
                            {addStoreValidation.message}
                          </p>
                        </div>
                      )}

                      <div>
                        <Label className="text-zinc-400 text-xs mb-1">Store URL</Label>
                        <Input
                          type="text"
                          value={newStoreUrl}
                          onChange={(e) => { setNewStoreUrl(e.target.value); setAddStoreValidation(null); }}
                          placeholder="your-store.myshopify.com"
                          className="bg-[#09090b] border-[#27272a] text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 text-sm h-9"
                        />
                      </div>

                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Label className="text-zinc-400 text-xs">Client ID & Secret</Label>
                          <div className="group relative">
                            <Info className="h-3 w-3 text-zinc-600 hover:text-blue-400 cursor-help transition-colors" />
                            <div className="absolute top-1/2 left-full -translate-y-1/2 ml-3 w-80 p-3 rounded-lg bg-[#18181b] border border-[#27272a] shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                              <p className="text-xs text-zinc-300 font-medium mb-2">How to create your Shopify app:</p>
                              <ol className="text-[11px] text-zinc-400 space-y-1.5 list-decimal list-inside">
                                <li>Go to your <span className="text-blue-400">Shopify Admin</span> dashboard</li>
                                <li>Navigate to <span className="text-white">Settings → Apps and sales channels</span></li>
                                <li>Click <span className="text-white">Develop apps</span> (top right). If you don&apos;t see it, click <span className="text-white">Allow custom app development</span> first</li>
                                <li>Click <span className="text-white">Create an app</span> → name it <span className="text-blue-400">ClawCommerce</span></li>
                                <li>Go to <span className="text-white">Configuration</span> → <span className="text-white">Admin API integration</span></li>
                                <li>Click <span className="text-white">Configure</span> and enable the required scopes (see below)</li>
                                <li>Click <span className="text-white">Save</span>, then go to <span className="text-white">API credentials</span></li>
                                <li>Click <span className="text-white">Install app</span> → copy the <span className="text-white">Admin API access token</span></li>
                                <li>Copy the <span className="text-white">API key</span> (Client ID) and <span className="text-white">API secret key</span> (Client Secret)</li>
                              </ol>
                              {deployTemplate?.requiredScopes && deployTemplate.requiredScopes.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-[#27272a]">
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="text-[11px] text-zinc-300 font-medium">Required scopes for {deployTemplate.name}:</p>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigator.clipboard.writeText(deployTemplate.requiredScopes.join(", "));
                                        setScopesCopied(true);
                                        setTimeout(() => setScopesCopied(false), 2000);
                                      }}
                                      className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-blue-400 transition-colors"
                                    >
                                      {scopesCopied ? (
                                        <><Check className="h-3 w-3 text-green-400" /><span className="text-green-400">Copied!</span></>
                                      ) : (
                                        <><Copy className="h-3 w-3" /> Copy all</>
                                      )}
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {deployTemplate.requiredScopes.map((scope) => (
                                      <span key={scope} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono">
                                        {scope}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="mt-2 pt-2 border-t border-[#27272a]">
                                <p className="text-[10px] text-zinc-500">Tip: Enable all scopes you might need. You can deploy multiple agents to the same store.</p>
                              </div>
                              <div className="absolute top-1/2 right-full -translate-y-1/2 -mr-px border-4 border-transparent border-r-[#27272a]" />
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            type="text"
                            value={newClientId}
                            onChange={(e) => { setNewClientId(e.target.value); setAddStoreValidation(null); }}
                            placeholder="Client ID"
                            className="bg-[#09090b] border-[#27272a] text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 text-sm h-9"
                          />
                          <Input
                            type="password"
                            value={newClientSecret}
                            onChange={(e) => { setNewClientSecret(e.target.value); setAddStoreValidation(null); }}
                            placeholder="Client Secret"
                            className="bg-[#09090b] border-[#27272a] text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 text-sm h-9"
                          />
                        </div>
                      </div>

                      <div>
                        <Label className="text-zinc-400 text-xs mb-1">Store Name</Label>
                        <Input
                          type="text"
                          value={newStoreName}
                          onChange={(e) => setNewStoreName(e.target.value)}
                          placeholder="My Store"
                          className="bg-[#09090b] border-[#27272a] text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 text-sm h-9"
                        />
                      </div>

                      <div className="flex gap-2">
                        {!addStoreValidation?.valid && (
                          <Button
                            type="button"
                            onClick={handleValidateStore}
                            disabled={addStoreValidating || !newStoreUrl || !newClientId || !newClientSecret}
                            variant="outline"
                            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-[#27272a] text-xs h-9"
                          >
                            {addStoreValidating ? (
                              <><Loader2 className="h-3 w-3 animate-spin" /> Validating...</>
                            ) : (
                              <><Check className="h-3 w-3" /> Validate Connection</>
                            )}
                          </Button>
                        )}
                        {addStoreValidation?.valid && (
                          <Button
                            type="button"
                            onClick={handleAddStore}
                            disabled={addStoreLoading || !newStoreName}
                            className="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs h-9"
                          >
                            {addStoreLoading ? (
                              <><Loader2 className="h-3 w-3 animate-spin" /> Adding...</>
                            ) : (
                              <><Plus className="h-3 w-3" /> Add Store</>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Agent Name */}
              <div>
                <Label className="text-zinc-300 mb-1.5">
                  Agent Name <span className="text-red-400">*</span>
                </Label>
                <Input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="e.g. Jacky - Product Lister"
                  className="bg-[#09090b] border-[#27272a] text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500"
                />
              </div>

              {/* Agent Instructions — SOP upload or manual */}
              <div>
                <Label className="text-zinc-300 mb-2">Agent Instructions</Label>
                <div className="flex gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setSopMode("upload")}
                    className={cn(
                      "flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 flex items-center justify-center gap-1.5",
                      sopMode === "upload"
                        ? "bg-blue-500/10 border-blue-500/50 text-blue-400"
                        : "bg-[#09090b] border-[#27272a] text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    <Upload className="h-3 w-3" />
                    Upload SOP
                  </button>
                  <button
                    type="button"
                    onClick={() => setSopMode("manual")}
                    className={cn(
                      "flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 flex items-center justify-center gap-1.5",
                      sopMode === "manual"
                        ? "bg-blue-500/10 border-blue-500/50 text-blue-400"
                        : "bg-[#09090b] border-[#27272a] text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    <Sparkles className="h-3 w-3" />
                    Write manually
                  </button>
                </div>

                {sopMode === "upload" ? (
                  <div>
                    {/* Intro text */}
                    {!sopParsed && !sopParsing && (
                      <p className="text-xs text-zinc-400 mb-2">
                        Already have an SOP or guidelines for your team? Upload it and we&apos;ll turn it into agent instructions automatically.
                      </p>
                    )}

                    {/* Drop zone */}
                    {!sopParsed && !sopParsing && (
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={cn(
                          "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-200",
                          isDragging
                            ? "border-blue-500 bg-blue-500/5"
                            : "border-[#27272a] hover:border-zinc-600 bg-[#09090b]"
                        )}
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.docx,.txt"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleSopFile(file);
                            e.target.value = "";
                          }}
                        />
                        <Upload className="h-5 w-5 text-zinc-500 mx-auto mb-2" />
                        <p className="text-xs text-zinc-400 font-medium">Upload your SOP</p>
                        <p className="text-[10px] text-zinc-600 mt-0.5">PDF, DOCX, or TXT</p>
                      </div>
                    )}

                    {/* Parsing */}
                    {sopParsing && (
                      <div className="border border-[#27272a] rounded-lg p-6 bg-[#09090b] text-center">
                        <Loader2 className="h-5 w-5 animate-spin text-blue-500 mx-auto mb-2" />
                        <p className="text-xs text-zinc-400">Analyzing {sopFile?.name}...</p>
                      </div>
                    )}

                    {sopError && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-2">
                        <p className="text-red-400 text-xs">{sopError}</p>
                      </div>
                    )}

                    {/* Preview checklist */}
                    {sopParsed && sopRules.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                            <span className="text-xs text-zinc-300 font-medium truncate">
                              {sopFile?.name}
                            </span>
                            <CheckCircle className="h-3 w-3 text-green-400 shrink-0" />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSopFile(null);
                              setSopParsed(false);
                              setSopRules([]);
                              setSopRuleToggles({});
                              setCustomPrompt("");
                            }}
                            className="text-zinc-500 hover:text-zinc-300 shrink-0 ml-2"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
                          <p className="text-amber-300 text-xs font-medium">
                            Extracted {sopRules.reduce((n, c) => n + c.rules.length, 0)} rules from your SOP
                          </p>
                          <p className="text-amber-400/60 text-[10px] mt-0.5">
                            Toggle rules on/off to customize agent behavior.
                          </p>
                        </div>

                        <div className="max-h-[250px] overflow-y-auto space-y-2 pr-1">
                          {sopRules.map((category) => {
                            const IconComp = sopIconMap[category.icon] || BookOpen;
                            return (
                              <div key={category.name} className="border border-[#27272a] rounded-lg bg-[#09090b] overflow-hidden">
                                <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[#27272a] bg-zinc-900/50">
                                  <IconComp className="h-3 w-3 text-zinc-400" />
                                  <span className="text-[10px] font-semibold text-zinc-300 uppercase tracking-wider">
                                    {category.name}
                                  </span>
                                  <span className="text-[10px] text-zinc-600 ml-auto">
                                    {category.rules.filter((_, i) => sopRuleToggles[`${category.name}-${i}`] !== false).length}/{category.rules.length}
                                  </span>
                                </div>
                                <div className="divide-y divide-[#27272a]/50">
                                  {category.rules.map((rule, i) => {
                                    const key = `${category.name}-${i}`;
                                    const enabled = sopRuleToggles[key] !== false;
                                    return (
                                      <button
                                        key={key}
                                        type="button"
                                        onClick={() => toggleSopRule(key)}
                                        className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-zinc-900/30 transition-colors"
                                      >
                                        <div className="mt-0.5 shrink-0">
                                          {enabled ? (
                                            <ToggleRight className="h-3.5 w-3.5 text-blue-400" />
                                          ) : (
                                            <ToggleLeft className="h-3.5 w-3.5 text-zinc-600" />
                                          )}
                                        </div>
                                        <span className={cn(
                                          "text-xs leading-relaxed",
                                          enabled ? "text-zinc-300" : "text-zinc-600 line-through"
                                        )}>
                                          {rule}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <Textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="e.g. Focus on sustainable fashion products under $50. Use a casual, trendy tone."
                      rows={3}
                      className="bg-[#09090b] border-[#27272a] text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500 resize-none text-sm"
                    />
                    <p className="text-xs text-zinc-600 mt-1">
                      Tell the agent how you want it to behave
                    </p>
                  </div>
                )}
              </div>

              {/* Dynamic Config Fields from API */}
              {deployTemplate && deployTemplate.configFields.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-[#27272a]" />
                    <span className="text-xs text-zinc-500 font-medium">
                      Configuration
                    </span>
                    <div className="h-px flex-1 bg-[#27272a]" />
                  </div>

                  {deployTemplate.configFields.map((field) => (
                    <div key={field.key}>
                      <Label className="text-zinc-300 mb-1.5">
                        {field.label}
                        {field.required && (
                          <span className="text-red-400 ml-1">*</span>
                        )}
                      </Label>
                      {field.type === "textarea" ? (
                        <Textarea
                          value={configValues[field.key] || ""}
                          onChange={(e) =>
                            setConfigValues((prev) => ({
                              ...prev,
                              [field.key]: e.target.value,
                            }))
                          }
                          placeholder={field.placeholder}
                          required={field.required}
                          rows={2}
                          className="bg-[#09090b] border-[#27272a] text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500 resize-none"
                        />
                      ) : field.type === "select" ? (
                        <div className="relative">
                          <select
                            value={configValues[field.key] || field.defaultValue || ""}
                            onChange={(e) =>
                              setConfigValues((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }))
                            }
                            required={field.required}
                            className="w-full appearance-none bg-[#09090b] border border-[#27272a] rounded-lg py-2.5 px-4 pr-10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors text-sm"
                          >
                            <option value={field.defaultValue}>{field.defaultValue}</option>
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                        </div>
                      ) : (
                        <Input
                          type="text"
                          value={configValues[field.key] || ""}
                          onChange={(e) =>
                            setConfigValues((prev) => ({
                              ...prev,
                              [field.key]: e.target.value,
                            }))
                          }
                          placeholder={field.placeholder}
                          required={field.required}
                          className="bg-[#09090b] border-[#27272a] text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Required Shopify Scopes */}
              {deployTemplate?.requiredScopes && deployTemplate.requiredScopes.length > 0 && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-medium text-amber-300">
                          Required Shopify API scopes
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(deployTemplate.requiredScopes.join(", "));
                            setScopesCopied(true);
                            setTimeout(() => setScopesCopied(false), 2000);
                          }}
                          className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-amber-400 transition-colors"
                        >
                          {scopesCopied ? (
                            <><Check className="h-3 w-3 text-green-400" /><span className="text-green-400">Copied!</span></>
                          ) : (
                            <><Copy className="h-3 w-3" /> Copy scopes</>
                          )}
                        </button>
                      </div>
                      <p className="text-[11px] text-zinc-400 mb-2">
                        Enable these in your Shopify app under{" "}
                        <span className="text-white">Configuration → Admin API integration</span>
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {deployTemplate.requiredScopes.map((scope) => (
                          <span
                            key={scope}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400/80 font-mono border border-amber-500/10"
                          >
                            {scope}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Button
                  type="submit"
                  disabled={deployLoading || !selectedStoreId || !agentName.trim() || hasApiKey === false}
                  className={cn(
                    "w-full font-medium",
                    hasApiKey === false
                      ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30"
                      : !selectedStoreId || !agentName.trim()
                        ? "bg-zinc-700 text-zinc-400 hover:bg-zinc-700"
                        : "bg-blue-500 hover:bg-blue-600 text-white"
                  )}
                >
                  {deployLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Deploying...
                    </>
                  ) : hasApiKey === false ? (
                    <>
                      <AlertCircle className="h-4 w-4" />
                      API Key Required
                    </>
                  ) : !selectedStoreId ? (
                    <>
                      <Store className="h-4 w-4" />
                      Select a Store
                    </>
                  ) : !agentName.trim() ? (
                    <>
                      <Type className="h-4 w-4" />
                      Enter Agent Name
                    </>
                  ) : (
                    <>
                      <Rocket className="h-4 w-4" />
                      Deploy Agent
                    </>
                  )}
                </Button>
                {hasApiKey === false && (
                  <p className="text-[11px] text-amber-400/70 text-center">
                    You need to configure an AI API key before deploying agents
                  </p>
                )}
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
