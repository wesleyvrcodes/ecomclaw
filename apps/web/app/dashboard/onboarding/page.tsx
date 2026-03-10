"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Store,
  Key,
  Bot,
  Rocket,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
  ListChecks,
  Headphones,
  FileBarChart,
  Megaphone,
  Truck,
  ArrowRight,
  Link2,
  Tag,
  Shield,
  Info,
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  MessageCircle,
  DollarSign,
  Type,
  AlignLeft,
  BookOpen,
  X,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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

const steps = [
  { number: 1, label: "Choose Agent" },
  { number: 2, label: "Connect Store" },
  { number: 3, label: "AI & Deploy" },
];

const niches = [
  "Fashion",
  "Electronics",
  "Home & Garden",
  "Beauty",
  "Sports",
  "Pet Supplies",
  "Health & Wellness",
  "Toys & Games",
  "Jewelry",
  "Food & Beverage",
];

const agentTemplates = [
  {
    id: "product-lister",
    name: "Product Lister",
    icon: ListChecks,
    description:
      "Creates and optimizes product listings with SEO-friendly titles, descriptions, and tags. The easiest way to get started.",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
    scopes: ["read_products", "write_products", "read_files", "write_files", "read_inventory", "read_locations", "read_translations", "write_translations"],
    promptTemplate: (niche: string) =>
      `Manage product listings for my ${niche.toLowerCase()} store. Write compelling, SEO-optimized titles and descriptions. Add relevant tags and organize products into collections. Keep pricing consistent and highlight key selling points.`,
  },
  {
    id: "daily-reporter",
    name: "Daily Reporter",
    icon: FileBarChart,
    description:
      "Sends you a daily digest with sales, revenue, top products, and trends so you always know how your store is performing.",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/30",
    scopes: ["read_products", "read_orders", "read_customers", "read_inventory", "read_reports", "read_locations", "read_marketing_events"],
    promptTemplate: (niche: string) =>
      `Generate a daily performance report for my ${niche.toLowerCase()} store. Include total revenue, order count, average order value, top 5 selling products, inventory alerts for low-stock items, and week-over-week trends. Flag anything unusual.`,
  },
  {
    id: "google-ads-optimizer",
    name: "Google Ads Optimizer",
    icon: Megaphone,
    description:
      "Analyzes your product catalog and generates optimized Google Ads campaigns, ad copy, and keyword suggestions.",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    scopes: ["read_products", "read_orders", "read_customers", "read_reports", "read_marketing_events", "write_marketing_events"],
    promptTemplate: (niche: string) =>
      `Optimize Google Ads for my ${niche.toLowerCase()} store. Analyze product margins and sales velocity to recommend which products to advertise. Generate ad copy, suggest keywords, and calculate target ROAS. Focus budget on high-margin, high-converting products.`,
  },
  {
    id: "customer-service",
    name: "Customer Service",
    icon: Headphones,
    description:
      "Handles customer inquiries, tracks order status, processes returns, and resolves issues with a professional tone.",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    scopes: ["read_orders", "write_orders", "read_customers", "write_customers", "read_products", "read_fulfillments", "read_returns", "write_returns", "read_draft_orders", "write_draft_orders", "read_locations"],
    promptTemplate: (niche: string) =>
      `Handle customer support for my ${niche.toLowerCase()} store. Answer questions about products, track order statuses, process return requests, and resolve complaints. Always be friendly and professional. Escalate complex issues to me with a summary.`,
  },
  {
    id: "supply-chain-manager",
    name: "Supply Chain Manager",
    icon: Truck,
    description:
      "Monitors inventory levels, predicts stockouts, tracks supplier lead times, and suggests reorder quantities.",
    color: "text-rose-500",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/30",
    scopes: ["read_products", "read_inventory", "write_inventory", "read_orders", "read_locations", "write_locations", "read_fulfillments", "read_shipping"],
    promptTemplate: (niche: string) =>
      `Manage the supply chain for my ${niche.toLowerCase()} store. Monitor inventory levels and alert me when products are running low. Calculate reorder points based on sales velocity and supplier lead times. Suggest optimal order quantities to avoid stockouts without over-ordering.`,
  },
];

const allScopes = [
  "read_products",
  "write_products",
  "read_files",
  "write_files",
  "read_orders",
  "write_orders",
  "read_customers",
  "write_customers",
  "read_inventory",
  "write_inventory",
  "read_reports",
  "read_locations",
  "write_locations",
  "read_translations",
  "write_translations",
  "read_fulfillments",
  "read_returns",
  "write_returns",
  "read_draft_orders",
  "write_draft_orders",
  "read_shipping",
  "read_marketing_events",
  "write_marketing_events",
];

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 80 : -80,
    opacity: 0,
  }),
};

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(1);

  // Skip logic — existing user data
  const [existingStores, setExistingStores] = useState<any[]>([]);
  const [existingSettings, setExistingSettings] = useState<any>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  // Step 1 state — Choose Agent
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [storeNiche, setStoreNiche] = useState("");
  const [schedule, setSchedule] = useState("Daily");

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

  // Step 2 state — Connect Store
  const [storeName, setStoreName] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [useAllScopes, setUseAllScopes] = useState(false);
  const [scopesCopied, setScopesCopied] = useState(false);
  const [storeLoading, setStoreLoading] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [storeValidation, setStoreValidation] = useState<{
    valid: boolean;
    message: string;
    productCount?: number;
  } | null>(null);
  const [validatingStore, setValidatingStore] = useState(false);
  const [useExistingStore, setUseExistingStore] = useState(false);
  const [selectedExistingStoreId, setSelectedExistingStoreId] = useState<string | null>(null);

  // Step 3 state — AI API Key & Deploy
  const [aiProvider, setAiProvider] = useState<"anthropic" | "openai">(
    "anthropic"
  );
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [keyValidation, setKeyValidation] = useState<{
    valid: boolean;
    message: string;
    balance?: string;
  } | null>(null);
  const [validatingKey, setValidatingKey] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);

  // Deploy state
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  const selectedAgent = agentTemplates.find((t) => t.id === selectedTemplate);
  const requiredScopes = selectedAgent?.scopes ?? [];
  const displayScopes = useAllScopes ? allScopes : requiredScopes;
  const scopesString = displayScopes.join(", ");

  // Load existing stores and settings for skip logic
  useEffect(() => {
    const loadExisting = async () => {
      try {
        const [stores, settings] = await Promise.all([
          api.get<any[]>("/stores").catch(() => []),
          api.get<any>("/settings").catch(() => null),
        ]);
        setExistingStores(stores);
        setExistingSettings(settings);

        // Pre-fill if existing store
        if (stores && stores.length > 0) {
          setUseExistingStore(true);
          setSelectedExistingStoreId(stores[0].id);
          setStoreName(stores[0].name || "");
          setStoreUrl(stores[0].storeUrl || "");
          setStoreValidation({
            valid: true,
            message: "Using your existing connected store.",
          });
        }

        // Pre-fill if existing API key
        if (
          settings &&
          (settings.apiKey || settings.openAiApiKey)
        ) {
          setHasExistingKey(true);
          if (settings.apiKey) {
            setAiProvider("anthropic");
            setApiKey(settings.apiKey);
            setKeyValidation({
              valid: true,
              message: "You already have a key configured.",
            });
          } else if (settings.openAiApiKey) {
            setAiProvider("openai");
            setApiKey(settings.openAiApiKey);
            setKeyValidation({
              valid: true,
              message: "You already have a key configured.",
            });
          }
        }
      } finally {
        setInitialLoading(false);
      }
    };
    loadExisting();
  }, []);

  const goToStep = (step: number) => {
    setDirection(step > currentStep ? 1 : -1);
    setCurrentStep(step);
  };

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = agentTemplates.find((t) => t.id === templateId);
    if (template) {
      setCustomPrompt(template.promptTemplate(storeNiche || "general"));
    }
  };

  const handleCopyScopes = async () => {
    try {
      await navigator.clipboard.writeText(scopesString);
      setScopesCopied(true);
      setTimeout(() => setScopesCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = scopesString;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setScopesCopied(true);
      setTimeout(() => setScopesCopied(false), 2000);
    }
  };

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

      // Initialize all toggles to ON
      const toggles: Record<string, boolean> = {};
      rules.forEach((cat) => {
        cat.rules.forEach((rule, i) => {
          toggles[`${cat.name}-${i}`] = true;
        });
      });
      setSopRuleToggles(toggles);
      setSopParsed(true);

      // Build custom prompt from enabled rules
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
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleSopFile(file);
    },
    [handleSopFile]
  );

  const handleValidateStore = async () => {
    if (!storeUrl.trim() || !clientId.trim() || !clientSecret.trim()) return;

    try {
      setValidatingStore(true);
      setStoreValidation(null);
      setStoreError(null);
      const result = await api.post<{ valid: boolean; productCount?: number; message?: string }>(
        "/stores/validate",
        {
          storeUrl: storeUrl.trim(),
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
        }
      );
      if (result.valid) {
        setStoreValidation({
          valid: true,
          message: `Connected! We can see ${result.productCount ?? 0} products in your store.`,
          productCount: result.productCount,
        });
      } else {
        setStoreValidation({
          valid: false,
          message: result.message || "Connection failed. Check your credentials and scopes.",
        });
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Connection failed. Check your credentials and scopes.";
      setStoreValidation({
        valid: false,
        message,
      });
    } finally {
      setValidatingStore(false);
    }
  };

  const handleConnectStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (useExistingStore && selectedExistingStoreId) {
      // Using existing store, just proceed
      goToStep(3);
      return;
    }
    if (
      !storeName.trim() ||
      !storeUrl.trim() ||
      !clientId.trim() ||
      !clientSecret.trim()
    )
      return;
    if (!storeValidation?.valid) return;

    goToStep(3);
  };

  const handleValidateKey = async () => {
    if (!apiKey.trim()) return;

    try {
      setValidatingKey(true);
      setKeyValidation(null);
      setApiKeyError(null);
      const result = await api.post<{ valid: boolean; balance?: string; message?: string }>(
        "/settings/validate-key",
        {
          apiKey: apiKey.trim(),
          provider: aiProvider,
        }
      );
      if (result.valid) {
        setKeyValidation({
          valid: true,
          message: result.balance
            ? `API key is valid! You have $${result.balance} in credits.`
            : "API key is valid!",
          balance: result.balance,
        });
      } else {
        setKeyValidation({
          valid: false,
          message: result.message || "Invalid API key. Check that you copied it correctly.",
        });
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Invalid API key. Check that you copied it correctly.";
      setKeyValidation({
        valid: false,
        message,
      });
    } finally {
      setValidatingKey(false);
    }
  };

  const handleSaveAndDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    if (!keyValidation?.valid && !hasExistingKey) return;
    if (!selectedTemplate) return;

    const template = agentTemplates.find((t) => t.id === selectedTemplate);
    if (!template) return;

    try {
      setApiKeyLoading(true);
      setAgentLoading(true);
      setApiKeyError(null);
      setAgentError(null);

      const result = await api.post<{
        storeId: string;
        agentId: string;
        agentName: string;
        storeName: string;
      }>("/onboarding/complete", {
        storeName: storeName.trim(),
        storeUrl: storeUrl.trim(),
        niche: storeNiche.trim(),
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        grantedScopes: displayScopes,
        templateId: selectedTemplate,
        agentName: `${template.name} — ${storeName}`,
        customPrompt: customPrompt.trim(),
        aiProvider,
        apiKey: apiKey.trim(),
        schedule,
        configuration: {},
      });

      // Success — redirect immediately to chat
      router.push("/dashboard/chat");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to complete onboarding";
      setApiKeyError(message);
      setAgentError(message);
    } finally {
      setApiKeyLoading(false);
      setAgentLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Step Indicator */}
        <div className="mb-10">
          <div className="flex items-center justify-between relative">
            <div className="absolute top-5 left-0 right-0 h-[2px] bg-[#27272a] mx-10" />
            <div
              className="absolute top-5 left-0 h-[2px] bg-blue-500 mx-10 transition-all duration-500 ease-out"
              style={{
                width: `${((currentStep - 1) / (steps.length - 1)) * 100}%`,
                maxWidth: "calc(100% - 80px)",
              }}
            />

            {steps.map((step) => (
              <div
                key={step.number}
                className="flex flex-col items-center relative z-10"
              >
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 border-2",
                    currentStep > step.number
                      ? "bg-blue-500 border-blue-500 text-white"
                      : currentStep === step.number
                        ? "bg-blue-500/20 border-blue-500 text-blue-500"
                        : "bg-[#0a0a0a] border-[#27272a] text-zinc-600"
                  )}
                >
                  {currentStep > step.number ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    step.number
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs mt-2 font-medium transition-colors duration-300 whitespace-nowrap",
                    currentStep >= step.number
                      ? "text-zinc-300"
                      : "text-zinc-600"
                  )}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="relative overflow-hidden min-h-[480px]">
          <AnimatePresence custom={direction} mode="wait">
            {/* ===== STEP 1: Choose Agent ===== */}
            {currentStep === 1 && (
              <motion.div
                key="step-1"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <Card className="bg-[#0a0a0a] border-[#27272a]">
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="bg-blue-500/10 p-2.5 rounded-lg">
                        <Rocket className="h-5 w-5 text-blue-500" />
                      </div>
                      <h2 className="text-xl font-bold text-white">
                        Choose Your First Agent
                      </h2>
                    </div>
                    <p className="text-zinc-400 text-sm mb-6 ml-[52px]">
                      Pick an AI agent to deploy. We&apos;ll configure the right
                      Shopify permissions for it.
                    </p>

                    {/* Niche selection */}
                    <div className="mb-6">
                      <Label className="text-zinc-300 mb-1.5">
                        What does your store sell?
                      </Label>
                      <div className="relative mb-3">
                        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                        <Input
                          type="text"
                          value={storeNiche}
                          onChange={(e) => {
                            setStoreNiche(e.target.value);
                            if (selectedTemplate) {
                              const t = agentTemplates.find(
                                (t) => t.id === selectedTemplate
                              );
                              if (t)
                                setCustomPrompt(
                                  t.promptTemplate(e.target.value || "general")
                                );
                            }
                          }}
                          placeholder="e.g. Fashion, Electronics"
                          className="bg-[#09090b] border-[#27272a] pl-10 text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {niches.map((niche) => (
                          <button
                            key={niche}
                            type="button"
                            onClick={() => {
                              setStoreNiche(niche);
                              if (selectedTemplate) {
                                const t = agentTemplates.find(
                                  (t) => t.id === selectedTemplate
                                );
                                if (t) setCustomPrompt(t.promptTemplate(niche));
                              }
                            }}
                            className={cn(
                              "px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border",
                              storeNiche === niche
                                ? "bg-blue-500/20 border-blue-500/50 text-blue-400"
                                : "bg-[#09090b] border-[#27272a] text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
                            )}
                          >
                            {niche}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Agent Template Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                      {agentTemplates.map((template) => {
                        const Icon = template.icon;
                        const isSelected = selectedTemplate === template.id;
                        const isProductLister = template.id === "product-lister";
                        return (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => handleSelectTemplate(template.id)}
                            className={cn(
                              "text-left p-4 rounded-xl border transition-all duration-200 group relative",
                              isSelected
                                ? `${template.bgColor} ${template.borderColor} ring-1 ring-offset-0`
                                : "bg-[#09090b] border-[#27272a] hover:border-zinc-600"
                            )}
                          >
                            {isProductLister && (
                              <Badge className="absolute top-2 right-2 bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] px-1.5 py-0.5">
                                Most popular
                              </Badge>
                            )}
                            <div className="flex items-center gap-3 mb-2">
                              <div
                                className={cn(
                                  "p-2 rounded-lg",
                                  template.bgColor
                                )}
                              >
                                <Icon
                                  className={cn("h-4 w-4", template.color)}
                                />
                              </div>
                              <h3 className="text-sm font-semibold text-white">
                                {template.name}
                              </h3>
                              {isSelected && (
                                <div className="ml-auto bg-blue-500 rounded-full p-0.5">
                                  <Check className="h-3 w-3 text-white" />
                                </div>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500 leading-relaxed">
                              {template.description}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {template.scopes.map((scope) => (
                                <span
                                  key={scope}
                                  className="text-[10px] font-mono text-zinc-600 bg-zinc-900 px-1.5 py-0.5 rounded"
                                >
                                  {scope}
                                </span>
                              ))}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* SOP Upload / Custom Prompt */}
                    <AnimatePresence>
                      {selectedTemplate && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden"
                        >
                          {/* Mode toggle tabs */}
                          <div className="flex gap-2 mb-4">
                            <button
                              type="button"
                              onClick={() => setSopMode("upload")}
                              className={cn(
                                "flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-200 flex items-center justify-center gap-2",
                                sopMode === "upload"
                                  ? "bg-blue-500/10 border-blue-500/50 text-blue-400"
                                  : "bg-[#09090b] border-[#27272a] text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
                              )}
                            >
                              <Upload className="h-3.5 w-3.5" />
                              Upload SOP
                            </button>
                            <button
                              type="button"
                              onClick={() => setSopMode("manual")}
                              className={cn(
                                "flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-200 flex items-center justify-center gap-2",
                                sopMode === "manual"
                                  ? "bg-blue-500/10 border-blue-500/50 text-blue-400"
                                  : "bg-[#09090b] border-[#27272a] text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
                              )}
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              Write manually
                            </button>
                          </div>

                          {sopMode === "upload" ? (
                            <div className="mb-6">
                              {/* Intro text */}
                              {!sopParsed && !sopParsing && (
                                <p className="text-sm text-zinc-400 mb-3">
                                  Already have an SOP or guidelines for your team? Upload it and we&apos;ll turn it into agent instructions automatically.
                                </p>
                              )}

                              {/* Upload area */}
                              {!sopParsed && !sopParsing && (
                                <div
                                  onDragOver={handleDragOver}
                                  onDragLeave={handleDragLeave}
                                  onDrop={handleDrop}
                                  onClick={() => fileInputRef.current?.click()}
                                  className={cn(
                                    "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200",
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
                                  <div className="flex flex-col items-center gap-3">
                                    <div className="bg-blue-500/10 p-3 rounded-xl">
                                      <Upload className="h-6 w-6 text-blue-500" />
                                    </div>
                                    <div>
                                      <p className="text-sm text-zinc-300 font-medium">
                                        Upload your SOP document
                                      </p>
                                      <p className="text-xs text-zinc-500 mt-1">
                                        Drop a file here or click to browse
                                      </p>
                                    </div>
                                    <div className="flex gap-2 mt-1">
                                      {["PDF", "DOCX", "TXT"].map((fmt) => (
                                        <span
                                          key={fmt}
                                          className="text-[10px] font-mono text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded"
                                        >
                                          .{fmt.toLowerCase()}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Parsing indicator */}
                              {sopParsing && (
                                <div className="border border-[#27272a] rounded-xl p-8 bg-[#09090b]">
                                  <div className="flex flex-col items-center gap-3">
                                    <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                                    <div className="text-center">
                                      <p className="text-sm text-zinc-300 font-medium">
                                        Analyzing your SOP...
                                      </p>
                                      <p className="text-xs text-zinc-500 mt-1">
                                        {sopFile?.name}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Error */}
                              {sopError && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mt-3">
                                  <p className="text-red-400 text-sm">{sopError}</p>
                                </div>
                              )}

                              {/* Preview checklist */}
                              {sopParsed && sopRules.length > 0 && (
                                <div className="space-y-3">
                                  {/* File info bar */}
                                  <div className="flex items-center justify-between bg-[#09090b] border border-[#27272a] rounded-lg px-4 py-2.5">
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-4 w-4 text-blue-400" />
                                      <span className="text-sm text-zinc-300 font-medium truncate max-w-[200px]">
                                        {sopFile?.name}
                                      </span>
                                      <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSopFile(null);
                                        setSopParsed(false);
                                        setSopRules([]);
                                        setSopRuleToggles({});
                                        setSopError(null);
                                      }}
                                      className="text-zinc-500 hover:text-zinc-300 transition-colors"
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                  </div>

                                  {/* Preview header */}
                                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-4 py-3">
                                    <p className="text-amber-300 text-sm font-medium">
                                      We extracted these rules from your SOP
                                    </p>
                                    <p className="text-amber-400/60 text-xs mt-0.5">
                                      Toggle rules on/off to customize what your agent follows.
                                    </p>
                                  </div>

                                  {/* Rule categories */}
                                  {sopRules.map((category) => {
                                    const IconComponent = sopIconMap[category.icon] || BookOpen;
                                    return (
                                      <div
                                        key={category.name}
                                        className="border border-[#27272a] rounded-lg bg-[#09090b] overflow-hidden"
                                      >
                                        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#27272a] bg-zinc-900/50">
                                          <IconComponent className="h-3.5 w-3.5 text-zinc-400" />
                                          <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
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
                                                className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-zinc-900/30 transition-colors group"
                                              >
                                                <div className="mt-0.5 shrink-0">
                                                  {enabled ? (
                                                    <ToggleRight className="h-4 w-4 text-blue-400" />
                                                  ) : (
                                                    <ToggleLeft className="h-4 w-4 text-zinc-600" />
                                                  )}
                                                </div>
                                                <span
                                                  className={cn(
                                                    "text-sm leading-relaxed transition-colors",
                                                    enabled ? "text-zinc-300" : "text-zinc-600 line-through"
                                                  )}
                                                >
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
                              )}

                              {/* Hint text when no file */}
                              {!sopParsed && !sopParsing && !sopError && (
                                <p className="text-xs text-zinc-600 mt-2">
                                  Have a doc with &quot;how we write titles&quot; or brand guidelines?
                                  Upload it and we&apos;ll turn it into agent instructions.
                                </p>
                              )}
                            </div>
                          ) : (
                            /* Manual mode — original textarea */
                            <div className="mb-6">
                              <Label className="text-zinc-300 mb-1.5">
                                <span className="flex items-center gap-1.5">
                                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                  Tell your agent what to focus on
                                </span>
                              </Label>
                              <Textarea
                                value={customPrompt}
                                onChange={(e) => setCustomPrompt(e.target.value)}
                                rows={4}
                                className="bg-[#09090b] border-[#27272a] text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500 resize-none text-sm"
                              />
                              <p className="text-xs text-zinc-600 mt-1.5">
                                This prompt guides your agent&apos;s behavior. You
                                can edit it later.
                              </p>
                            </div>
                          )}

                          {/* Schedule selector */}
                          <div className="mb-6">
                            <Label className="text-zinc-300 mb-1.5">Schedule</Label>
                            <div className="flex gap-2">
                              {["Daily", "2x per week", "Manual"].map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => setSchedule(s)}
                                  className={cn(
                                    "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                                    schedule === s
                                      ? "bg-blue-500/15 border-blue-500/40 text-blue-400"
                                      : "bg-[#09090b] border-[#27272a] text-zinc-500 hover:text-zinc-300"
                                  )}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <Button
                      onClick={() => goToStep(2)}
                      disabled={!selectedTemplate}
                      className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold h-11"
                    >
                      Continue
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* ===== STEP 2: Connect Store ===== */}
            {currentStep === 2 && (
              <motion.div
                key="step-2"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <Card className="bg-[#0a0a0a] border-[#27272a]">
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="bg-purple-500/10 p-2.5 rounded-lg">
                        <Store className="h-5 w-5 text-purple-500" />
                      </div>
                      <h2 className="text-xl font-bold text-white">
                        Connect Your Shopify Store
                      </h2>
                    </div>
                    <p className="text-zinc-400 text-sm mb-6 ml-[52px]">
                      Create a custom app in Shopify to give{" "}
                      <span className="text-white font-medium">
                        {selectedAgent?.name}
                      </span>{" "}
                      access to your store.
                    </p>

                    {/* Existing store option */}
                    {existingStores.length > 0 && (
                      <div className="mb-6">
                        <Label className="text-zinc-300 mb-2">Your stores</Label>
                        <div className="space-y-2 mb-3">
                          {existingStores.map((store: any) => {
                            const isSelected = useExistingStore && selectedExistingStoreId === store.id;
                            return (
                              <button
                                key={store.id}
                                type="button"
                                onClick={() => {
                                  setUseExistingStore(true);
                                  setSelectedExistingStoreId(store.id);
                                  setStoreName(store.name || "");
                                  setStoreUrl(store.storeUrl || "");
                                  setStoreValidation({
                                    valid: true,
                                    message: "Using your existing connected store.",
                                  });
                                }}
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
                                  <Store className={cn(
                                    "h-4 w-4",
                                    isSelected ? "text-blue-400" : "text-zinc-500"
                                  )} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={cn(
                                    "text-sm font-medium truncate",
                                    isSelected ? "text-white" : "text-zinc-300"
                                  )}>
                                    {store.name || "My Store"}
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
                        </div>

                        {/* Connect new store button */}
                        <button
                          type="button"
                          onClick={() => {
                            setUseExistingStore(false);
                            setSelectedExistingStoreId(null);
                            setStoreName("");
                            setStoreUrl("");
                            setClientId("");
                            setClientSecret("");
                            setStoreValidation(null);
                          }}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed transition-all duration-200 text-left group",
                            !useExistingStore
                              ? "border-blue-500/50 bg-blue-500/5"
                              : "border-[#27272a] hover:border-zinc-600"
                          )}
                        >
                          <div className={cn(
                            "p-2 rounded-lg shrink-0",
                            !useExistingStore ? "bg-blue-500/20" : "bg-zinc-800"
                          )}>
                            <Link2 className={cn(
                              "h-4 w-4",
                              !useExistingStore ? "text-blue-400" : "text-zinc-500"
                            )} />
                          </div>
                          <p className={cn(
                            "text-sm font-medium",
                            !useExistingStore ? "text-blue-400" : "text-zinc-400"
                          )}>
                            Connect a new store
                          </p>
                        </button>
                      </div>
                    )}

                    {/* New store form — only show if not using existing */}
                    {!useExistingStore && (
                      <>
                        {/* How-to guide */}
                        <button
                          type="button"
                          onClick={() => setShowGuide(!showGuide)}
                          className="w-full mb-4 flex items-center justify-between px-4 py-3 rounded-lg bg-purple-500/5 border border-purple-500/20 hover:border-purple-500/40 transition-colors"
                        >
                          <span className="text-sm text-purple-300 font-medium flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            How do I get my Client ID &amp; Secret?
                          </span>
                          {showGuide ? (
                            <ChevronUp className="h-4 w-4 text-purple-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-purple-400" />
                          )}
                        </button>

                        <AnimatePresence>
                          {showGuide && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25 }}
                              className="overflow-hidden"
                            >
                              <div className="mb-6 rounded-lg border border-[#27272a] bg-[#09090b] p-5 space-y-4">
                                <div className="flex items-start gap-3">
                                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold shrink-0 mt-0.5">
                                    1
                                  </div>
                                  <div>
                                    <p className="text-sm text-zinc-200 font-medium">
                                      Open the Shopify Dev Dashboard
                                    </p>
                                    <p className="text-xs text-zinc-500 mt-1">
                                      Go to{" "}
                                      <a
                                        href="https://partners.shopify.com"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
                                      >
                                        partners.shopify.com
                                      </a>{" "}
                                      and navigate to{" "}
                                      <span className="text-zinc-300">Apps</span> in
                                      the sidebar. If you don&apos;t have a Partner
                                      account yet, create one for free.
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-start gap-3">
                                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold shrink-0 mt-0.5">
                                    2
                                  </div>
                                  <div>
                                    <p className="text-sm text-zinc-200 font-medium">
                                      Create a new app
                                    </p>
                                    <p className="text-xs text-zinc-500 mt-1">
                                      Click{" "}
                                      <span className="text-zinc-300">
                                        &quot;Create app&quot;
                                      </span>{" "}
                                      and choose{" "}
                                      <span className="text-zinc-300">
                                        &quot;Start from Dev Dashboard&quot;
                                      </span>
                                      . Give it a name like{" "}
                                      <span className="text-zinc-300">
                                        &quot;ClawCommerce Integration&quot;
                                      </span>
                                      .
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-start gap-3">
                                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold shrink-0 mt-0.5">
                                    3
                                  </div>
                                  <div>
                                    <p className="text-sm text-zinc-200 font-medium">
                                      Configure API scopes
                                    </p>
                                    <p className="text-xs text-zinc-500 mt-1">
                                      In the app version settings, add{" "}
                                      {useAllScopes
                                        ? "all"
                                        : `the ${selectedAgent?.name}`}{" "}
                                      scopes. Copy them below and paste in the
                                      Shopify scope field:
                                    </p>

                                    {/* Scope toggle */}
                                    <div className="flex items-center gap-3 mt-3 mb-2">
                                      <button
                                        type="button"
                                        onClick={() => setUseAllScopes(false)}
                                        className={cn(
                                          "text-xs px-2.5 py-1 rounded-md border transition-colors",
                                          !useAllScopes
                                            ? "bg-blue-500/15 border-blue-500/40 text-blue-400"
                                            : "bg-transparent border-[#27272a] text-zinc-500 hover:text-zinc-400"
                                        )}
                                      >
                                        {selectedAgent?.name} only
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setUseAllScopes(true)}
                                        className={cn(
                                          "text-xs px-2.5 py-1 rounded-md border transition-colors flex items-center gap-1",
                                          useAllScopes
                                            ? "bg-blue-500/15 border-blue-500/40 text-blue-400"
                                            : "bg-transparent border-[#27272a] text-zinc-500 hover:text-zinc-400"
                                        )}
                                      >
                                        All agents
                                        <span className="text-[10px] text-zinc-600">
                                          (recommended)
                                        </span>
                                      </button>
                                    </div>

                                    {/* Copyable scope string */}
                                    <div className="mt-2 relative group">
                                      <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5">
                                        <code className="text-xs text-zinc-300 font-mono flex-1 select-all break-all">
                                          {scopesString}
                                        </code>
                                        <button
                                          type="button"
                                          onClick={handleCopyScopes}
                                          className={cn(
                                            "shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all",
                                            scopesCopied
                                              ? "bg-green-500/20 text-green-400"
                                              : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
                                          )}
                                        >
                                          {scopesCopied ? (
                                            <>
                                              <Check className="h-3 w-3" />
                                              Copied
                                            </>
                                          ) : (
                                            <>
                                              <Copy className="h-3 w-3" />
                                              Copy
                                            </>
                                          )}
                                        </button>
                                      </div>
                                    </div>

                                    {!useAllScopes && (
                                      <p className="text-[11px] text-zinc-600 mt-2 flex items-start gap-1">
                                        <Info className="h-3 w-3 mt-0.5 shrink-0" />
                                        Tip: select &quot;All agents&quot; to avoid
                                        reconfiguring scopes when you add more
                                        agents later.
                                      </p>
                                    )}

                                    <p className="text-xs text-zinc-500 mt-3">
                                      Then click{" "}
                                      <span className="text-zinc-300">
                                        &quot;Release&quot;
                                      </span>{" "}
                                      to finalize the version.
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-start gap-3">
                                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold shrink-0 mt-0.5">
                                    4
                                  </div>
                                  <div>
                                    <p className="text-sm text-zinc-200 font-medium">
                                      Install the app on your store
                                    </p>
                                    <p className="text-xs text-zinc-500 mt-1">
                                      Go to the{" "}
                                      <span className="text-zinc-300">Home</span>{" "}
                                      tab of your app, click{" "}
                                      <span className="text-zinc-300">
                                        &quot;Install app&quot;
                                      </span>
                                      , and select your Shopify store. Approve the
                                      permissions when prompted.
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-start gap-3">
                                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-500/20 text-green-400 text-xs font-bold shrink-0 mt-0.5">
                                    5
                                  </div>
                                  <div>
                                    <p className="text-sm text-zinc-200 font-medium">
                                      Copy your Client ID &amp; Secret
                                    </p>
                                    <p className="text-xs text-zinc-500 mt-1">
                                      Go to{" "}
                                      <span className="text-zinc-300">
                                        Settings
                                      </span>{" "}
                                      in your app and copy the{" "}
                                      <span className="text-zinc-300">
                                        Client ID
                                      </span>{" "}
                                      and{" "}
                                      <span className="text-zinc-300">
                                        Client Secret
                                      </span>
                                      . Paste them below.
                                    </p>
                                  </div>
                                </div>

                                <div className="bg-amber-500/5 border border-amber-500/20 rounded-md px-3 py-2.5 mt-2">
                                  <p className="text-xs text-amber-400/80">
                                    Access tokens expire after 24 hours.
                                    ClawCommerce automatically refreshes them using
                                    your credentials — you won&apos;t need to do
                                    anything after this setup.
                                  </p>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {storeError && (
                          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-6">
                            <p className="text-red-400 text-sm">{storeError}</p>
                          </div>
                        )}
                      </>
                    )}

                    <form onSubmit={handleConnectStore} className="space-y-5">
                      {!useExistingStore && (
                        <>
                          <div>
                            <Label className="text-zinc-300 mb-1.5">
                              Store Name{" "}
                              <span className="text-red-400">*</span>
                            </Label>
                            <div className="relative">
                              <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                              <Input
                                type="text"
                                value={storeName}
                                onChange={(e) => setStoreName(e.target.value)}
                                placeholder="My Awesome Store"
                                required
                                className="bg-[#09090b] border-[#27272a] pl-10 text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500"
                              />
                            </div>
                          </div>

                          <div>
                            <Label className="text-zinc-300 mb-1.5">
                              Shopify Store URL{" "}
                              <span className="text-red-400">*</span>
                            </Label>
                            <div className="relative">
                              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                              <Input
                                type="text"
                                value={storeUrl}
                                onChange={(e) => {
                                  setStoreUrl(e.target.value);
                                  setStoreValidation(null);
                                }}
                                placeholder="your-store"
                                required
                                className="bg-[#09090b] border-[#27272a] pl-10 pr-[140px] text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm pointer-events-none">
                                .myshopify.com
                              </span>
                            </div>
                          </div>

                          <div>
                            <Label className="text-zinc-300 mb-1.5">
                              Client ID{" "}
                              <span className="text-red-400">*</span>
                            </Label>
                            <div className="relative">
                              <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                              <Input
                                type="text"
                                value={clientId}
                                onChange={(e) => {
                                  setClientId(e.target.value);
                                  setStoreValidation(null);
                                }}
                                placeholder="From Dev Dashboard > Settings"
                                required
                                className="bg-[#09090b] border-[#27272a] pl-10 text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500 font-mono"
                              />
                            </div>
                          </div>

                          <div>
                            <Label className="text-zinc-300 mb-1.5">
                              Client Secret{" "}
                              <span className="text-red-400">*</span>
                            </Label>
                            <div className="relative">
                              <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                              <Input
                                type={showClientSecret ? "text" : "password"}
                                value={clientSecret}
                                onChange={(e) => {
                                  setClientSecret(e.target.value);
                                  setStoreValidation(null);
                                }}
                                placeholder="shpss_xxxxxxxxxxxxxxxx"
                                required
                                className="bg-[#09090b] border-[#27272a] pl-10 pr-10 text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500 font-mono"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setShowClientSecret(!showClientSecret)
                                }
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                              >
                                {showClientSecret ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Store validation section */}
                          <div className="space-y-3">
                            {storeUrl.trim() && clientId.trim() && clientSecret.trim() && (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={handleValidateStore}
                                disabled={validatingStore}
                                className="w-full bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border-purple-500/30 hover:border-purple-500/50 font-medium"
                              >
                                {validatingStore ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Testing connection...
                                  </>
                                ) : (
                                  <>
                                    <Link2 className="h-4 w-4" />
                                    Test Connection
                                  </>
                                )}
                              </Button>
                            )}

                            {storeValidation && !useExistingStore && (
                              <div
                                className={cn(
                                  "rounded-lg px-4 py-3 flex items-center gap-2",
                                  storeValidation.valid
                                    ? "bg-green-500/10 border border-green-500/20"
                                    : "bg-red-500/10 border border-red-500/20"
                                )}
                              >
                                {storeValidation.valid ? (
                                  <Check className="h-4 w-4 text-green-400 shrink-0" />
                                ) : (
                                  <Info className="h-4 w-4 text-red-400 shrink-0" />
                                )}
                                <p
                                  className={cn(
                                    "text-sm",
                                    storeValidation.valid
                                      ? "text-green-300"
                                      : "text-red-400"
                                  )}
                                >
                                  {storeValidation.message}
                                </p>
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      <div className="flex gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => goToStep(1)}
                          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-[#27272a]"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Back
                        </Button>
                        <Button
                          type="submit"
                          disabled={
                            useExistingStore
                              ? false
                              : storeLoading ||
                                !storeName.trim() ||
                                !storeUrl.trim() ||
                                !clientId.trim() ||
                                !clientSecret.trim() ||
                                !storeValidation?.valid
                          }
                          className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-semibold h-11"
                        >
                          {storeLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            <>
                              {useExistingStore ? "Continue" : "Connect Store"}
                              <ChevronRight className="h-4 w-4" />
                            </>
                          )}
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* ===== STEP 3: AI API Key & Deploy ===== */}
            {currentStep === 3 && (
              <motion.div
                key="step-3"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <Card className="bg-[#0a0a0a] border-[#27272a]">
                  <CardContent className="p-8">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="bg-amber-500/10 p-2.5 rounded-lg">
                        <Sparkles className="h-5 w-5 text-amber-500" />
                      </div>
                      <h2 className="text-xl font-bold text-white">
                        AI API Key &amp; Deploy
                      </h2>
                    </div>
                    <p className="text-zinc-400 text-sm mb-8 ml-[52px]">
                      Your agents need an AI brain. Enter your API key and deploy your agent.
                    </p>

                    {hasExistingKey && (
                      <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3 mb-6 flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-400 shrink-0" />
                        <div>
                          <p className="text-sm text-green-300 font-medium">
                            You already have a key configured
                          </p>
                          <p className="text-xs text-green-400/70">
                            You can proceed with the existing key or update it below.
                          </p>
                        </div>
                      </div>
                    )}

                    {(apiKeyError || agentError) && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-6">
                        <p className="text-red-400 text-sm">
                          {apiKeyError || agentError}
                        </p>
                      </div>
                    )}

                    <form onSubmit={handleSaveAndDeploy} className="space-y-6">
                      {/* Provider Toggle */}
                      <div>
                        <Label className="text-zinc-300 mb-3 block">
                          AI Provider
                        </Label>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setAiProvider("anthropic");
                              setKeyValidation(null);
                            }}
                            className={cn(
                              "flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2",
                              aiProvider === "anthropic"
                                ? "bg-blue-500/10 border-blue-500/50 text-blue-400"
                                : "bg-[#09090b] border-[#27272a] text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
                            )}
                          >
                            <Bot className="h-4 w-4" />
                            Anthropic
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAiProvider("openai");
                              setKeyValidation(null);
                            }}
                            className={cn(
                              "flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2",
                              aiProvider === "openai"
                                ? "bg-green-500/10 border-green-500/50 text-green-400"
                                : "bg-[#09090b] border-[#27272a] text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
                            )}
                          >
                            <Sparkles className="h-4 w-4" />
                            OpenAI
                          </button>
                        </div>
                      </div>

                      {/* API Key Input */}
                      <div>
                        <Label className="text-zinc-300 mb-1.5">
                          {aiProvider === "anthropic"
                            ? "Anthropic"
                            : "OpenAI"}{" "}
                          API Key <span className="text-red-400">*</span>
                        </Label>
                        <div className="relative">
                          <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                          <Input
                            type={showApiKey ? "text" : "password"}
                            value={apiKey}
                            onChange={(e) => {
                              setApiKey(e.target.value);
                              setKeyValidation(null);
                            }}
                            placeholder={
                              aiProvider === "anthropic"
                                ? "sk-ant-api03-xxxxxxxxxxxxx"
                                : "sk-xxxxxxxxxxxxx"
                            }
                            required
                            className="bg-[#09090b] border-[#27272a] pl-10 pr-10 text-white placeholder:text-zinc-600 focus-visible:ring-blue-500/40 focus-visible:border-blue-500 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                          >
                            {showApiKey ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-zinc-600 mt-2">
                          Don&apos;t have an API key? Get one from{" "}
                          {aiProvider === "anthropic" ? "Anthropic" : "OpenAI"}
                        </p>
                      </div>

                      {/* API Key validation section */}
                      <div className="space-y-3">
                        {apiKey.trim() && !keyValidation && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleValidateKey}
                            disabled={validatingKey}
                            className="w-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 hover:border-amber-500/50 font-medium"
                          >
                            {validatingKey ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Verifying key...
                              </>
                            ) : (
                              <>
                                <Key className="h-4 w-4" />
                                Verify Key
                              </>
                            )}
                          </Button>
                        )}

                        {keyValidation && (
                          <div
                            className={cn(
                              "rounded-lg px-4 py-3 flex items-center gap-2",
                              keyValidation.valid
                                ? "bg-green-500/10 border border-green-500/20"
                                : "bg-red-500/10 border border-red-500/20"
                            )}
                          >
                            {keyValidation.valid ? (
                              <Check className="h-4 w-4 text-green-400 shrink-0" />
                            ) : (
                              <Info className="h-4 w-4 text-red-400 shrink-0" />
                            )}
                            <p
                              className={cn(
                                "text-sm",
                                keyValidation.valid
                                  ? "text-green-300"
                                  : "text-red-400"
                              )}
                            >
                              {keyValidation.message}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Info card */}
                      <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <Shield className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm text-blue-300 font-medium mb-1">
                              Your key is encrypted
                            </p>
                            <p className="text-xs text-blue-400/70">
                              API keys are encrypted at rest and never exposed in
                              the UI after saving. Your key is used exclusively
                              for running your agents.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => goToStep(2)}
                          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-[#27272a]"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Back
                        </Button>
                        <Button
                          type="submit"
                          disabled={
                            apiKeyLoading ||
                            agentLoading ||
                            !apiKey.trim() ||
                            (!keyValidation?.valid && !hasExistingKey)
                          }
                          className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-semibold h-11"
                        >
                          {apiKeyLoading || agentLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Deploying agent...
                            </>
                          ) : (
                            <>
                              <Rocket className="h-4 w-4" />
                              Save &amp; Deploy Agent
                            </>
                          )}
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
