"use client";

import { Check, Zap, Rocket, Crown, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "29",
    description: "Perfect for getting started with AI agents for your store.",
    icon: Rocket,
    features: [
      "3 AI agents",
      "1 Shopify store",
      "5,000 messages per month",
      "All agent templates",
      "Chat dashboard",
      "Email support",
    ],
    color: "blue",
    cta: "Start with Starter",
  },
  {
    id: "pro",
    name: "Pro",
    price: "49",
    description: "For growing businesses with multiple stores.",
    icon: Crown,
    features: [
      "10 AI agents",
      "3 Shopify stores",
      "25,000 messages per month",
      "All agent templates",
      "Advanced analytics",
      "Priority support",
      "Custom agent prompts",
    ],
    color: "purple",
    popular: true,
    cta: "Start with Pro",
  },
  {
    id: "business",
    name: "Business",
    price: "99",
    description: "Unlimited power for serious e-commerce.",
    icon: Crown,
    features: [
      "Unlimited agents",
      "Unlimited stores",
      "Unlimited messages",
      "All agent templates",
      "Advanced analytics",
      "Dedicated support",
      "Custom integrations",
      "API access",
    ],
    color: "amber",
    cta: "Start with Business",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <div className="border-b border-[#27272a]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold">
            Claw<span className="text-blue-500">Commerce</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Login
            </Link>
            <Link href="/signup">
              <Button
                size="sm"
                className="bg-blue-500 hover:bg-blue-600 text-white"
              >
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
          Start free and upgrade as you grow. No hidden fees, no
          commitments.
        </p>
      </div>

      {/* Free tier callout */}
      <div className="max-w-6xl mx-auto px-6 mb-12">
        <div className="bg-[#0a0a0a] border border-[#27272a] rounded-xl p-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Zap className="h-5 w-5 text-green-500" />
            <span className="font-semibold">Free tier</span>
          </div>
          <p className="text-zinc-400 text-sm">
            1 agent · 1 store · 100 messages/month — enough to test,
            free forever.
          </p>
        </div>
      </div>

      {/* Pricing cards */}
      <div className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-xl border p-6 ${
                plan.popular
                  ? "border-purple-500 bg-purple-500/5"
                  : "border-[#27272a] bg-[#0a0a0a]"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-purple-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <plan.icon
                  className={`h-8 w-8 mb-3 ${
                    plan.color === "blue"
                      ? "text-blue-500"
                      : plan.color === "purple"
                        ? "text-purple-500"
                        : "text-amber-500"
                  }`}
                />
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  {plan.description}
                </p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-bold">€{plan.price}</span>
                <span className="text-zinc-500 ml-1">/month</span>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-2 text-sm text-zinc-300"
                  >
                    <Check className="h-4 w-4 text-green-500 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Link href="/signup">
                <Button
                  className={`w-full font-medium ${
                    plan.popular
                      ? "bg-purple-500 hover:bg-purple-600 text-white"
                      : "bg-blue-500 hover:bg-blue-600 text-white"
                  }`}
                >
                  {plan.cta}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ-ish section */}
      <div className="border-t border-[#27272a]">
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl font-bold mb-4">
            Questions about pricing?
          </h2>
          <p className="text-zinc-400 mb-6">
            All plans include a 14-day money-back guarantee. Upgrade,
            downgrade, or cancel anytime.
          </p>
          <Link href="/signup">
            <Button className="bg-blue-500 hover:bg-blue-600 text-white font-medium">
              Start for free
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
