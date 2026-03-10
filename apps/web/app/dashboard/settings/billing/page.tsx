"use client";

import { useState, useEffect } from "react";
import {
  CreditCard,
  Check,
  Rocket,
  Crown,
  Building2,
  Server,
  Cpu,
  HardDrive,
  Shield,
  Headphones,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface BillingStatus {
  plan: string;
  planDisplayName: string;
  agentsUsed: number;
  agentsLimit: number;
  storesUsed: number;
  storesLimit: number;
  stripeConfigured: boolean;
  planExpiresAt: string | null;
}

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "29",
    icon: Rocket,
    description: "For entrepreneurs getting started with AI automation",
    color: "blue",
    vps: "2 vCPU, 4 GB RAM",
    features: [
      { text: "3 AI agents", icon: Sparkles },
      { text: "1 Shopify store", icon: Shield },
      { text: "Dedicated VPS", icon: Server },
      { text: "Shopify + Telegram", icon: Check },
      { text: "Email support", icon: Check },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "59",
    icon: Crown,
    description: "For growing businesses with multiple stores",
    color: "purple",
    popular: true,
    vps: "4 vCPU, 8 GB RAM",
    features: [
      { text: "10 AI agents", icon: Sparkles },
      { text: "3 Shopify stores", icon: Shield },
      { text: "Faster VPS", icon: Cpu },
      { text: "All integrations", icon: Check },
      { text: "Priority support", icon: Headphones },
    ],
  },
  {
    id: "business",
    name: "Business",
    price: "99",
    icon: Building2,
    description: "For agencies and high-volume sellers",
    color: "amber",
    vps: "8 vCPU, 16 GB RAM",
    features: [
      { text: "Unlimited agents", icon: Sparkles },
      { text: "10 Shopify stores", icon: Shield },
      { text: "High-performance VPS", icon: HardDrive },
      { text: "All integrations + custom templates", icon: Check },
      { text: "Dedicated support", icon: Headphones },
    ],
  },
];

const planColorMap: Record<string, { border: string; bg: string; badge: string; button: string; glow: string }> = {
  blue: {
    border: "border-blue-500/40",
    bg: "bg-blue-500/5",
    badge: "bg-blue-500/20 text-blue-400",
    button: "bg-blue-500 hover:bg-blue-600",
    glow: "shadow-blue-500/10",
  },
  purple: {
    border: "border-purple-500/40",
    bg: "bg-purple-500/5",
    badge: "bg-purple-500/20 text-purple-400",
    button: "bg-purple-500 hover:bg-purple-600",
    glow: "shadow-purple-500/10",
  },
  amber: {
    border: "border-amber-500/40",
    bg: "bg-amber-500/5",
    badge: "bg-amber-500/20 text-amber-400",
    button: "bg-amber-500 hover:bg-amber-600",
    glow: "shadow-amber-500/10",
  },
};

export default function BillingPage() {
  const { token } = useAuth();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api
      .get<BillingStatus>("/billing/status")
      .then((data) => {
        setBilling(data);
        setBillingLoading(false);
      })
      .catch(() => {
        // Default to no plan if billing endpoint not ready
        setBilling({
          plan: "none",
          planDisplayName: "No Plan",
          agentsUsed: 0,
          agentsLimit: 0,
          storesUsed: 0,
          storesLimit: 0,
          stripeConfigured: false,
          planExpiresAt: null,
        });
        setBillingLoading(false);
      });
  }, [token]);

  const handleCheckout = async (planId: string) => {
    if (!token || !billing?.stripeConfigured) return;
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ priceId: planId }),
      });
      const data = await res.json();
      // Rule #12: Validate redirect URL against allow-list
      if (data.url) {
        try {
          const url = new URL(data.url);
          if (["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname)) {
            window.location.href = data.url;
          }
        } catch { /* invalid URL — ignore */ }
      }
    } catch {
      // Rule #10: No console.log in production
    }
  };

  const handlePortal = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      // Rule #12: Validate redirect URL against allow-list
      if (data.url) {
        try {
          const url = new URL(data.url);
          if (["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname)) {
            window.location.href = data.url;
          }
        } catch { /* invalid URL — ignore */ }
      }
    } catch {
      // Rule #10: No console.log in production
    }
  };

  const currentPlan = billing?.plan || "none";

  return (
    <div className="space-y-6">
      {/* Current plan summary */}
      <Card className="bg-[#0a0a0a] border-[#27272a]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-white">
            <CreditCard className="h-5 w-5 text-green-500" />
            Billing
          </CardTitle>
        </CardHeader>
        <CardContent>
          {billingLoading ? (
            <div className="text-zinc-500 text-sm">Loading billing info...</div>
          ) : (
            <div className="bg-[#09090b] border border-[#27272a] rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-white">
                    Current Plan:{" "}
                    <span className="text-blue-400">
                      {currentPlan === "none" ? "No active plan" : billing?.planDisplayName}
                    </span>
                  </p>
                  {billing?.planExpiresAt && (
                    <p className="text-xs text-zinc-500 mt-1">
                      Renews {new Date(billing.planExpiresAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                {currentPlan !== "none" && (
                  <Badge
                    variant="secondary"
                    className="bg-blue-500/20 text-blue-400"
                  >
                    {billing?.planDisplayName}
                  </Badge>
                )}
              </div>

              {currentPlan !== "none" && billing && (
                <div className="space-y-2">
                  <UsageBar
                    label="Agents"
                    used={billing.agentsUsed}
                    limit={billing.agentsLimit}
                  />
                  <UsageBar
                    label="Stores"
                    used={billing.storesUsed}
                    limit={billing.storesLimit}
                  />
                </div>
              )}

              {currentPlan === "none" && (
                <p className="text-sm text-zinc-500">
                  Choose a plan below to get started with your dedicated AI infrastructure.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const colors = planColorMap[plan.color];
          const isCurrentPlan = currentPlan === plan.id;
          const Icon = plan.icon;

          return (
            <Card
              key={plan.id}
              className={cn(
                "relative overflow-hidden transition-all",
                isCurrentPlan
                  ? cn(colors.border, colors.bg, "shadow-lg", colors.glow)
                  : "bg-[#0a0a0a] border-[#27272a] hover:border-zinc-700"
              )}
            >
              {/* Popular badge */}
              {plan.popular && (
                <div className="absolute top-0 right-0">
                  <div className="bg-purple-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg">
                    MOST POPULAR
                  </div>
                </div>
              )}

              <CardContent className="p-6">
                {/* Plan header */}
                <div className="mb-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={cn("p-2 rounded-lg", colors.badge)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-semibold text-white">{plan.name}</span>
                  </div>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-3xl font-bold text-white">&euro;{plan.price}</span>
                    <span className="text-sm text-zinc-500">/mo</span>
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed">{plan.description}</p>
                </div>

                {/* VPS spec */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#09090b] border border-[#1a1a1a] mb-5">
                  <Server className="h-3.5 w-3.5 text-zinc-500" />
                  <span className="text-xs text-zinc-400">Dedicated VPS &mdash; {plan.vps}</span>
                </div>

                {/* Features */}
                <ul className="space-y-2.5 mb-6">
                  {plan.features.map(({ text, icon: FeatureIcon }) => (
                    <li key={text} className="flex items-center gap-2.5 text-sm text-zinc-300">
                      <FeatureIcon className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      {text}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isCurrentPlan ? (
                  <div className="w-full text-center py-2.5">
                    <span className="text-sm font-medium text-blue-400">Current plan</span>
                  </div>
                ) : billing?.stripeConfigured ? (
                  <Button
                    className={cn("w-full text-white font-semibold", colors.button)}
                    onClick={() => handleCheckout(plan.id)}
                  >
                    {currentPlan === "none" ? "Get Started" : "Switch Plan"}
                  </Button>
                ) : (
                  <Button
                    className={cn("w-full text-white font-semibold", colors.button)}
                    disabled
                  >
                    Coming Soon
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Manage subscription */}
      {currentPlan !== "none" && billing?.stripeConfigured && (
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-[#27272a]"
            onClick={handlePortal}
          >
            Manage Subscription
          </Button>
        </div>
      )}

      {/* Info note */}
      <div className="rounded-lg border border-[#27272a] bg-[#09090b] p-4">
        <p className="text-xs text-zinc-500 leading-relaxed">
          Every plan includes a <strong className="text-zinc-400">dedicated VPS</strong> where your AI agents run 24/7.
          Your data, API keys, and agents are fully isolated from other users.
          You only pay for your plan &mdash; AI API costs (Anthropic/OpenAI) are billed directly by the provider based on your own API key.
        </p>
      </div>
    </div>
  );
}

function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const isUnlimited = limit >= 2147483647;
  const pct = isUnlimited ? 0 : Math.min((used / limit) * 100, 100);
  const isNearLimit = !isUnlimited && pct >= 80;

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-zinc-400">{label}</span>
        <span className={isNearLimit ? "text-amber-400" : "text-zinc-500"}>
          {used} / {isUnlimited ? "\u221E" : limit}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isNearLimit ? "bg-amber-500" : "bg-blue-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
