# CLAUDE.md — EcomClaw Build Instructions

## What This Is
EcomClaw is a SaaS platform where e-commerce dropshippers deploy pre-built AI agents to automate their business. Users sign up, connect Shopify stores, pick agent templates, and chat with their agents through a built-in web interface.

## Tech Stack
- **Frontend**: Next.js 15 (App Router) + Tailwind CSS + Lucide icons
- **Backend API**: C# .NET 10, ASP.NET Core Web API
- **Auth**: JWT (custom AuthService) — in-memory user store for MVP
- **Real-time**: SignalR hub at `/hubs/chat`
- **Data**: In-memory ConcurrentDictionary stores (no DB yet — MVP)
- **Monorepo**: Turborepo — `apps/web` (Next.js) + `apps/api` (.NET)

## Project Structure
```
apps/
  web/                          # Next.js 15 frontend
    app/
      (auth)/login/page.tsx     # Login page
      (auth)/signup/page.tsx    # Register page
      dashboard/layout.tsx      # Dashboard shell (sidebar + auth guard)
      dashboard/page.tsx        # Overview dashboard
      dashboard/agents/page.tsx # Agent management
      dashboard/store/page.tsx  # Agent template store + deploy modal
      dashboard/chat/page.tsx   # Chat interface (CRASHES — hooks bug)
      dashboard/stores/page.tsx # Shopify store management
      dashboard/analytics/page.tsx
      dashboard/settings/page.tsx
    lib/
      api.ts                    # Fetch wrapper with JWT auth
      auth.tsx                  # AuthContext + useAuth hook
      signalr.ts                # SignalR client
      utils.ts                  # cn() helper
  api/                          # .NET 10 Web API
    Controllers/
      AuthController.cs         # Login/register/me
      AgentController.cs        # CRUD agents + toggle status
      StoreController.cs        # CRUD stores + store agents
      TemplateController.cs     # Agent templates
      ChatController.cs
      AnalyticsController.cs
      SettingsController.cs
    Hubs/ChatHub.cs             # SignalR hub
    Services/AuthService.cs     # JWT + BCrypt auth
    Models/                     # Agent, Store, User, etc.
```

## Running Locally
```bash
# Terminal 1 — API (port 5000)
cd apps/api && dotnet run

# Terminal 2 — Frontend (port 3000)
cd apps/web && npm run dev
```
Next.js proxies `/api/*` to the .NET backend (check `next.config.ts`).

## Current State & Known Bugs

### 🔴 Crashes
1. **Chat page crashes** — client-side exception on `/dashboard/chat`. React hooks order violation in `layout.tsx:57` — the `useEffect` that redirects to `/login` fires conditionally after hooks that depend on auth state. Fix: ensure all hooks are called unconditionally before any early returns.
2. **Shopify/Stores page crashes** — same hooks order bug from DashboardLayout.

### 🟡 Architecture Issues
- **No database** — everything is in-memory ConcurrentDictionary. Data resets on API restart. Need PostgreSQL + EF Core.
- **No shadcn/ui** — all components are hand-written with raw Tailwind classes. Should use shadcn/ui components (`npx shadcn@latest init` then add Button, Card, Dialog, Sidebar, Input, etc.) for consistency and speed.
- **Chat is fake** — `handleSend` uses `setTimeout` to simulate agent responses. Need real SignalR integration to relay messages to/from OpenClaw instances.
- **API response format inconsistent** — some endpoints wrap in `{ stores: [...] }`, others return arrays directly. Frontend has to handle both with `.catch()` fallbacks.
- **Templates are hardcoded in frontend** — should come from API (`TemplateController` exists but frontend doesn't use it).
- **Sidebar nav says "Shopify" but route is "stores"** — naming inconsistency (nav item label vs actual page purpose).

### 🟢 What Works
- Auth flow (register/login/JWT/logout)
- Dashboard with stats cards
- Agent Store with category filters, search, deploy modal with config fields
- Agent management (create/toggle/delete)
- Store management (add/delete/expand details)
- Settings page (account, API keys, billing — all UI only, no persistence)
- Analytics page (UI shell, no real data)
- Dark theme is solid
- Mobile responsive sidebar with collapse

## What to Build Next (Priority Order)

### Phase 1: Fix Crashes & Add shadcn/ui
1. Fix React hooks order bug in `dashboard/layout.tsx` — move the auth redirect logic so hooks aren't called conditionally
2. Install shadcn/ui: `npx shadcn@latest init` (dark theme, zinc base)
3. Replace hand-written inputs/buttons/cards/dialogs with shadcn components
4. Fix API response format — standardize all endpoints

### Phase 2: Real Database
1. Add PostgreSQL + EF Core to the .NET API
2. Migrate User, Store, Agent models to proper entities with relationships
3. Add migrations
4. Data persists across restarts

### Phase 3: Onboarding Flow
After signup, guide user through:
1. Connect Shopify store (URL + API token)
2. Enter AI API key (Anthropic/OpenAI) with instructions
3. Deploy first agent from template
4. Open chat with that agent

Show a welcome banner on dashboard for users with 0 stores/agents.

### Phase 4: Agent Configuration Wizard
When deploying an agent, 3 layers:
- **Layer 1 (everyone)**: Name, focus category, schedule, permissions (checkboxes)
- **Layer 2 (power users)**: Behavior rules, knowledge upload, integrations
- **Layer 3 (advanced)**: Raw SOUL.md editor (Monaco/CodeMirror)

### Phase 5: Real Chat
- Connect SignalR hub to actual OpenClaw instances
- Stream responses token-by-token
- Persist chat history in PostgreSQL
- Markdown rendering with `react-markdown`

### Phase 6: Billing (Stripe)
- Starter €29/mo (3 agents, 1 store)
- Pro €49/mo (10 agents, 3 stores)
- Business €99/mo (unlimited)

### Phase 7: VPS Provisioning (Hetzner)
- Auto-provision VPS per user on payment
- Cloud-init script installs OpenClaw
- Cloudflare Tunnel for secure access

## Design System
- **Background**: #09090b (zinc-950)
- **Cards/surfaces**: #0a0a0a
- **Borders**: #27272a (zinc-800)
- **Accent**: blue-500 (#3b82f6)
- **Font**: System default (should switch to Inter via next/font)
- **Icons**: Lucide React
- Dark theme only for MVP
- Use shadcn/ui components everywhere — stop hand-writing form elements

## Code Conventions
- Frontend: TypeScript, functional components, hooks
- API: C# .NET, controller-based, `[Authorize]` on protected routes
- User isolation: every query filters by `userId` from JWT claims
- `api.ts` handles auth headers and 401 → redirect automatically

## Important Notes
- This is MVP stage — speed > perfection
- shadcn/ui is mandatory for all new UI work (see https://ui.shadcn.com)
- Keep the dark aesthetic — it looks good, don't add light mode
- Every agent must be scoped to a store — no orphan agents
- API tokens are stored in plaintext (MVP) — encrypt later with AES-256
