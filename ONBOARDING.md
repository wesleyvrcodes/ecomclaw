# Onboarding Flow — EcomClaw

## Principe
De agent keuze stuurt alles. De agent bepaalt welke scopes nodig zijn, welke store-instructies getoond worden, en welke configuratie gevraagd wordt. Niet andersom.

## Flow

### Stap 1: Kies je Agent
**Pagina**: Full-screen wizard (geen sidebar, geen dashboard afleiding)

User ziet een grid van 3-4 populairste agent templates:
- Product Research Agent
- Listing Optimizer  
- Competitor Monitor
- Customer Service Agent

Elke card toont:
- Icoon + naam
- Eén zin wat het doet
- "Most popular" badge op de top pick

User klikt een agent → korte configuratie:
- **Naam** (pre-filled: "Product Research Agent — [Store Name]")
- **Focus** (dropdown: Fashion, Electronics, Home, Beauty, etc.)
- **Schedule** (Daily / 2x per week / Manual only)

**Geen overkill.** 3 velden max. Advanced settings komen later in het dashboard.

---

### Stap 2: Connect Store
**Wat er gebeurt**: Op basis van de gekozen agent tonen we exact welke Shopify scopes nodig zijn.

**Per agent → scopes mapping:**
| Agent | Scopes nodig |
|-------|-------------|
| Product Research | `read_products`, `read_analytics` |
| Listing Optimizer | `read_products`, `write_products`, `read_themes` |
| Competitor Monitor | `read_products` |
| Customer Service | `read_orders`, `read_customers`, `read_products` |
| Ad Copy Generator | `read_products`, `read_analytics` |
| Daily Reporter | `read_orders`, `read_products`, `read_analytics` |
| Review Responder | `read_products` |
| Inventory Tracker | `read_inventory`, `read_products` |

**UI toont:**
```
Deze agent heeft toegang nodig tot:
✓ Producten (lezen)
✓ Orders (lezen)

Volg deze stappen om je store te koppelen:
```

**Instructies (met screenshots/GIFs):**
1. Ga naar je Shopify Admin → Settings → Apps → Develop apps
2. Klik "Create an app" → noem het "EcomClaw"
3. Klik "Configure Admin API scopes"
4. Vink aan: [exacte scopes voor deze agent, met screenshots]
5. Klik "Install app"
6. Ga naar "API credentials" → kopieer **Client ID** en **Client Secret**

**Invoervelden:**
- Store URL: `your-store.myshopify.com`
- Client ID: `paste here`
- Client Secret: `paste here`

**Validatie**: Na invullen → backend probeert een test API call. 
- ✅ Groen: "Connected! We kunnen 847 producten zien."
- ❌ Rood: "Connectie mislukt. Check of je de juiste scopes hebt aangevinkt."

**Als user al een store heeft** (tweede+ agent): 
- Store is pre-filled
- Check of bestaande scopes voldoende zijn
- Ja → skip deze stap helemaal
- Nee → "Je huidige connectie mist [scope]. Update je app scopes:" + instructie

---

### Stap 3: AI API Key
**Als user al een key heeft**: Skip deze stap.

**Anders:**
```
Welke AI provider wil je gebruiken?

[Anthropic (aanbevolen)]  [OpenAI]
```

Per provider:
- Link naar hun dashboard
- "Maak een account → ga naar API Keys → maak een nieuwe key → kopieer"
- Screenshot van exact waar de key staat
- Invoerveld met validatie (test call naar API)

**Validatie:**
- ✅ "API key werkt! Je hebt $12.50 tegoed."
- ❌ "Ongeldige key. Check of je hem goed hebt gekopieerd."

---

### Stap 4: Done → Chat
**Geen "klaar" pagina met confetti.** Direct naar de chat.

Agent stuurt automatisch een eerste bericht:
```
Hey! 👋 Ik ben je Product Research Agent en ik heb 
toegang tot [Store Name] (847 producten).

Ik kan:
• Trending producten vinden in jouw niche
• Competitor prijzen analyseren  
• Google Trends data ophalen

Waar wil je beginnen?
```

User is nu in actie. Niet op een leeg dashboard. Niet op een success screen. In een gesprek met hun agent.

---

## Tweede+ Agent Deploy
Wanneer user al een store + API key heeft:

1. **Kies agent** (zelfde grid, maar nu in het dashboard via Agent Store)
2. **Check scopes** — backend vergelijkt benodigde scopes met bestaande connectie
   - Alles aanwezig → skip store stap, direct deploy
   - Scopes missen → "Update je app in Shopify met deze extra scopes: [lijst]"
3. **AI key** → al aanwezig, skip
4. **→ Chat**

Resultaat: tweede agent is **one-click deploy** als scopes al kloppen.

---

## Technische Implementatie

### Frontend
- Wizard component: `app/(onboarding)/page.tsx`
- Stappen state machine (stap 1 → 2 → 3 → 4)
- Progress bar bovenaan (4 dots)
- Full-screen layout (geen sidebar)
- Na onboarding: redirect naar `/dashboard/chat/[agentId]`

### Backend endpoints nodig
- `POST /api/stores/validate` — test Shopify connectie met Client ID/Secret, return product count
- `POST /api/settings/validate-key` — test AI API key, return balance/status
- `GET /api/templates/{id}/scopes` — return benodigde scopes voor een template
- `GET /api/stores/{id}/scopes` — return huidige scopes van een store connectie
- `POST /api/onboarding/complete` — atomic: create store + save key + deploy agent in één call

### Scope checking
Backend slaat op welke scopes een store connectie heeft. Bij nieuwe agent deploy:
```
requiredScopes = template.requiredScopes
existingScopes = store.grantedScopes  
missingScopes = requiredScopes - existingScopes

if missingScopes.empty → auto-deploy
else → toon "update je scopes" instructie
```

### Agent templates in DB/config
Elke template bevat:
```json
{
  "id": "product-research",
  "name": "Product Research Agent",
  "description": "Finds trending products...",
  "category": "Research",
  "icon": "TrendingUp",
  "requiredScopes": ["read_products", "read_analytics"],
  "configFields": [
    { "name": "focus", "label": "Niche", "type": "select", "options": ["Fashion", "Electronics", "Home"] },
    { "name": "schedule", "label": "Schedule", "type": "select", "options": ["Daily", "2x per week", "Manual"] }
  ],
  "firstMessage": "Hey! 👋 Ik ben je Product Research Agent..."
}
```
