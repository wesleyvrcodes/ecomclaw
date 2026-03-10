using ClawCommerce.Api.Data;
using ClawCommerce.Api.Models;
using Microsoft.EntityFrameworkCore;
using Stripe;
using Stripe.Checkout;

namespace ClawCommerce.Api.Services;

public class BillingService
{
    private readonly ClawCommerceDbContext _context;
    private readonly IConfiguration _config;
    private readonly ILogger<BillingService> _logger;
    private readonly bool _isConfigured;

    public BillingService(ClawCommerceDbContext context, IConfiguration config, ILogger<BillingService> logger)
    {
        _context = context;
        _config = config;
        _logger = logger;

        var secretKey = _config["Stripe:SecretKey"];
        _isConfigured = !string.IsNullOrWhiteSpace(secretKey) && !secretKey.StartsWith("sk_test_PLACEHOLDER");

        if (_isConfigured)
            StripeConfiguration.ApiKey = secretKey;
    }

    public bool IsConfigured => _isConfigured;

    public async Task<string> CreateCustomer(string userId, string email, string name)
    {
        if (!_isConfigured) throw new InvalidOperationException("Billing not configured");

        var service = new CustomerService();
        var customer = await service.CreateAsync(new CustomerCreateOptions
        {
            Email = email,
            Name = name,
            Metadata = new Dictionary<string, string> { { "userId", userId } }
        });

        var user = await _context.Users.FindAsync(userId);
        if (user != null)
        {
            user.StripeCustomerId = customer.Id;
            await _context.SaveChangesAsync();
        }

        return customer.Id;
    }

    public async Task<string> CreateCheckoutSession(string userId, string priceId)
    {
        if (!_isConfigured) throw new InvalidOperationException("Billing not configured");

        var user = await _context.Users.FindAsync(userId)
            ?? throw new InvalidOperationException("User not found");

        // Ensure Stripe customer exists
        if (string.IsNullOrEmpty(user.StripeCustomerId))
        {
            user.StripeCustomerId = await CreateCustomer(userId, user.Email, user.Name);
        }

        var frontendUrl = _config["Frontend:Url"] ?? "http://localhost:3000";
        var service = new SessionService();
        var session = await service.CreateAsync(new SessionCreateOptions
        {
            Customer = user.StripeCustomerId,
            Mode = "subscription",
            LineItems = new List<SessionLineItemOptions>
            {
                new() { Price = priceId, Quantity = 1 }
            },
            SuccessUrl = $"{frontendUrl}/dashboard/settings?billing=success",
            CancelUrl = $"{frontendUrl}/dashboard/settings?billing=cancelled",
            Metadata = new Dictionary<string, string> { { "userId", userId } }
        });

        return session.Url;
    }

    public async Task<string> CreatePortalSession(string userId)
    {
        if (!_isConfigured) throw new InvalidOperationException("Billing not configured");

        var user = await _context.Users.FindAsync(userId)
            ?? throw new InvalidOperationException("User not found");

        if (string.IsNullOrEmpty(user.StripeCustomerId))
            throw new InvalidOperationException("No billing account found");

        var frontendUrl = _config["Frontend:Url"] ?? "http://localhost:3000";
        var service = new Stripe.BillingPortal.SessionService();
        var session = await service.CreateAsync(new Stripe.BillingPortal.SessionCreateOptions
        {
            Customer = user.StripeCustomerId,
            ReturnUrl = $"{frontendUrl}/dashboard/settings"
        });

        return session.Url;
    }

    public async Task HandleWebhook(string json, string signature)
    {
        if (!_isConfigured) return;

        var webhookSecret = _config["Stripe:WebhookSecret"];
        var stripeEvent = EventUtility.ConstructEvent(json, signature, webhookSecret);

        _logger.LogInformation("Stripe webhook: {Type}", stripeEvent.Type);

        switch (stripeEvent.Type)
        {
            case EventTypes.CheckoutSessionCompleted:
                await HandleCheckoutCompleted(stripeEvent);
                break;
            case EventTypes.CustomerSubscriptionUpdated:
                await HandleSubscriptionUpdated(stripeEvent);
                break;
            case EventTypes.CustomerSubscriptionDeleted:
                await HandleSubscriptionDeleted(stripeEvent);
                break;
            case EventTypes.InvoicePaymentFailed:
                await HandlePaymentFailed(stripeEvent);
                break;
        }
    }

    public async Task<BillingStatus> GetSubscriptionStatus(string userId)
    {
        var user = await _context.Users.FindAsync(userId)
            ?? throw new InvalidOperationException("User not found");

        var agentCount = await _context.Agents.CountAsync(a => a.UserId == userId);
        var storeCount = await _context.Stores.CountAsync(s => s.UserId == userId);

        var (maxAgents, maxStores) = PlanLimits.GetLimits(user.Plan);

        return new BillingStatus
        {
            Plan = user.Plan,
            PlanDisplayName = PlanLimits.GetDisplayName(user.Plan),
            AgentsUsed = agentCount,
            AgentsLimit = maxAgents,
            StoresUsed = storeCount,
            StoresLimit = maxStores,
            StripeConfigured = _isConfigured,
            PlanExpiresAt = user.PlanExpiresAt
        };
    }

    public async Task<(bool Allowed, string? Error)> CheckPlanActive(string userId)
    {
        var user = await _context.Users.FindAsync(userId);
        if (user == null) return (false, "User not found");

        if (user.Plan == "none")
            return (false, "No active plan. Subscribe to start using agents.");

        return (true, null);
    }

    public async Task<(bool Allowed, string? Error)> CheckAgentLimit(string userId)
    {
        var user = await _context.Users.FindAsync(userId);
        if (user == null) return (false, "User not found");

        var (maxAgents, _) = PlanLimits.GetLimits(user.Plan);
        if (maxAgents == int.MaxValue) return (true, null);

        var count = await _context.Agents.CountAsync(a => a.UserId == userId);
        if (count >= maxAgents)
            return (false, $"Agent limit reached ({count}/{maxAgents}). Upgrade your plan for more agents.");

        return (true, null);
    }

    public async Task<(bool Allowed, string? Error)> CheckStoreLimit(string userId)
    {
        var user = await _context.Users.FindAsync(userId);
        if (user == null) return (false, "User not found");

        var (_, maxStores) = PlanLimits.GetLimits(user.Plan);
        if (maxStores == int.MaxValue) return (true, null);

        var count = await _context.Stores.CountAsync(s => s.UserId == userId);
        if (count >= maxStores)
            return (false, $"Store limit reached ({count}/{maxStores}). Upgrade your plan for more stores.");

        return (true, null);
    }

    // --- Private webhook handlers ---

    private async Task HandleCheckoutCompleted(Event stripeEvent)
    {
        var session = stripeEvent.Data.Object as Session;
        if (session == null) return;

        var userId = session.Metadata.GetValueOrDefault("userId");
        if (string.IsNullOrEmpty(userId)) return;

        var user = await _context.Users.FindAsync(userId);
        if (user == null) return;

        user.StripeCustomerId = session.CustomerId;
        user.StripeSubscriptionId = session.SubscriptionId;

        // Determine plan from price
        user.Plan = ResolvePlanFromSubscription(session.SubscriptionId).Result;

        await _context.SaveChangesAsync();
        _logger.LogInformation("User {UserId} subscribed to {Plan}", userId, user.Plan);
    }

    private async Task HandleSubscriptionUpdated(Event stripeEvent)
    {
        var subscription = stripeEvent.Data.Object as Subscription;
        if (subscription == null) return;

        var user = await _context.Users.FirstOrDefaultAsync(u => u.StripeCustomerId == subscription.CustomerId);
        if (user == null) return;

        user.Plan = ResolvePlanFromPriceId(subscription.Items.Data.FirstOrDefault()?.Price?.Id);
        user.StripeSubscriptionId = subscription.Id;
        user.PlanExpiresAt = subscription.Items?.Data?.FirstOrDefault()?.CurrentPeriodEnd ?? DateTime.UtcNow.AddMonths(1);

        await _context.SaveChangesAsync();
        _logger.LogInformation("User {UserId} plan updated to {Plan}", user.Id, user.Plan);
    }

    private async Task HandleSubscriptionDeleted(Event stripeEvent)
    {
        var subscription = stripeEvent.Data.Object as Subscription;
        if (subscription == null) return;

        var user = await _context.Users.FirstOrDefaultAsync(u => u.StripeCustomerId == subscription.CustomerId);
        if (user == null) return;

        user.Plan = "none";
        user.StripeSubscriptionId = null;
        user.PlanExpiresAt = null;

        await _context.SaveChangesAsync();
        _logger.LogInformation("User {UserId} subscription cancelled, plan removed", user.Id);
    }

    private async Task HandlePaymentFailed(Event stripeEvent)
    {
        var invoice = stripeEvent.Data.Object as Invoice;
        if (invoice == null) return;

        var user = await _context.Users.FirstOrDefaultAsync(u => u.StripeCustomerId == invoice.CustomerId);
        if (user == null) return;

        _logger.LogWarning("Payment failed for user {UserId}, subscription {SubId}", user.Id, user.StripeSubscriptionId);
        // Keep current plan but log — Stripe will retry. After final retry, subscription.deleted fires.
    }

    private async Task<string> ResolvePlanFromSubscription(string? subscriptionId)
    {
        if (string.IsNullOrEmpty(subscriptionId)) return "none";

        try
        {
            var service = new SubscriptionService();
            var sub = await service.GetAsync(subscriptionId);
            var priceId = sub.Items.Data.FirstOrDefault()?.Price?.Id;
            return ResolvePlanFromPriceId(priceId);
        }
        catch
        {
            return "starter"; // fallback
        }
    }

    private string ResolvePlanFromPriceId(string? priceId)
    {
        if (string.IsNullOrEmpty(priceId)) return "none";

        var starterPriceId = _config["Stripe:PriceIdStarter"];
        var proPriceId = _config["Stripe:PriceIdPro"];
        var businessPriceId = _config["Stripe:PriceIdBusiness"];

        if (priceId == starterPriceId) return "starter";
        if (priceId == proPriceId) return "pro";
        if (priceId == businessPriceId) return "business";

        return "starter"; // fallback
    }
}

public class BillingStatus
{
    public string Plan { get; set; } = "none";
    public string PlanDisplayName { get; set; } = "No Plan";
    public int AgentsUsed { get; set; }
    public int AgentsLimit { get; set; }
    public int StoresUsed { get; set; }
    public int StoresLimit { get; set; }
    public bool StripeConfigured { get; set; }
    public DateTime? PlanExpiresAt { get; set; }
}
