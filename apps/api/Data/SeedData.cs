using ClawCommerce.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace ClawCommerce.Api.Data;

public static class SeedData
{
    public static List<AgentTemplate> GetTemplates() =>
    [
        new()
        {
            Id = "product-lister",
            Name = "Google Product Lister",
            Description = "Imports products from your Google Sheet and creates optimized Shopify listings for Google Shopping. Titles, descriptions, pricing, variants, and images — all Google Merchant Center compliant.",
            Category = "Google",
            Icon = "ListChecks",
            SortOrder = 1,
            RequiredScopes = ["read_products", "write_products", "read_product_listings", "write_product_listings", "read_inventory", "write_inventory", "read_locations"],
            ConfigFields = [],
            SoulMd = @"You are a Google Shopping Product Lister. Your job is to read product data from the user's Google Sheet and create Shopify product listings optimized for Google Shopping.

The Google Sheet must be set to 'Anyone with the link can view'. You read it via CSV export.

For each product you:
1. Read the row data from the Google Sheet (name, supplier price, images, specs, variants)
2. Write a title following the user's title instructions (default: keyword-first, max 150 chars, include brand + color + size + material)
3. Write a description following the user's description instructions (default: benefit-focused, scannable, keyword-rich)
4. Calculate the selling price: supplier_price × (1 + markup_percentage / 100)
5. Map variants (size, color) to Shopify variant options with correct pricing
6. Add tags following the user's tag instructions + Google product taxonomy categories
7. Set images from the sheet URLs, with descriptive alt texts
8. Set the product status to the configured publish status (draft or active)
9. Fill Google Merchant Center metafields where data is available (GTIN, MPN, condition)

Limits:
- Process a maximum of {listingsPerDay} products per run
- Skip products already in Shopify (match by title or SKU)

Rules:
- NEVER invent specs, features, or details not in the source data
- ALWAYS follow the user's title, description, and tag instructions exactly
- Flag products with missing critical data (no images, no price) — don't guess
- Set inventory tracking to true, stock quantity from sheet column or 0 if not available
- Write all copy in the user's configured language
- If a column mapping is unclear, ask the user instead of assuming",
            Tools = ["read_products", "write_products", "read_product_listings", "write_product_listings", "read_inventory", "write_inventory", "google_sheets_read"],
            TaskDefinitions =
            [
                new() { Id = "import_new", Name = "Import New Products", Description = "Read sheet and create listings for new products not yet in Shopify", Trigger = "daily", PromptTemplate = "Read the Google Sheet (CSV export) and compare with existing Shopify products by title/SKU. For each new product (up to {listingsPerDay} per run), create a Shopify listing following the configured title/description/tag instructions. Set status to {productStatus}. Apply {defaultMarkup}% markup on supplier price. Report: how many created, how many skipped (already exists), how many failed (missing data)." },
                new() { Id = "list_product", Name = "List Single Product", Description = "Create a listing for a specific product from the sheet", Trigger = "on_request", PromptTemplate = "Find the specified product in the Google Sheet and create a Shopify listing. Follow the configured title/description/tag instructions. Set status to {productStatus}. Apply {defaultMarkup}% markup. Report what was created with all details." }
            ],
            DefaultConfig = new Dictionary<string, string>
            {
                ["language"] = "en",
                ["tone"] = "professional",
                ["default_markup"] = "100",
                ["listings_per_day"] = "25",
                ["product_status"] = "draft",
                ["auto_import"] = "true"
            }
        },
        new()
        {
            Id = "meta-product-lister",
            Name = "Meta Product Lister",
            Description = "Imports products from your Google Sheet and creates scroll-stopping Shopify listings optimized for Facebook & Instagram Shop. Social-ready copy and lifestyle descriptions.",
            Category = "Meta",
            Icon = "ListChecks",
            SortOrder = 2,
            RequiredScopes = ["read_products", "write_products", "read_product_listings", "write_product_listings", "read_inventory", "write_inventory", "read_locations"],
            ConfigFields = [],
            SoulMd = @"You are a Meta Commerce Product Lister. Your job is to read product data from the user's Google Sheet and create Shopify listings optimized for Facebook Shop and Instagram Shopping.

The Google Sheet must be set to 'Anyone with the link can view'. You read it via CSV export.

For each product you:
1. Read the row data from the Google Sheet (name, supplier price, images, specs, variants)
2. Write a scroll-stopping title following the user's title instructions (default: max 65 chars, benefit-first, conversational)
3. Write a lifestyle description following the user's description instructions (default: social-media tone, relatable, emotional)
4. Calculate the selling price: supplier_price × (1 + markup_percentage / 100)
5. Map variants (size, color) to Shopify variant options
6. Add tags following the user's tag instructions + lifestyle/trend/occasion tags
7. Set images from sheet URLs (prioritize lifestyle/in-use photos if multiple available)
8. Set the product status to the configured publish status (draft or active)

Limits:
- Process a maximum of {listingsPerDay} products per run
- Skip products already in Shopify (match by title or SKU)

Rules:
- NEVER invent specs, features, or details not in the source data
- ALWAYS follow the user's title, description, and tag instructions exactly
- Titles should feel like something you'd stop scrolling for
- Descriptions should read like a friend recommending the product
- Flag products with missing critical data — don't guess
- Set inventory tracking to true, stock from sheet or 0
- Write all copy in the user's configured language",
            Tools = ["read_products", "write_products", "read_product_listings", "write_product_listings", "read_inventory", "write_inventory", "google_sheets_read"],
            TaskDefinitions =
            [
                new() { Id = "import_new", Name = "Import New Products", Description = "Read sheet and create listings for new products not yet in Shopify", Trigger = "daily", PromptTemplate = "Read the Google Sheet (CSV export) and compare with existing Shopify products by title/SKU. For each new product (up to {listingsPerDay} per run), create a Shopify listing following the configured title/description/tag instructions. Set status to {productStatus}. Apply {defaultMarkup}% markup. Report: created, skipped, failed." },
                new() { Id = "list_product", Name = "List Single Product", Description = "Create a listing for a specific product from the sheet", Trigger = "on_request", PromptTemplate = "Find the specified product in the Google Sheet and create a Shopify listing for Facebook & Instagram Shop. Follow configured instructions. Set status to {productStatus}. Apply {defaultMarkup}% markup." }
            ],
            DefaultConfig = new Dictionary<string, string>
            {
                ["language"] = "en",
                ["tone"] = "casual",
                ["default_markup"] = "100",
                ["listings_per_day"] = "25",
                ["product_status"] = "draft",
                ["auto_import"] = "true"
            }
        },
        new()
        {
            Id = "daily-reporter",
            Name = "Daily Reporter",
            Description = "Generates daily business intelligence reports with revenue trends, top sellers, stockout risks, and actionable insights.",
            Category = "Analytics",
            Icon = "BarChart3",
            SortOrder = 2,
            RequiredScopes = ["read_products", "read_orders", "read_inventory", "read_analytics", "read_reports", "read_locations"],
            ConfigFields = [],
            SoulMd = "You are a Daily Business Intelligence analyst. You generate concise, actionable reports about store performance. You focus on metrics that matter: revenue trends, order volume, AOV, top sellers, stockout risks, and ad performance. Every insight must include a recommended action. Use tables for data, keep commentary brief. Flag anomalies with severity (critical/warning/info).",
            Tools = ["read_products", "read_orders", "read_inventory", "read_analytics", "read_reports", "read_locations"],
            TaskDefinitions =
            [
                new() { Id = "morning_briefing", Name = "Morning Briefing", Description = "Generate daily performance report", Trigger = "daily", PromptTemplate = "Generate a morning briefing covering yesterday's revenue, order count, AOV, top 5 sellers, and any anomalies. Include recommended actions." },
                new() { Id = "weekly_summary", Name = "Weekly Summary", Description = "Weekly trends and insights", Trigger = "on_request", PromptTemplate = "Generate a weekly summary comparing this week to last week. Cover revenue trends, customer acquisition, and inventory health." },
                new() { Id = "stockout_alert", Name = "Stockout Alert", Description = "Check inventory levels", Trigger = "hourly", PromptTemplate = "Check all product inventory levels. Alert on any products that will stock out within the configured threshold days based on current sales velocity." },
                new() { Id = "anomaly_detection", Name = "Anomaly Detection", Description = "Flag unusual metrics", Trigger = "daily", PromptTemplate = "Analyze today's metrics and flag any anomalies: unusual order volume, revenue spikes/drops, sudden traffic changes, or abnormal return rates." }
            ],
            DefaultConfig = new Dictionary<string, string>
            {
                ["language"] = "en",
                ["report_time"] = "09:00",
                ["include_revenue"] = "true",
                ["include_inventory"] = "true",
                ["include_ads"] = "true",
                ["alert_threshold_days"] = "7"
            }
        },
        new()
        {
            Id = "google-ads",
            Name = "Google Ads Optimizer",
            Description = "Analyzes your catalog to generate ad campaigns, write optimized ad copy, suggest keywords, and maximize ROAS.",
            Category = "Marketing",
            Icon = "Megaphone",
            SortOrder = 3,
            RequiredScopes = ["read_products", "read_orders", "read_analytics", "read_marketing_events", "write_marketing_events"],
            ConfigFields = [],
            SoulMd = "You are a Google Ads specialist for e-commerce. You analyze product catalogs to identify ad-worthy products, generate campaign structures, write ad copy (headlines max 30 chars, descriptions max 90 chars), and suggest keyword strategies. You focus on ROAS optimization. You recommend bid adjustments based on performance data. You always structure campaigns by product category and margin tier.",
            Tools = ["read_products", "read_orders", "read_analytics", "read_marketing_events", "write_marketing_events"],
            TaskDefinitions =
            [
                new() { Id = "campaign_audit", Name = "Campaign Audit", Description = "Review active campaign performance", Trigger = "daily", PromptTemplate = "Review all active campaigns. Identify underperforming ads, wasted spend, and opportunities. Recommend bid adjustments and pauses." },
                new() { Id = "generate_copy", Name = "Generate Ad Copy", Description = "Create ad copy for products", Trigger = "on_request", PromptTemplate = "Generate Google Ads copy for the specified products. Create 3 headline variations (max 30 chars each) and 2 description variations (max 90 chars each)." },
                new() { Id = "keyword_research", Name = "Keyword Research", Description = "Suggest keywords for campaigns", Trigger = "on_request", PromptTemplate = "Research and suggest keywords for the given product category. Include search volume estimates, competition level, and suggested bid ranges." },
                new() { Id = "feed_optimization", Name = "Feed Optimization", Description = "Optimize product feed for Shopping ads", Trigger = "daily", PromptTemplate = "Analyze the product feed and identify listings with poor titles, missing GTINs, or incomplete attributes that hurt Shopping ad performance." }
            ],
            DefaultConfig = new Dictionary<string, string>
            {
                ["language"] = "en",
                ["target_roas"] = "3.0",
                ["max_headline_chars"] = "30",
                ["max_description_chars"] = "90",
                ["auto_negative_keywords"] = "true",
                ["focus_top_margin"] = "true"
            }
        },
        new()
        {
            Id = "customer-service",
            Name = "Customer Service",
            Description = "Handles customer inquiries, tracks orders, processes returns, and escalates issues. Your 24/7 support agent.",
            Category = "Support",
            Icon = "Headphones",
            SortOrder = 4,
            RequiredScopes = ["read_orders", "write_orders", "read_customers", "write_customers", "read_products", "read_fulfillments", "write_fulfillments", "read_draft_orders", "write_draft_orders"],
            ConfigFields = [],
            SoulMd = "You are a Customer Service specialist. You handle customer inquiries professionally and efficiently. You can look up orders, track shipments, process returns, and answer product questions. You always verify order details before responding. You escalate to the store owner when: refund exceeds threshold, customer is angry after 2 exchanges, or issue requires policy exception. You respond in the customer's language when possible.",
            Tools = ["read_orders", "write_orders", "read_customers", "write_customers", "read_products", "read_fulfillments", "write_fulfillments", "read_draft_orders", "write_draft_orders"],
            TaskDefinitions =
            [
                new() { Id = "ticket_triage", Name = "Ticket Triage", Description = "Prioritize incoming tickets", Trigger = "hourly", PromptTemplate = "Review all incoming support tickets. Categorize by urgency (critical/high/medium/low) and type (order issue, return, product question, complaint). Assign priority scores." },
                new() { Id = "draft_response", Name = "Draft Response", Description = "Generate response to customer", Trigger = "on_request", PromptTemplate = "Draft a professional response to the customer inquiry. Verify order details first. Include relevant tracking info or resolution steps." },
                new() { Id = "process_return", Name = "Process Return", Description = "Handle return request", Trigger = "on_request", PromptTemplate = "Process the return request. Verify eligibility against return policy, check order details, and generate return instructions or escalate if above threshold." },
                new() { Id = "order_status", Name = "Order Status", Description = "Look up order details", Trigger = "on_request", PromptTemplate = "Look up the order by ID or customer email. Provide current status, tracking information, and estimated delivery date." }
            ],
            DefaultConfig = new Dictionary<string, string>
            {
                ["language"] = "en",
                ["tone"] = "professional",
                ["auto_escalate"] = "true",
                ["refund_threshold"] = "50",
                ["max_response_time_hours"] = "4",
                ["greeting_style"] = "friendly"
            }
        },
        new()
        {
            Id = "supply-chain",
            Name = "Supply Chain Manager",
            Description = "Monitors stock levels, predicts stockouts, calculates reorder quantities, and drafts purchase orders automatically.",
            Category = "Operations",
            Icon = "Truck",
            SortOrder = 5,
            RequiredScopes = ["read_products", "read_inventory", "write_inventory", "read_orders", "read_locations", "read_fulfillments"],
            ConfigFields = [],
            SoulMd = "You are a Supply Chain and Inventory specialist. You monitor stock levels, predict stockouts using sales velocity, calculate optimal reorder quantities (EOQ), and track supplier lead times. You proactively alert when products need reordering. You consider seasonality and trends. You generate purchase order drafts with quantities and suggested suppliers.",
            Tools = ["read_products", "read_inventory", "write_inventory", "read_orders", "read_locations", "read_fulfillments"],
            TaskDefinitions =
            [
                new() { Id = "inventory_check", Name = "Inventory Check", Description = "Scan for low stock and stockout risks", Trigger = "hourly", PromptTemplate = "Scan all inventory levels. Identify products below safety stock threshold. Calculate days until stockout based on sales velocity. Flag critical items." },
                new() { Id = "reorder_alert", Name = "Reorder Alert", Description = "Generate reorder recommendations", Trigger = "daily", PromptTemplate = "Generate reorder recommendations for products approaching reorder point. Include suggested quantities (EOQ), estimated cost, and supplier info." },
                new() { Id = "demand_forecast", Name = "Demand Forecast", Description = "Predict demand based on sales velocity", Trigger = "daily", PromptTemplate = "Analyze sales trends and predict demand for the next 30 days. Factor in seasonality, day-of-week patterns, and recent trend changes." },
                new() { Id = "po_draft", Name = "Purchase Order Draft", Description = "Draft purchase order", Trigger = "on_request", PromptTemplate = "Draft a purchase order for the specified products. Include quantities, unit costs, supplier details, and expected delivery dates." }
            ],
            DefaultConfig = new Dictionary<string, string>
            {
                ["language"] = "en",
                ["safety_stock_days"] = "7",
                ["reorder_point_days"] = "14",
                ["alert_critical_days"] = "3",
                ["include_seasonality"] = "true",
                ["auto_po_draft"] = "true"
            }
        }
    ];

    public static async Task InitializeAsync(ClawCommerceDbContext context)
    {
        // Ensure database is created
        await context.Database.EnsureCreatedAsync();

        // Add missing columns (safe to run multiple times)
        try
        {
            await context.Database.ExecuteSqlRawAsync(@"
                ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""PlanExpiresAt"" timestamp;
                ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""StripeCustomerId"" text;
                ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""StripeSubscriptionId"" text;
                ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""Plan"" text DEFAULT 'none';
                ALTER TABLE ""Agents"" ADD COLUMN IF NOT EXISTS ""Language"" text DEFAULT 'en';
                ALTER TABLE ""Agents"" ADD COLUMN IF NOT EXISTS ""ToneOfVoice"" text DEFAULT 'professional';
                ALTER TABLE ""Agents"" ADD COLUMN IF NOT EXISTS ""CustomRules"" text[];
                ALTER TABLE ""Agents"" ADD COLUMN IF NOT EXISTS ""ContextCache"" text DEFAULT '';
                ALTER TABLE ""Agents"" ADD COLUMN IF NOT EXISTS ""ContextCacheUpdatedAt"" timestamp;
                ALTER TABLE ""Agents"" ADD COLUMN IF NOT EXISTS ""Schedule"" text DEFAULT 'daily';
                ALTER TABLE ""UserSettings"" ADD COLUMN IF NOT EXISTS ""OpenRouterApiKey"" text DEFAULT '';
                ALTER TABLE ""AgentTemplates"" ADD COLUMN IF NOT EXISTS ""SoulMd"" text DEFAULT '';
                ALTER TABLE ""AgentTemplates"" ADD COLUMN IF NOT EXISTS ""Tools"" text[];
                ALTER TABLE ""AgentTemplates"" ADD COLUMN IF NOT EXISTS ""TaskDefinitions"" jsonb;
                ALTER TABLE ""AgentTemplates"" ADD COLUMN IF NOT EXISTS ""DefaultConfig"" jsonb;
                ALTER TABLE ""AgentTemplates"" ADD COLUMN IF NOT EXISTS ""RequiredScopes"" text[];
            ");
        }
        catch { /* Columns may already exist */ }

        // Ensure Deployments table has all columns (table may predate newer model fields)
        try
        {
            await context.Database.ExecuteSqlRawAsync(@"
                CREATE TABLE IF NOT EXISTS ""Deployments"" (
                    ""Id"" text NOT NULL PRIMARY KEY,
                    ""UserId"" text NOT NULL,
                    ""AgentId"" text NOT NULL,
                    ""ServerId"" bigint NOT NULL DEFAULT 0,
                    ""ServerIp"" text NOT NULL DEFAULT '',
                    ""ServerName"" text NOT NULL DEFAULT '',
                    ""TunnelId"" text NOT NULL DEFAULT '',
                    ""TunnelUrl"" text NOT NULL DEFAULT '',
                    ""Status"" integer NOT NULL DEFAULT 0,
                    ""Region"" text NOT NULL DEFAULT 'nbg1',
                    ""GatewayToken"" text NOT NULL DEFAULT '',
                    ""GatewayPort"" integer NOT NULL DEFAULT 8080,
                    ""CreatedAt"" timestamp NOT NULL DEFAULT now(),
                    ""StoppedAt"" timestamp,
                    ""LastHealthCheck"" timestamp,
                    ""ErrorMessage"" text
                );
                ALTER TABLE ""Deployments"" ADD COLUMN IF NOT EXISTS ""ServerId"" bigint NOT NULL DEFAULT 0;
                ALTER TABLE ""Deployments"" ADD COLUMN IF NOT EXISTS ""ServerIp"" text NOT NULL DEFAULT '';
                ALTER TABLE ""Deployments"" ADD COLUMN IF NOT EXISTS ""ServerName"" text NOT NULL DEFAULT '';
                ALTER TABLE ""Deployments"" ADD COLUMN IF NOT EXISTS ""TunnelId"" text NOT NULL DEFAULT '';
                ALTER TABLE ""Deployments"" ADD COLUMN IF NOT EXISTS ""TunnelUrl"" text NOT NULL DEFAULT '';
                ALTER TABLE ""Deployments"" ADD COLUMN IF NOT EXISTS ""Region"" text NOT NULL DEFAULT 'nbg1';
                ALTER TABLE ""Deployments"" ADD COLUMN IF NOT EXISTS ""GatewayToken"" text NOT NULL DEFAULT '';
                ALTER TABLE ""Deployments"" ADD COLUMN IF NOT EXISTS ""GatewayPort"" integer NOT NULL DEFAULT 8080;
                ALTER TABLE ""Deployments"" ADD COLUMN IF NOT EXISTS ""StoppedAt"" timestamp;
                ALTER TABLE ""Deployments"" ADD COLUMN IF NOT EXISTS ""LastHealthCheck"" timestamp;
                ALTER TABLE ""Deployments"" ADD COLUMN IF NOT EXISTS ""ErrorMessage"" text;
            ");
        }
        catch { /* Columns may already exist */ }

        // Ensure RefreshTokens table exists
        try
        {
            await context.Database.ExecuteSqlRawAsync(@"
                CREATE TABLE IF NOT EXISTS ""RefreshTokens"" (
                    ""Id"" text NOT NULL PRIMARY KEY,
                    ""UserId"" text NOT NULL,
                    ""Token"" text NOT NULL,
                    ""ExpiresAt"" timestamp NOT NULL,
                    ""CreatedAt"" timestamp NOT NULL DEFAULT now(),
                    ""IsRevoked"" boolean NOT NULL DEFAULT false,
                    ""ReplacedByTokenId"" text,
                    ""RevokedReason"" text
                );
                CREATE UNIQUE INDEX IF NOT EXISTS ""IX_RefreshTokens_Token"" ON ""RefreshTokens"" (""Token"");
                CREATE INDEX IF NOT EXISTS ""IX_RefreshTokens_UserId"" ON ""RefreshTokens"" (""UserId"");
            ");
        }
        catch { /* Table may already exist */ }

        // Ensure AuditLogs table exists
        try
        {
            await context.Database.ExecuteSqlRawAsync(@"
                CREATE TABLE IF NOT EXISTS ""AuditLogs"" (
                    ""Id"" text NOT NULL PRIMARY KEY,
                    ""UserId"" text,
                    ""Action"" text NOT NULL,
                    ""EntityType"" text NOT NULL,
                    ""EntityId"" text,
                    ""Details"" text,
                    ""IpAddress"" text,
                    ""UserAgent"" text,
                    ""Timestamp"" timestamp NOT NULL DEFAULT now()
                );
                CREATE INDEX IF NOT EXISTS ""IX_AuditLogs_UserId"" ON ""AuditLogs"" (""UserId"");
                CREATE INDEX IF NOT EXISTS ""IX_AuditLogs_Timestamp"" ON ""AuditLogs"" (""Timestamp"");
            ");
        }
        catch { /* Table may already exist */ }

        // Ensure ApiUsages table exists
        try
        {
            await context.Database.ExecuteSqlRawAsync(@"
                CREATE TABLE IF NOT EXISTS ""ApiUsages"" (
                    ""Id"" text NOT NULL PRIMARY KEY,
                    ""UserId"" text NOT NULL,
                    ""AgentId"" text NOT NULL,
                    ""Model"" text NOT NULL DEFAULT '',
                    ""Period"" text NOT NULL,
                    ""InputTokens"" integer NOT NULL DEFAULT 0,
                    ""OutputTokens"" integer NOT NULL DEFAULT 0,
                    ""RequestCount"" integer NOT NULL DEFAULT 0,
                    ""EstimatedCostCents"" integer NOT NULL DEFAULT 0,
                    ""LastUpdated"" timestamp NOT NULL DEFAULT now()
                );
                ALTER TABLE ""ApiUsages"" ADD COLUMN IF NOT EXISTS ""Model"" text NOT NULL DEFAULT '';
                CREATE INDEX IF NOT EXISTS ""IX_ApiUsages_UserId_Period"" ON ""ApiUsages"" (""UserId"", ""Period"");
                DROP INDEX IF EXISTS ""IX_ApiUsages_UserId_AgentId_Period"";
                CREATE UNIQUE INDEX IF NOT EXISTS ""IX_ApiUsages_UserId_AgentId_Period_Model"" ON ""ApiUsages"" (""UserId"", ""AgentId"", ""Period"", ""Model"");
            ");
        }
        catch { /* Table may already exist */ }

        // Upsert templates: only insert/update seed templates, don't wipe custom ones
        var seedTemplates = GetTemplates();
        var seedIds = seedTemplates.Select(t => t.Id).ToList();
        var existingIds = await context.AgentTemplates
            .Where(t => seedIds.Contains(t.Id))
            .Select(t => t.Id)
            .ToListAsync();

        // Remove only seed templates (to refresh them), leave custom templates untouched
        if (existingIds.Count > 0)
        {
            var toRemove = await context.AgentTemplates
                .Where(t => existingIds.Contains(t.Id))
                .ToListAsync();
            context.AgentTemplates.RemoveRange(toRemove);
            await context.SaveChangesAsync();
        }

        context.AgentTemplates.AddRange(seedTemplates);
        await context.SaveChangesAsync();
    }
}
