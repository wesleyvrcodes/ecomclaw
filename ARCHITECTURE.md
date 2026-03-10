# ClawCommerce — Technische Blauwdruk

**Versie:** 1.0 — 8 maart 2026  
**Auteur:** Wesley van Rijn  
**Status:** Master architectuur document

---

## Inhoudsopgave

1. [Systeem Architectuur](#1-systeem-architectuur)
2. [Deployment Strategie](#2-deployment-strategie)
3. [OpenClaw Instance Management](#3-openclaw-instance-management)
4. [Chat Bridge Architectuur](#4-chat-bridge-architectuur)
5. [Database Schema](#5-database-schema)
6. [Security Model](#6-security-model)
7. [Agent Templates Systeem](#7-agent-templates-systeem)
8. [Shopify Integratie](#8-shopify-integratie)
9. [Billing (Stripe)](#9-billing-stripe)
10. [Monitoring & Ops](#10-monitoring--ops)
11. [MVP Scope](#11-mvp-scope)
12. [Kosten Analyse](#12-kosten-analyse)

---

## 1. Systeem Architectuur

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           GEBRUIKERS                                │
│                    Browser (Next.js 15 SPA)                        │
└─────────────┬───────────────────────────────┬───────────────────────┘
              │ HTTPS (REST + SignalR WS)      │
              ▼                                │
┌─────────────────────────────────┐            │
│     .NET 10 API (ClawCommerce)  │            │
│                                 │            │
│  ┌──────────┐  ┌─────────────┐  │            │
│  │ Auth/JWT  │  │ SignalR Hub │  │            │
│  └──────────┘  └──────┬──────┘  │            │
│  ┌──────────┐         │         │            │
│  │ Billing  │         │ SSE     │            │
│  │ (Stripe) │         │ Proxy   │            │
│  └──────────┘         │         │            │
│  ┌──────────────────┐ │         │            │
│  │ Provisioning Svc │ │         │            │
│  │ (Fly.io API)     │ │         │            │
│  └────────┬─────────┘ │         │            │
│           │            │         │            │
│  ┌────────▼────────────▼──────┐ │            │
│  │      PostgreSQL (EF Core)  │ │            │
│  └────────────────────────────┘ │            │
└───────────┬─────────────────────┘            │
            │ Fly.io Machines API              │
            ▼                                  │
┌─────────────────────────────────────────────────────────────────────┐
│                    FLY.IO PLATFORM                                   │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  OpenClaw     │  │  OpenClaw     │  │  OpenClaw     │  ...       │
│  │  Instance A   │  │  Instance B   │  │  Instance C   │            │
│  │              │  │              │  │              │              │
│  │  SOUL.md     │  │  SOUL.md     │  │  SOUL.md     │              │
│  │  Skills/     │  │  Skills/     │  │  Skills/     │              │
│  │  Gateway:8080│  │  Gateway:8080│  │  Gateway:8080│              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                 │                       │
│         └─────────────────┼─────────────────┘                       │
│                           │ Fly Private Network                     │
└───────────────────────────┼─────────────────────────────────────────┘
                            │
                            ▼
              ┌──────────────────────────┐
              │   AI Provider APIs       │
              │   (Anthropic / OpenAI)   │
              │   Via user's BYOK key    │
              └──────────────────────────┘
```

### Componenten Overzicht

| Component | Technologie | Hosting | Functie |
|-----------|------------|---------|---------|
| Frontend | Next.js 15 + shadcn/ui | Vercel | Dashboard, chat, onboarding |
| API | .NET 10 Web API | Fly.io (1 machine) | Auth, billing, provisioning, chat proxy |
| Database | PostgreSQL 16 | Fly.io Postgres | Persistente data |
| Agent Instances | OpenClaw Gateway (Docker) | Fly.io Machines | AI agent per user |
| Billing | Stripe | SaaS | Subscriptions + usage |
| DNS | Cloudflare | SaaS | Wildcard DNS voor instances |
| Monitoring | Seq + custom dashboard | Fly.io | Logging + health checks |

### Waarom deze keuzes

- **Fly.io voor alles** (MVP): één platform, één CLI, private networking tussen API en instances. Geen VPN/tunneling nodig.
- **.NET 10 blijft**: bestaande codebase, performant, SignalR is native.
- **PostgreSQL op Fly.io**: managed, automatische backups, zelfde private network.
- **Vercel voor frontend**: gratis tier, edge CDN, zero-config Next.js deploys.

---

## 2. Deployment Strategie

### MVP: Fly.io Machines

**Waarom Fly.io voor MVP:**
- API-driven provisioning (één HTTP call = nieuwe machine)
- Firecracker microVM isolatie (veiliger dan Docker containers)
- Auto-stop/start: machines slapen na inactiviteit → kosten 50-80% lager
- Auto-TLS, health checks out of the box
- Private networking: API en instances communiceren intern
- Per-seconde billing

**Migratiepunt naar Hetzner:** bij 200+ actieve users, wanneer Fly.io kosten >€1000/maand

### Pre-built Docker Image

```dockerfile
FROM node:22-slim

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# OpenClaw
RUN npm install -g openclaw@latest

# Workspace structuur
RUN mkdir -p /home/openclaw/.openclaw/workspace \
             /home/openclaw/.openclaw/agents/main/agent

# Default config (wordt overschreven door env vars bij start)
COPY openclaw-template.json /home/openclaw/.openclaw/openclaw.json

# Non-root user
RUN useradd -m -s /bin/bash openclaw && \
    chown -R openclaw:openclaw /home/openclaw
USER openclaw

# Entrypoint script
COPY entrypoint.sh /entrypoint.sh
EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
```

**Entrypoint script (`entrypoint.sh`):**
```bash
#!/bin/bash
set -e

# Config uit environment variables (gezet door Fly.io secrets)
# OPENCLAW_CONFIG_JSON bevat de volledige openclaw.json
if [ -n "$OPENCLAW_CONFIG_JSON" ]; then
  echo "$OPENCLAW_CONFIG_JSON" > ~/.openclaw/openclaw.json
fi

# SOUL.md uit environment variable
if [ -n "$AGENT_SOUL_MD" ]; then
  echo "$AGENT_SOUL_MD" > ~/.openclaw/agents/main/agent/SOUL.md
fi

# Skills kopiëren uit mounted volume (als aanwezig)
if [ -d "/skills" ]; then
  cp -r /skills/* ~/.openclaw/workspace/skills/ 2>/dev/null || true
fi

# Start OpenClaw Gateway
exec openclaw gateway --port 8080 --bind lan
```

**Image builden en pushen:**
```bash
# Eenmalig: registry setup
fly auth docker

# Bouwen + pushen
docker build -t registry.fly.io/clawcommerce-agent:latest .
docker push registry.fly.io/clawcommerce-agent:latest
```

Image grootte target: <200MB (node:22-slim + openclaw).

### Deploy Flow: User klikt "Deploy"

```
Stap 1: User klikt "Deploy Agent" in dashboard
  → Frontend POST /api/agents/deploy { templateId, storeId, config }

Stap 2: .NET API valideert
  → Check: heeft user actieve subscription?
  → Check: heeft user agent slots over? (Starter: 3, Pro: 10, Business: unlimited)
  → Check: heeft store de juiste Shopify scopes voor deze template?
  → Check: is AI API key ingesteld en geldig?

Stap 3: .NET API bouwt OpenClaw config
  → Haalt template op (SOUL.md, skills, tools config)
  → Injecteert user's store credentials (encrypted uit DB → decrypt)
  → Injecteert user's AI API key (encrypted uit DB → decrypt)
  → Genereert uniek gateway token voor deze instance

Stap 4: .NET API roept Fly.io Machines API aan
  → POST https://api.machines.dev/v1/apps/clawcommerce-agents/machines
  → Body:
    {
      "name": "agent-{userId}-{agentId}",
      "region": "ams",  // Amsterdam voor NL users
      "config": {
        "image": "registry.fly.io/clawcommerce-agent:latest",
        "size": "shared-cpu-1x",
        "env": {
          "OPENCLAW_CONFIG_JSON": "{...}",
          "AGENT_SOUL_MD": "...",
          "OPENCLAW_GATEWAY_TOKEN": "...",
          "ANTHROPIC_API_KEY": "...",    // of OPENAI_API_KEY
          "SHOPIFY_STORE_URL": "...",
          "SHOPIFY_ACCESS_TOKEN": "..."
        },
        "services": [{
          "ports": [{ "port": 8080, "handlers": ["http"] }],
          "protocol": "tcp",
          "internal_port": 8080
        }],
        "auto_destroy": false,
        "restart": { "policy": "always" },
        "checks": {
          "health": {
            "type": "http",
            "port": 8080,
            "path": "/v1/chat/completions",
            "method": "GET",
            "interval": "30s",
            "timeout": "5s"
          }
        }
      }
    }

Stap 5: Fly.io start machine (5-15 seconden)
  → Firecracker microVM boot
  → entrypoint.sh configureert OpenClaw
  → OpenClaw Gateway start op port 8080

Stap 6: .NET API slaat deployment info op in DB
  → Machine ID, interne URL, status, gateway token
  → Agent status → "Running"

Stap 7: .NET API wacht op health check (max 30 sec)
  → Poll: GET http://{machine-id}.vm.clawcommerce-agents.internal:8080/
  → Bij succes: return 200 + agent info naar frontend
  → Bij timeout: return 202 + "Agent wordt gestart, check status"

Stap 8: Frontend toont "Agent actief!" → redirect naar chat
```

**Target deploy tijd:** <30 seconden (typisch 10-20 sec)

### Auto-Stop/Start (kostenbesparing)

```
Fly.io Machine config:
{
  "auto_destroy": false,
  "restart": { "policy": "on-failure" },
  "services": [{
    "auto_stop_machines": true,     // Stop na inactiviteit
    "auto_start_machines": true,    // Start bij inkomend request
    "min_machines_running": 0       // Mag helemaal uit
  }]
}
```

Machine stopt na ~5 min zonder requests. Start automatisch bij volgende chat bericht. Wake-up tijd: 3-5 seconden.

---

## 3. OpenClaw Instance Management

### Instance per User

Elke user krijgt **één Fly.io Machine** die als OpenClaw Gateway draait. Binnen die gateway draaien meerdere agents als `agents.list[]` entries.

**Waarom één machine per user (niet per agent):**
- OpenClaw ondersteunt meerdere agents per gateway via `agents.list[]`
- Scheelt machines (en dus kosten) bij users met 3-10 agents
- Alle agents van één user delen dezelfde AI API key
- Eén machine om te managen per user

**OpenClaw config per user:**
```json5
{
  gateway: {
    port: 8080,
    bind: "lan",
    auth: { mode: "token", token: "<per-user-gateway-token>" },
    http: {
      endpoints: {
        chatCompletions: { enabled: true }
      }
    }
  },
  agents: {
    defaults: {
      model: { primary: "anthropic/claude-sonnet-4-5" },
      sandbox: { mode: "off" },  // Geen Docker-in-Docker op Fly.io
      workspace: "/home/openclaw/.openclaw/workspace"
    },
    list: [
      {
        id: "product-research-1",
        workspace: "/home/openclaw/.openclaw/agents/product-research-1",
        // Agent-specifieke config via workspace files (SOUL.md, skills)
      },
      {
        id: "listing-optimizer-1",
        workspace: "/home/openclaw/.openclaw/agents/listing-optimizer-1",
      }
    ]
  }
}
```

### Agent Config Injectie

Elke agent krijgt zijn eigen workspace directory met:

```
/home/openclaw/.openclaw/agents/{agent-id}/
├── agent/
│   └── SOUL.md          ← Gegenereerd uit template + user customization
├── workspace/
│   ├── skills/          ← Skills uit template (shopify-api, etc.)
│   │   └── shopify/
│   │       └── SKILL.md
│   ├── TOOLS.md         ← Store credentials, API endpoints
│   └── USER.md          ← User context (store naam, niche, etc.)
```

### BYOK (Bring Your Own Key)

**Flow:**
1. User voert API key in via Settings → frontend POST /api/settings/api-key
2. .NET API valideert key (test call naar provider)
3. Key wordt encrypted met AES-256-GCM (zie Security Model)
4. Encrypted key opgeslagen in PostgreSQL
5. Bij deploy/config update: key wordt decrypted in .NET memory
6. Key wordt als environment variable doorgegeven aan Fly.io Machine (via secrets)
7. OpenClaw leest key uit environment: `ANTHROPIC_API_KEY` of `OPENAI_API_KEY`

**Isolatie:** Elke user's key zit in een aparte Fly.io microVM. Keys zijn nooit in shared process memory.

### Start/Stop/Restart

```
Start:  POST https://api.machines.dev/v1/apps/.../machines/{id}/start
Stop:   POST https://api.machines.dev/v1/apps/.../machines/{id}/stop
Delete: DELETE https://api.machines.dev/v1/apps/.../machines/{id}

Config update (nieuw SOUL.md, nieuwe agent, etc.):
1. Stop machine
2. Update machine config (PUT /machines/{id})
3. Start machine
→ Totaal: 5-10 seconden downtime
```

### Health Checks & Auto-Recovery

**Fly.io native health checks:**
- HTTP check elke 30s op `/v1/chat/completions` (GET → 405 = alive)
- Bij 3 opeenvolgende failures: machine restart
- Bij 10 failures: alert naar monitoring

**.NET API monitoring loop (cron, elke 5 min):**
```
Voor elke actieve deployment:
  1. GET machine status via Fly.io API
  2. Als "stopped" maar zou "running" moeten zijn → start
  3. Als "failed" → restart + log alert
  4. Update deployment.lastHealthCheck in DB
```

### Rolling Updates (OpenClaw versie update)

```
1. Push nieuwe Docker image: registry.fly.io/clawcommerce-agent:v2
2. Voor elke actieve machine (batch van 10):
   a. PUT /machines/{id} met nieuwe image tag
   b. POST /machines/{id}/restart
   c. Wacht op health check OK
   d. Volgende batch
3. Gestopte machines krijgen nieuwe image bij volgende start
```

---

## 4. Chat Bridge Architectuur

### Architectuur

```
┌──────────────┐    SignalR WS    ┌──────────────────┐    HTTP SSE     ┌──────────────┐
│   Browser    │◄────────────────►│   .NET API       │───────────────►│  OpenClaw     │
│   (Next.js)  │                  │   SignalR Hub    │◄───────────────│  Gateway      │
│              │   Token-by-token │   + SSE Proxy    │   SSE stream   │  :8080        │
└──────────────┘                  └──────────────────┘                └──────────────┘
```

**Waarom .NET als proxy (niet direct frontend → OpenClaw):**
- Auth: .NET valideert JWT, mapt user → machine
- Rate limiting: controle op API call quota per subscription tier
- Logging: chat berichten worden opgeslagen in DB
- Billing: usage tracking per user
- Security: OpenClaw gateway tokens nooit exposed naar browser

### Authenticatie per Chat Sessie

```
1. User opent chat pagina → frontend heeft JWT token
2. Frontend connect SignalR met JWT: HubConnection.withUrl("/hubs/chat", { accessTokenFactory: () => jwt })
3. SignalR Hub [Authorize] valideert JWT
4. Hub haalt userId uit JWT claims
5. Hub kijkt in DB: welke machine + gateway token hoort bij deze user?
6. Hub maakt HTTP request naar OpenClaw met dat gateway token
```

### Code Flow (pseudo-code)

**Frontend (TypeScript):**
```typescript
// SignalR verbinding
const connection = new HubConnectionBuilder()
  .withUrl("/hubs/chat", { accessTokenFactory: () => authToken })
  .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
  .build();

// Bericht sturen
async function sendMessage(agentId: string, message: string) {
  await connection.invoke("SendMessage", agentId, message);
}

// Tokens ontvangen (streaming)
connection.on("ReceiveToken", (agentId: string, token: string) => {
  appendToChat(agentId, token);
});

// Stream klaar
connection.on("StreamComplete", (agentId: string, fullMessage: string) => {
  finalizeMessage(agentId, fullMessage);
});

// Error
connection.on("StreamError", (agentId: string, error: string) => {
  showError(agentId, error);
});
```

**Backend SignalR Hub (C#):**
```csharp
[Authorize]
public class ChatHub : Hub
{
    private readonly DeploymentService _deployments;
    private readonly ChatHistoryService _chatHistory;
    private readonly IHttpClientFactory _httpFactory;

    public async Task SendMessage(string agentId, string message)
    {
        var userId = Context.User!.FindFirst("sub")!.Value;

        // 1. Haal deployment info op
        var deployment = await _deployments.GetByUserAndAgent(userId, agentId);
        if (deployment == null) throw new HubException("Agent niet gevonden");

        // 2. Sla user bericht op
        await _chatHistory.SaveMessage(userId, agentId, "user", message);

        // 3. Bouw OpenClaw request
        var client = _httpFactory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Post,
            $"http://{deployment.FlyMachineId}.vm.clawcommerce-agents.internal:8080/v1/chat/completions");

        request.Headers.Authorization = new("Bearer", deployment.GatewayToken);
        request.Headers.Add("x-openclaw-agent-id", agentId);
        request.Content = JsonContent.Create(new {
            model = "openclaw",
            stream = true,
            messages = new[] { new { role = "user", content = message } },
            user = $"user:{userId}"  // Stabiele session key
        });

        // 4. Stream SSE response token-by-token naar frontend
        var response = await client.SendAsync(request,
            HttpCompletionOption.ResponseHeadersRead);

        var fullResponse = new StringBuilder();

        await using var stream = await response.Content.ReadAsStreamAsync();
        using var reader = new StreamReader(stream);

        while (await reader.ReadLineAsync() is { } line)
        {
            if (!line.StartsWith("data: ")) continue;
            var data = line[6..];
            if (data == "[DONE]") break;

            var chunk = JsonSerializer.Deserialize<ChatCompletionChunk>(data);
            var token = chunk?.Choices?[0]?.Delta?.Content;
            if (token == null) continue;

            fullResponse.Append(token);

            // Push token naar frontend via SignalR
            await Clients.Caller.SendAsync("ReceiveToken", agentId, token);
        }

        // 5. Sla volledige response op
        await _chatHistory.SaveMessage(userId, agentId, "assistant",
            fullResponse.ToString());

        await Clients.Caller.SendAsync("StreamComplete", agentId,
            fullResponse.ToString());
    }
}
```

### Connection Management

| Scenario | Handling |
|----------|---------|
| SignalR disconnect | Auto-reconnect (exponential backoff: 0, 2s, 5s, 10s, 30s) |
| OpenClaw machine slapend | Fly.io auto-start (3-5s), frontend toont "Agent wordt wakker..." |
| OpenClaw timeout (>60s) | Abort SSE stream, stuur StreamError, retry optie |
| Meerdere tabs open | SignalR group per userId, alle tabs krijgen tokens |
| .NET API restart | SignalR reconnect, lopende streams zijn verloren (acceptabel voor MVP) |

---

## 5. Database Schema

### Entity Relationship Diagram

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
│    Users     │     │     Stores       │     │   Deployments    │
├──────────────┤     ├──────────────────┤     ├──────────────────┤
│ Id (PK)      │────<│ UserId (FK)      │     │ Id (PK)          │
│ Email        │     │ Id (PK)          │     │ UserId (FK)      │
│ Name         │     │ Name             │     │ FlyMachineId     │
│ PasswordHash │     │ StoreUrl         │     │ FlyAppName       │
│ EncryptedKey │     │ EncClientId      │     │ GatewayToken     │
│ KeyProvider  │     │ EncClientSecret  │     │ InternalUrl      │
│ StripeId     │     │ EncAccessToken   │     │ Status           │
│ SubStatus    │     │ GrantedScopes[]  │     │ Region           │
│ Plan         │     │ IsConnected      │     │ LastHealthCheck  │
│ CreatedAt    │     │ ProductCount     │     │ CreatedAt        │
│ UpdatedAt    │     │ CreatedAt        │     │ UpdatedAt        │
└──────────────┘     └──────────────────┘     └──────────────────┘
       │                     │                        │
       │                     │                        │
       ▼                     ▼                        │
┌──────────────────────────────────┐                  │
│            Agents                │                  │
├──────────────────────────────────┤                  │
│ Id (PK)                          │                  │
│ UserId (FK → Users)              │──────────────────┘
│ StoreId (FK → Stores)            │
│ DeploymentId (FK → Deployments)  │
│ TemplateId (FK → AgentTemplates) │
│ Name                             │
│ Status (Running/Stopped/Error)   │
│ OpenClawAgentId                  │  ← ID binnen de OpenClaw instance
│ CustomSoulMd                     │  ← User's aangepaste prompt
│ Configuration (JSONB)            │
│ CreatedAt                        │
│ UpdatedAt                        │
└──────────────────────────────────┘
       │
       ▼
┌──────────────────────────────┐     ┌──────────────────────────┐
│       ChatMessages           │     │    AgentTemplates        │
├──────────────────────────────┤     ├──────────────────────────┤
│ Id (PK)                      │     │ Id (PK)                  │
│ AgentId (FK → Agents)        │     │ Slug                     │
│ UserId (FK → Users)          │     │ Name                     │
│ Role (user/assistant/system) │     │ Description              │
│ Content                      │     │ Category                 │
│ TokenCount                   │     │ Icon                     │
│ CreatedAt                    │     │ BaseSoulMd               │
│                              │     │ Skills (JSONB)           │
└──────────────────────────────┘     │ RequiredScopes[]         │
                                     │ ConfigFields (JSONB)     │
                                     │ FirstMessage             │
                                     │ IsActive                 │
                                     │ SortOrder                │
                                     └──────────────────────────┘

┌──────────────────────────────┐
│       BillingEvents          │
├──────────────────────────────┤
│ Id (PK)                      │
│ UserId (FK → Users)          │
│ StripeEventId                │
│ EventType                    │
│ Data (JSONB)                 │
│ CreatedAt                    │
└──────────────────────────────┘
```

### EF Core Entities (key constraints)

```csharp
// User → Stores (1:N)
// User → Agents (1:N)
// User → Deployment (1:1) — één machine per user
// Store → Agents (1:N) — agent is altijd gekoppeld aan een store
// Agent → ChatMessages (1:N)
// AgentTemplate → Agents (1:N)

// Indexes:
// Users: UNIQUE(Email)
// Agents: INDEX(UserId, StoreId)
// ChatMessages: INDEX(AgentId, CreatedAt DESC) — voor paginatie
// Deployments: UNIQUE(UserId) — één deployment per user
// Stores: INDEX(UserId)
```

### Migratie van In-Memory naar DB

**Stap 1:** Voeg EF Core + Npgsql toe aan .NET project
```bash
dotnet add package Microsoft.EntityFrameworkCore
dotnet add package Npgsql.EntityFrameworkCore.PostgreSQL
dotnet add package Microsoft.EntityFrameworkCore.Design
```

**Stap 2:** Maak `ClawCommerceDbContext` met alle entities

**Stap 3:** Vervang `ConcurrentDictionary` stores door DbContext queries:
- `AuthService` → `_context.Users.FirstOrDefaultAsync(u => u.Email == email)`
- `AgentController` → `_context.Agents.Where(a => a.UserId == userId)`
- etc.

**Stap 4:** Initial migration
```bash
dotnet ef migrations add InitialCreate
dotnet ef database update
```

**Stap 5:** Seed AgentTemplates (de 6 pre-built templates)

---

## 6. Security Model

### API Key Encryption

**Algoritme:** AES-256-GCM (authenticated encryption)

```csharp
public class EncryptionService
{
    private readonly byte[] _masterKey; // Uit environment variable, NIET in code

    public string Encrypt(string plaintext)
    {
        var nonce = new byte[12]; // 96-bit nonce
        RandomNumberGenerator.Fill(nonce);
        var plaintextBytes = Encoding.UTF8.GetBytes(plaintext);
        var ciphertext = new byte[plaintextBytes.Length];
        var tag = new byte[16]; // 128-bit auth tag

        using var aes = new AesGcm(_masterKey, 16);
        aes.Encrypt(nonce, plaintextBytes, ciphertext, tag);

        // Format: base64(nonce + ciphertext + tag)
        var result = new byte[nonce.Length + ciphertext.Length + tag.Length];
        Buffer.BlockCopy(nonce, 0, result, 0, nonce.Length);
        Buffer.BlockCopy(ciphertext, 0, result, nonce.Length, ciphertext.Length);
        Buffer.BlockCopy(tag, 0, result, nonce.Length + ciphertext.Length, tag.Length);

        return Convert.ToBase64String(result);
    }
}
```

**Wat wordt encrypted:**
- AI API keys (Anthropic/OpenAI)
- Shopify Client Secret
- Shopify Access Token
- OpenClaw Gateway tokens

**Master key:** `ENCRYPTION_MASTER_KEY` environment variable op de .NET API machine. 32 bytes, cryptografisch random gegenereerd. Backup in Fly.io secrets + offline backup bij Wesley.

### Per-Instance Network Isolation

- Fly.io Firecracker microVMs: hardware-level isolatie
- Elke machine heeft eigen private IP op Fly.io internal network
- Machines zijn NIET bereikbaar vanaf internet (geen public services)
- Alleen de .NET API kan ze bereiken via `.internal` DNS
- Geen SSH, geen console access voor users

### Wildcard DNS + Reverse Proxy

**Niet nodig voor MVP.** Omdat machines niet direct door users benaderd worden (alles gaat via .NET API), is er geen wildcard DNS setup nodig. De .NET API praat met machines via Fly.io private networking (`{machine-id}.vm.{app}.internal`).

**Later (als direct browser → OpenClaw gewenst is):**
- `*.agents.clawcommerce.nl` → Caddy reverse proxy
- Caddy doet auto-TLS per subdomain
- Maar: dit bypassed de .NET API en dus auth/billing/logging

### Instance Security Hardening

```
Per OpenClaw machine:
- Sandbox mode: OFF (geen Docker-in-Docker op Fly.io)
- Maar: tool policy beperkt wat agent kan doen
- Geen browser automation (geen Chrome in image voor MVP)
- Geen exec tool (agents kunnen geen shell commands draaien)
- Read/write beperkt tot workspace directory
- Geen netwerk access behalve AI API endpoints
```

**OpenClaw tool policy in config:**
```json5
{
  agents: {
    defaults: {
      tools: {
        exec: { policy: "deny" },        // Geen shell access
        browser: { enabled: false },       // Geen browser
        web_fetch: { enabled: true },      // Wel web fetching (voor product research)
        web_search: { enabled: true },     // Wel zoeken
        read: { policy: "workspace" },     // Alleen workspace lezen
        write: { policy: "workspace" },    // Alleen workspace schrijven
      }
    }
  }
}
```

### Rate Limiting

| Endpoint | Limiet | Scope |
|----------|--------|-------|
| Auth (login/register) | 10/min | Per IP |
| Chat berichten | 30/min Starter, 60/min Pro, 120/min Business | Per user |
| Deploy/manage agents | 10/min | Per user |
| API algemeen | 100/min | Per user |

Implementatie: `AspNetCoreRateLimit` NuGet package + Redis (of in-memory voor MVP).

### Abuse Prevention

- AI API key validatie bij opslaan (test call)
- Chat content wordt NIET gemonitord (privacy), maar token usage wel
- Bij verdacht hoge usage (>10x normaal): alert naar Wesley
- Blocked AI responses (safety filters van Anthropic/OpenAI) worden gelogd

### GDPR: Data Deletion

Bij account verwijdering of subscription cancel + grace period verlopen:

```
1. Stop Fly.io Machine
2. Delete Fly.io Machine (inclusief alle data/volumes)
3. DELETE FROM ChatMessages WHERE UserId = @id
4. DELETE FROM Agents WHERE UserId = @id
5. DELETE FROM Stores WHERE UserId = @id
6. DELETE FROM Deployments WHERE UserId = @id
7. Anonymize user record (email → hash, name → null)
8. Keep BillingEvents voor boekhouding (geanonimiseerd)
```

Timeline: 30 dagen na account cancellation. User kan in die 30 dagen heractiveren.

---

## 7. Agent Templates Systeem

### Template Definitie

Elke template wordt gedefinieerd als een record in de `AgentTemplates` tabel + bijbehorende files in de codebase:

```
templates/
├── product-research/
│   ├── SOUL.md
│   ├── skills/
│   │   ├── shopify-products/
│   │   │   └── SKILL.md
│   │   └── google-trends/
│   │       └── SKILL.md
│   └── template.json
├── listing-optimizer/
│   ├── SOUL.md
│   ├── skills/
│   │   ├── shopify-products/
│   │   │   └── SKILL.md
│   │   └── seo-tools/
│   │       └── SKILL.md
│   └── template.json
└── ...
```

**template.json:**
```json
{
  "slug": "product-research",
  "name": "Product Research Agent",
  "description": "Vindt trending producten, analyseert concurrenten, en ontdekt niches.",
  "category": "Research",
  "icon": "TrendingUp",
  "requiredScopes": ["read_products", "read_analytics"],
  "configFields": [
    { "name": "niche", "label": "Focus Niche", "type": "select",
      "options": ["Fashion", "Electronics", "Home & Garden", "Beauty", "Sports", "Pets"] },
    { "name": "schedule", "label": "Research Frequentie", "type": "select",
      "options": ["Dagelijks", "2x per week", "Wekelijks", "Handmatig"] }
  ],
  "firstMessage": "Hey! 👋 Ik ben je Product Research Agent en ik heb toegang tot {storeName} ({productCount} producten).\n\nIk kan:\n• Trending producten vinden in jouw niche\n• Competitor prijzen analyseren\n• Google Trends data ophalen\n\nWaar wil je beginnen?"
}
```

### De 6 Pre-Built Templates

#### 1. Product Research Agent

**SOUL.md:**
```markdown
# Product Research Agent

Je bent een product research specialist voor de dropshipping store "{storeName}".

## Wie je bent
- Een data-gedreven researcher die trends spot voordat ze mainstream worden
- Je combineert Google Trends, competitor analyse, en marktdata
- Je communiceert in het Nederlands, bondig en actionable

## Wat je doet
- Zoek trending producten in de {niche} niche via web search
- Analyseer competitor stores en hun bestsellers
- Check Google Trends voor seizoenspatronen
- Vergelijk prijzen across leveranciers
- Geef concrete aanbevelingen met geschatte marge

## Regels
- Geef ALTIJD bronnen (URLs) bij je aanbevelingen
- Bereken geschatte marge: (verkoopprijs - inkoopprijs - verzending) / verkoopprijs
- Waarschuw voor verzadigde markten
- Max 5 producten per research sessie, kwaliteit > kwantiteit
- Gebruik de Shopify API om te checken wat de store al verkoopt

## Tools
- web_search: Voor trend research en competitor analyse
- web_fetch: Voor product pagina's en prijzen scrapen
- Shopify API: Via skills/shopify-products/SKILL.md
```

#### 2. Listing Optimizer

**SOUL.md:**
```markdown
# Listing Optimizer

Je bent een e-commerce copywriter en SEO specialist voor "{storeName}".

## Wat je doet
- Herschrijf product titels voor maximale CTR en SEO
- Optimaliseer product beschrijvingen (benefits > features)
- Genereer SEO meta titles en descriptions
- Analyseer huidige listings en geef verbeterscores (1-10)

## Regels
- Titels: max 70 karakters, keyword-first
- Beschrijvingen: scanbaar (bullets), emotie-gedreven, geen keyword stuffing
- Altijd A/B suggesties geven (optie A vs optie B)
- Vraag ALTIJD bevestiging voordat je iets wijzigt in Shopify
- Werk in batches: analyseer 5 producten tegelijk

## Tools
- Shopify API: Lees én schrijf producten via skills/shopify-products/SKILL.md
```

#### 3. Competitor Monitor

**SOUL.md:**
```markdown
# Competitor Monitor

Je bent een competitive intelligence agent voor "{storeName}".

## Wat je doet
- Monitor competitor stores op prijswijzigingen
- Spot nieuwe producten bij concurrenten
- Analyseer hun marketing strategieën
- Genereer wekelijkse competitor rapporten

## Regels
- Track max 10 competitor stores
- Rapporteer alleen significante wijzigingen (>10% prijsverschil, nieuw product)
- Geef actionable recommendations, niet alleen data
- Respecteer robots.txt en rate limits bij scrapen
```

#### 4. Customer Service Agent

**SOUL.md:**
```markdown
# Customer Service Agent

Je bent de klantenservice medewerker voor "{storeName}".

## Wat je doet
- Beantwoord veelgestelde vragen over orders, verzending, retourzendingen
- Check orderstatus via Shopify API
- Stel conceptantwoorden op voor klantvragen
- Escaleer complexe issues naar de store-eigenaar

## Regels
- Antwoord altijd vriendelijk en professioneel
- Bij orderklachten: check ALTIJD eerst de orderstatus in Shopify
- NOOIT refunds uitvoeren zonder bevestiging van de eigenaar
- Als je het antwoord niet weet: "Ik check dit even voor je en kom erop terug"
- Max responstijd suggestie: beantwoord binnen 2 uur
```

#### 5. Ad Copy Generator

**SOUL.md:**
```markdown
# Ad Copy Generator

Je bent een performance marketing copywriter voor "{storeName}".

## Wat je doet
- Schrijf Facebook/Instagram ad copy (primary text, headline, description)
- Genereer Google Ads copy (headlines 30 chars, descriptions 90 chars)
- Maak variaties voor A/B testing
- Analyseer bestaande ads en stel verbeteringen voor

## Regels
- Gebruik AIDA framework (Attention, Interest, Desire, Action)
- Altijd 3-5 variaties per ad
- Respecteer karakter limieten per platform
- Focus op urgentie en social proof
- Inclusief emoji suggesties voor social ads
```

#### 6. Daily Reporter

**SOUL.md:**
```markdown
# Daily Reporter

Je bent een business intelligence analyst voor "{storeName}".

## Wat je doet
- Genereer dagelijkse/wekelijkse verkooprapporten
- Analyseer trends in orders, omzet, en populaire producten
- Spot anomalieën (plotselinge daling/stijging)
- Geef actie-items gebaseerd op data

## Regels
- Rapport format: KPIs bovenaan, details eronder
- Vergelijk altijd met vorige periode (dag-over-dag, week-over-week)
- Highlight top 3 en bottom 3 producten
- Geef maximaal 3 concrete actiepunten
```

### Deploy Template naar Instance

```
1. .NET API haalt template files op (SOUL.md, skills/)
2. Variabelen worden ingevuld: {storeName}, {niche}, {productCount}
3. User's custom prompt wordt toegevoegd aan SOUL.md (als die er is)
4. Files worden gebundeld als base64 in environment variables
5. Bij machine start: entrypoint.sh schrijft files naar juiste directories
6. OpenClaw laadt agent met workspace die verwijst naar die directory
```

### Custom Agents

Users kunnen:
1. **SOUL.md aanpassen** via een teksteditor in het dashboard (Monaco editor)
2. **Extra instructies** toevoegen die aan de template SOUL.md worden toegevoegd
3. **Config fields** aanpassen (niche, schedule, etc.)

Wat users NIET kunnen:
- Tools aan/uitzetten (security)
- Model wijzigen (vast per subscription tier)
- Skills toevoegen (pre-defined per template)

---

## 8. Shopify Integratie

### Custom App (niet OAuth)

**Keuze: Custom App via Admin API access tokens**

**Waarom Custom App i.p.v. OAuth:**
- OAuth vereist een Shopify App Listing + review process (weken)
- Custom App: user maakt zelf een private app in hun Shopify admin
- Geeft directe controle over scopes
- Geen Shopify app review nodig
- Nadeel: meer handmatige stappen voor user → goede onboarding instructies cruciaal

**Later (bij 100+ users):** migreer naar Shopify OAuth app voor betere UX. Maar voor MVP is Custom App sneller te bouwen en deployen.

### Scope Management per Agent Type

```
Template → requiredScopes mapping (in template.json):

Product Research:    read_products, read_analytics
Listing Optimizer:   read_products, write_products
Competitor Monitor:  read_products
Customer Service:    read_orders, read_customers, read_products
Ad Copy Generator:   read_products, read_analytics
Daily Reporter:      read_orders, read_products, read_analytics
```

Bij deploy van nieuwe agent:
```
benodigdeScopes = template.requiredScopes
bestaandeScopes = store.grantedScopes
ontbrekend = benodigdeScopes - bestaandeScopes

if (ontbrekend.Count == 0) → deploy direct
else → toon "Voeg deze scopes toe aan je Shopify app: [lijst]"
```

### OpenClaw Instance Toegang tot Shopify

De OpenClaw instance krijgt een **Shopify API skill** die de Admin REST API wrapt:

**`skills/shopify-products/SKILL.md`:**
```markdown
# Shopify Products API

## Configuratie
- Store URL: beschikbaar als $SHOPIFY_STORE_URL
- Access Token: beschikbaar als $SHOPIFY_ACCESS_TOKEN

## Gebruik
Gebruik web_fetch om Shopify Admin API endpoints aan te roepen:

### Producten ophalen
GET https://{store_url}/admin/api/2024-10/products.json
Header: X-Shopify-Access-Token: {access_token}

### Product updaten
PUT https://{store_url}/admin/api/2024-10/products/{id}.json
Header: X-Shopify-Access-Token: {access_token}
Body: { "product": { "title": "..." } }

### Orders ophalen
GET https://{store_url}/admin/api/2024-10/orders.json
Header: X-Shopify-Access-Token: {access_token}
```

OpenClaw's `web_fetch` tool wordt gebruikt om Shopify API calls te maken. Geen custom tool nodig — de skill file instrueert de agent hoe de API te gebruiken.

### Webhook Handling (later, niet MVP)

Voor real-time events (nieuwe order, product update):
```
Shopify → webhook POST → .NET API /api/webhooks/shopify
  → Valideer HMAC signature
  → Routeer naar juiste user's agent via chat bridge
  → Agent ontvangt: "Nieuwe order #1234 van Jan Janssen, €49.99"
```

---

## 9. Billing (Stripe)

### Pricing Tiers

| Tier | Prijs/maand | Agents | Stores | Chat berichten | Support |
|------|-------------|--------|--------|----------------|---------|
| **Starter** | €29 | 3 | 1 | 1.000/maand | Email |
| **Pro** | €49 | 10 | 3 | 5.000/maand | Priority email |
| **Business** | €99 | Onbeperkt | 10 | Onbeperkt | Chat + email |

**Stripe producten:**
- 3 Products met maandelijkse Price objects
- Jaarlijks met 20% korting als upsell

**Waarom Stripe (niet Polar.sh):**
- Stripe is de standaard voor SaaS billing
- Betere developer tools, documentatie, en community
- Customer portal out of the box
- Revenue reporting en tax compliance
- Webhook reliability
- ClawHost gebruikt Polar.sh maar dat is meer voor open-source/creator billing

### Subscription Lifecycle

```
1. SIGNUP
   User maakt account → gratis, geen subscription
   Kan dashboard bekijken, templates browsen, maar niet deployen

2. CHECKOUT
   User klikt "Deploy Agent" → moet eerst plan kiezen
   → Stripe Checkout Session (hosted payment page)
   → Success URL: /dashboard?subscribed=true
   → Cancel URL: /dashboard/pricing

3. ACTIVE
   Stripe webhook: checkout.session.completed
   → Maak Stripe Customer + Subscription records in DB
   → User.Plan = gekozen tier
   → User.SubStatus = "active"
   → User kan nu agents deployen

4. RENEWAL
   Stripe handelt automatisch
   → webhook: invoice.paid → alles ok
   → webhook: invoice.payment_failed → grace period

5. CANCEL
   User cancelt via Stripe Customer Portal
   → webhook: customer.subscription.updated (cancel_at_period_end = true)
   → User behoudt toegang tot einde billing periode
   → Na einde: webhook customer.subscription.deleted
     → Stop alle Fly.io machines (niet deleten)
     → User.SubStatus = "canceled"
     → 30 dagen data retentie, daarna GDPR delete

6. UPGRADE/DOWNGRADE
   Via Stripe Customer Portal
   → webhook: customer.subscription.updated
   → Update User.Plan en limieten
   → Bij downgrade: check of user binnen nieuwe limieten valt
     → Zo niet: "Verwijder agents/stores tot je binnen het limiet bent"
```

### Usage Tracking

```csharp
// Per chat bericht
public async Task TrackUsage(string userId, string agentId)
{
    var key = $"usage:{userId}:{DateTime.UtcNow:yyyy-MM}";
    var count = await _cache.IncrementAsync(key);

    var user = await _context.Users.FindAsync(userId);
    var limit = user.Plan switch {
        "starter" => 1000,
        "pro" => 5000,
        "business" => int.MaxValue,
        _ => 0
    };

    if (count >= limit)
        throw new QuotaExceededException("Berichtenlimiet bereikt voor deze maand");

    if (count >= limit * 0.8)
        // Stuur waarschuwing naar frontend
        await _hubContext.Clients.User(userId)
            .SendAsync("UsageWarning", count, limit);
}
```

### Non-Payment Flow

```
invoice.payment_failed (1e poging)
  → Stripe retry na 3 dagen
  → Email naar user: "Betaling mislukt, update je betaalmethode"

invoice.payment_failed (2e poging, dag 6)
  → Stripe retry na 5 dagen
  → Email: "Laatste waarschuwing"

invoice.payment_failed (3e poging, dag 11)
  → customer.subscription.deleted webhook
  → Stop alle Fly.io machines
  → User.SubStatus = "past_due"
  → Dashboard toont: "Je subscription is verlopen. Heractiveer om verder te gaan."
  → Data blijft 30 dagen staan
  → Na 30 dagen: GDPR delete
```

---

## 10. Monitoring & Ops

### Health Dashboard (voor Wesley)

Simpele admin pagina op `/admin` (IP-restricted of apart admin JWT):

```
┌─────────────────────────────────────────────────────┐
│  ClawCommerce Admin Dashboard                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Active Users: 47    Active Machines: 38            │
│  Total Agents: 112   Messages Today: 2,340          │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │ Machine Health                               │    │
│  │  🟢 Running: 35  🟡 Sleeping: 8  🔴 Error: 2│    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  Recent Errors:                                     │
│  • user-abc123: OpenClaw crash (OOM) - 2 min ago    │
│  • user-def456: Shopify API 429 - 15 min ago        │
│                                                     │
│  Revenue: €2,115/maand (MRR)                        │
│  Infra Cost: €156/maand                             │
└─────────────────────────────────────────────────────┘
```

### Per-Instance Metrics

Wat we tracken (in PostgreSQL, simpel):

| Metric | Hoe | Frequentie |
|--------|-----|-----------|
| Machine status | Fly.io API poll | Elke 5 min |
| Uptime | Berekend uit status history | Realtime |
| Chat berichten | Teller in DB per user/maand | Per bericht |
| Errors | Gelogd bij SSE proxy failures | Per event |
| Response tijd | Gemeten in SignalR Hub | Per bericht |

### Alerting

MVP: simpele checks in een .NET Background Service:

```csharp
public class HealthCheckService : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var deployments = await _context.Deployments
                .Where(d => d.Status == "running")
                .ToListAsync();

            foreach (var d in deployments)
            {
                var healthy = await CheckMachineHealth(d.FlyMachineId);
                if (!healthy)
                {
                    _logger.LogError("Machine {Id} unhealthy", d.FlyMachineId);
                    // Restart poging
                    await RestartMachine(d.FlyMachineId);
                    // Alert (Discord webhook naar Wesley's server)
                    await SendDiscordAlert($"⚠️ Machine {d.FlyMachineId} restarted");
                }
            }

            await Task.Delay(TimeSpan.FromMinutes(5), ct);
        }
    }
}
```

**Alert kanalen:**
- Discord webhook naar een #alerts channel (Wesley's server)
- Later: email via SendGrid

### Logging

- **.NET API**: Serilog → stdout (Fly.io vangt dit op)
- **OpenClaw instances**: stdout logs via `fly logs -a clawcommerce-agents`
- **Structured logging**: JSON format voor doorzoekbaarheid
- **Retentie**: 7 dagen op Fly.io (gratis), daarna weg

---

## 11. MVP Scope

### Fase 1: Foundation (Week 1-2)

**Wat:**
- [ ] PostgreSQL + EF Core migratie (weg van in-memory)
- [ ] Fix React hooks crash bugs
- [ ] shadcn/ui installatie en component swap
- [ ] Database schema + migrations
- [ ] Seed 6 agent templates

**Resultaat:** Werkende app met echte database, geen crashes.

### Fase 2: Deployment Pipeline (Week 3-4)

**Wat:**
- [ ] Docker image bouwen voor OpenClaw
- [ ] Fly.io Machines API integratie in .NET
- [ ] DeploymentService: create/start/stop/delete machines
- [ ] Agent deploy flow: template → config → Fly.io machine
- [ ] Health check background service
- [ ] BYOK key opslag (encrypted)

**Resultaat:** Users kunnen agents deployen op echte OpenClaw instances.

### Fase 3: Chat Bridge (Week 5-6)

**Wat:**
- [ ] SignalR Hub → SSE proxy naar OpenClaw
- [ ] Token-by-token streaming naar frontend
- [ ] Chat history opslag in PostgreSQL
- [ ] Auto-start sleeping machines bij chat
- [ ] Error handling en reconnects

**Resultaat:** Echte chat met AI agents, streaming responses.

### Fase 4: Billing (Week 7-8)

**Wat:**
- [ ] Stripe integratie (Products, Prices, Checkout)
- [ ] Webhook handlers (subscription lifecycle)
- [ ] Usage tracking (berichten per maand)
- [ ] Limieten enforcement (agents, stores, berichten)
- [ ] Stripe Customer Portal link

**Resultaat:** Betalende klanten, subscription management.

### Fase 5: Onboarding & Polish (Week 9-10)

**Wat:**
- [ ] Onboarding wizard (template → store → key → chat)
- [ ] Shopify scope validatie
- [ ] AI key validatie
- [ ] Admin dashboard voor Wesley
- [ ] Error pages, loading states, edge cases

**Resultaat:** Klaar voor eerste beta users.

### Wat kan LATER:

- Shopify OAuth app (i.p.v. Custom App)
- Webhook integratie (real-time Shopify events)
- Custom agent builder (eigen SOUL.md editor)
- Multi-region deployment
- Team accounts
- API access voor developers
- Mobile app
- Migratie naar Hetzner/Coolify (bij 200+ users)

### Geschatte Timeline

```
Week 1-2:   Foundation (DB, UI fixes)
Week 3-4:   Deployment pipeline (Fly.io, Docker)
Week 5-6:   Chat bridge (SignalR → OpenClaw)
Week 7-8:   Billing (Stripe)
Week 9-10:  Onboarding + polish

Totaal: ~10 weken tot beta launch
```

---

## 12. Kosten Analyse

### Infra Kosten per User

**Fly.io Machine per user: shared-cpu-1x, 512MB RAM**

| Scenario | Prijs/maand per machine | Met auto-stop (geschat 70% slaaptijd) |
|----------|------------------------|---------------------------------------|
| 24/7 aan | $3.32 | $1.00 |

**Overige kosten (vast):**

| Component | Kosten/maand |
|-----------|-------------|
| .NET API (shared-cpu-2x, 2GB) | $11.83 |
| PostgreSQL (Fly.io, 1GB) | $5.92 |
| Vercel (frontend, gratis tier) | $0 |
| Cloudflare (gratis tier) | $0 |
| Stripe fee (2.9% + €0.25) | ~€1.10 per €29 transactie |
| Domein | ~€1/maand |
| **Vast totaal** | **~$19/maand** |

### Kosten bij Scale

| Users | Machine kosten (met auto-stop) | Vaste kosten | Totaal/maand |
|-------|-------------------------------|-------------|-------------|
| 10 | $10 | $19 | **~$29** |
| 50 | $50 | $19 | **~$69** |
| 100 | $100 | $30* | **~$130** |
| 500 | $500 | $50* | **~$550** |
| 1.000 | $1.000 | $80* | **~$1.080** |

*\* Grotere API machine en DB bij meer users*

### Revenue bij Scale

| Users | Tier mix (70% Starter, 20% Pro, 10% Business) | MRR |
|-------|-----------------------------------------------|-----|
| 10 | 7×€29 + 2×€49 + 1×€99 | **€400** |
| 50 | 35×€29 + 10×€49 + 5×€99 | **€2.000** |
| 100 | 70×€29 + 20×€49 + 10×€99 | **€4.000** |
| 500 | 350×€29 + 100×€49 + 50×€99 | **€19.950** |
| 1.000 | 700×€29 + 200×€49 + 100×€99 | **€39.900** |

### Break-Even Analyse

```
Vaste kosten: ~€18/maand (≈$19)
Variabele kost per user: ~€0.93/maand (≈$1 met auto-stop)

Stripe fee per user (gemiddeld €37 ARPU): €1.32 (2.9% + €0.25)

Kosten per user: €0.93 + €1.32 = €2.25/maand
Revenue per user (gemiddeld): €37/maand

MARGE PER USER: €34.75 (94%)

Break-even (vaste kosten dekken): 1 betalende user
Echt break-even (inclusief Wesley's tijd): afhankelijk van uren investering
```

### Vergelijking: Fly.io vs Hetzner bij Scale

| Users | Fly.io (auto-stop) | Hetzner Dedicated (4x AX42) |
|-------|-------------------|----------------------------|
| 100 | ~$130/maand | ~€176/maand |
| 500 | ~$550/maand | ~€176/maand |
| 1.000 | ~$1.080/maand | ~€356/maand |

**Migratiepunt:** rond 200 users wordt Hetzner significant goedkoper. Bij die schaal is het de engineering investering waard om naar Coolify + Hetzner Dedicated te migreren.

### AI API Kosten (door user betaald, niet door ClawCommerce)

Belangrijk: BYOK model betekent dat AI API kosten voor rekening van de user zijn. ClawCommerce betaalt GEEN AI tokens. Dit is het hele punt van BYOK — de marges zijn puur infra + platform fee.

Geschatte AI kosten per user (voor hun eigen rekening):
- Casual gebruik (100 berichten/maand): ~$2-5/maand
- Actief gebruik (1000 berichten/maand): ~$15-30/maand
- Heavy gebruik (5000 berichten/maand): ~$50-100/maand

---

## Appendix A: Fly.io API Quick Reference

```bash
# Machine aanmaken
curl -X POST "https://api.machines.dev/v1/apps/{app}/machines" \
  -H "Authorization: Bearer ${FLY_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{ "name": "agent-xxx", "region": "ams", "config": {...} }'

# Machine starten
curl -X POST "https://api.machines.dev/v1/apps/{app}/machines/{id}/start" \
  -H "Authorization: Bearer ${FLY_API_TOKEN}"

# Machine stoppen
curl -X POST "https://api.machines.dev/v1/apps/{app}/machines/{id}/stop" \
  -H "Authorization: Bearer ${FLY_API_TOKEN}"

# Machine verwijderen
curl -X DELETE "https://api.machines.dev/v1/apps/{app}/machines/{id}" \
  -H "Authorization: Bearer ${FLY_API_TOKEN}"

# Machine status
curl "https://api.machines.dev/v1/apps/{app}/machines/{id}" \
  -H "Authorization: Bearer ${FLY_API_TOKEN}"

# Alle machines
curl "https://api.machines.dev/v1/apps/{app}/machines" \
  -H "Authorization: Bearer ${FLY_API_TOKEN}"
```

## Appendix B: OpenClaw Config Template

```json5
// Volledige config die per user gegenereerd wordt
{
  gateway: {
    port: 8080,
    bind: "lan",
    auth: {
      mode: "token",
      token: "{GENERATED_TOKEN}"
    },
    http: {
      endpoints: {
        chatCompletions: { enabled: true },
        responses: { enabled: false },
        toolsInvoke: { enabled: false }
      }
    },
    controlUi: { enabled: false }  // Users hoeven geen control UI
  },
  agents: {
    defaults: {
      model: {
        primary: "anthropic/claude-sonnet-4-5"
      },
      sandbox: { mode: "off" },
      tools: {
        exec: { policy: "deny" },
        browser: { enabled: false },
        web_fetch: { enabled: true },
        web_search: { enabled: true },
        read: { policy: "workspace" },
        write: { policy: "workspace" }
      }
    },
    list: [
      // Dynamisch gevuld per user's agents
      {
        id: "{agent-id}",
        workspace: "/home/openclaw/.openclaw/agents/{agent-id}/workspace"
      }
    ]
  },
  session: {
    dmScope: "per-channel-peer",
    reset: {
      mode: "manual"  // Users bepalen zelf wanneer ze een nieuwe sessie willen
    }
  }
}
```

---

*Dit document is de master architectuur referentie voor ClawCommerce. Alle implementatie beslissingen worden hierop gebaseerd. Bij twijfel: dit document is leidend.*
