"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Zap, Shield, ArrowRight, Check, Store, MessageSquare, Rocket } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const pricingTiers = [
  {
    name: "Starter",
    price: 29,
    description: "Perfect for getting started with one store.",
    features: [
      "3 AI Agents",
      "1 Shopify Store",
      "1,000 messages/month",
      "Email support",
      "All agent templates",
    ],
    cta: "Start Free Trial",
    popular: false,
  },
  {
    name: "Pro",
    price: 49,
    description: "For growing stores that need more power.",
    features: [
      "10 AI Agents",
      "3 Shopify Stores",
      "5,000 messages/month",
      "Priority email support",
      "All agent templates",
      "Advanced analytics",
    ],
    cta: "Start Free Trial",
    popular: true,
  },
  {
    name: "Business",
    price: 99,
    description: "Unlimited power for serious e-commerce.",
    features: [
      "Unlimited AI Agents",
      "10 Shopify Stores",
      "Unlimited messages",
      "Chat + email support",
      "All agent templates",
      "Advanced analytics",
      "Custom agent prompts",
    ],
    cta: "Start Free Trial",
    popular: false,
  },
];

const howItWorks = [
  {
    step: 1,
    icon: Rocket,
    title: "Sign Up",
    description: "Create your free account in 30 seconds. No credit card required.",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    step: 2,
    icon: Store,
    title: "Connect Store",
    description: "Link your Shopify store with a custom app. We guide you through every step.",
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
  {
    step: 3,
    icon: MessageSquare,
    title: "Deploy Agent",
    description: "Choose an AI agent, deploy it, and start chatting. Your agent is live in seconds.",
    color: "text-green-500",
    bg: "bg-green-500/10",
  },
];

export default function LandingPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.push("/dashboard");
    }
  }, [user, isLoading, router]);

  if (isLoading || user) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 sm:px-8 py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <Bot className="h-8 w-8 text-blue-500" />
          <span className="text-xl font-bold text-white tracking-tight">
            ClawCommerce
          </span>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" asChild className="text-zinc-400 hover:text-white">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild className="bg-blue-500 hover:bg-blue-600 text-white">
            <Link href="/signup">Get Started</Link>
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col">
        <section className="flex flex-col items-center justify-center px-6 sm:px-8 text-center py-20 sm:py-32">
          <div className="max-w-3xl mx-auto">
            <Badge className="bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/10 mb-8">
              <Zap className="h-4 w-4 mr-2" />
              Powered by AI Agents
            </Badge>

            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold text-white tracking-tight leading-tight mb-6">
              AI Agents for E-Commerce,{" "}
              <span className="text-blue-500">Automated</span>
            </h1>

            <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Deploy intelligent AI agents that handle product research, listing
              optimization, customer service, and more. Let your store run on
              autopilot.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button asChild size="lg" className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-8 py-3.5 text-base w-full sm:w-auto">
                <Link href="/signup">
                  Start Free Trial
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold px-8 py-3.5 text-base border-[#27272a] w-full sm:w-auto">
                <Link href="/signup">
                  Browse Agent Store
                </Link>
              </Button>
            </div>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap items-center justify-center gap-6 mt-20 max-w-2xl">
            {[
              { icon: Bot, label: "Autonomous Agents" },
              { icon: Zap, label: "Real-time Analytics" },
              { icon: Shield, label: "Shopify Integration" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 text-zinc-400 text-sm"
              >
                <Icon className="h-4 w-4 text-zinc-500" />
                {label}
              </div>
            ))}
          </div>
        </section>

        {/* How It Works */}
        <section className="px-6 sm:px-8 py-20 border-t border-[#27272a]">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                How It Works
              </h2>
              <p className="text-zinc-400 text-lg max-w-xl mx-auto">
                Get your first AI agent running in under 2 minutes.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {howItWorks.map(({ step, icon: Icon, title, description, color, bg }) => (
                <div key={step} className="text-center">
                  <div className={cn("mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-5", bg)}>
                    <Icon className={cn("h-7 w-7", color)} />
                  </div>
                  <div className="text-xs font-bold text-zinc-600 uppercase tracking-wider mb-2">
                    Step {step}
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="px-6 sm:px-8 py-20 border-t border-[#27272a]">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Simple, Transparent Pricing
              </h2>
              <p className="text-zinc-400 text-lg max-w-xl mx-auto">
                Start free, upgrade when you&apos;re ready. All plans include a 14-day free trial.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {pricingTiers.map((tier) => (
                <Card
                  key={tier.name}
                  className={cn(
                    "bg-[#0a0a0a] border-[#27272a] relative overflow-hidden",
                    tier.popular && "border-blue-500/50 ring-1 ring-blue-500/20"
                  )}
                >
                  {tier.popular && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-purple-500" />
                  )}
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-white">{tier.name}</h3>
                      {tier.popular && (
                        <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-xs">
                          Most popular
                        </Badge>
                      )}
                    </div>
                    <div className="mb-4">
                      <span className="text-4xl font-bold text-white">€{tier.price}</span>
                      <span className="text-zinc-500 text-sm">/month</span>
                    </div>
                    <p className="text-sm text-zinc-400 mb-6">{tier.description}</p>
                    <ul className="space-y-3 mb-8">
                      {tier.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-2 text-sm text-zinc-300">
                          <Check className="h-4 w-4 text-green-500 shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <Button
                      asChild
                      className={cn(
                        "w-full font-semibold",
                        tier.popular
                          ? "bg-blue-500 hover:bg-blue-600 text-white"
                          : "bg-zinc-800 hover:bg-zinc-700 text-white border border-[#27272a]"
                      )}
                    >
                      <Link href="/signup">{tier.cta}</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="px-8 py-6 text-center text-zinc-600 text-sm border-t border-[#27272a]">
        &copy; 2026 ClawCommerce. All rights reserved.
      </footer>
    </div>
  );
}
