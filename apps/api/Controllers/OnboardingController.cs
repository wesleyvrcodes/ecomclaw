using ClawCommerce.Api.Data;
using ClawCommerce.Api.Extensions;
using ClawCommerce.Api.Models;
using ClawCommerce.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace ClawCommerce.Api.Controllers;

[ApiController]
[Authorize]
[EnableRateLimiting("global")]
[Route("api/onboarding")]
public class OnboardingController : ControllerBase
{
    private readonly ClawCommerceDbContext _context;
    private readonly ShopifyService _shopify;
    private readonly SopParserService _sopParser;
    private readonly AuditService _audit;

    public OnboardingController(ClawCommerceDbContext context, ShopifyService shopify, SopParserService sopParser, AuditService audit)
    {
        _context = context;
        _shopify = shopify;
        _sopParser = sopParser;
        _audit = audit;
    }

    [HttpPost("complete")]
    public async Task<IActionResult> Complete([FromBody] OnboardingRequest request)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        if (string.IsNullOrWhiteSpace(request.StoreName))
            return BadRequest(new { error = "Store name is required" });
        if (string.IsNullOrWhiteSpace(request.StoreUrl))
            return BadRequest(new { error = "Store URL is required" });
        if (string.IsNullOrWhiteSpace(request.ClientId))
            return BadRequest(new { error = "Client ID is required" });
        if (string.IsNullOrWhiteSpace(request.ClientSecret))
            return BadRequest(new { error = "Client Secret is required" });
        if (string.IsNullOrWhiteSpace(request.TemplateId))
            return BadRequest(new { error = "Template ID is required" });
        if (string.IsNullOrWhiteSpace(request.AiProvider))
            return BadRequest(new { error = "AI provider is required" });
        if (string.IsNullOrWhiteSpace(request.ApiKey))
            return BadRequest(new { error = "API key is required" });

        var template = await _context.AgentTemplates.FindAsync(request.TemplateId);
        if (template is null)
            return NotFound(new { error = "Template not found" });

        // 1. Validate Shopify connection
        var validation = await _shopify.ValidateConnectionAsync(request.StoreUrl, request.ClientId, request.ClientSecret);
        if (!validation.Valid)
            return BadRequest(new { error = validation.Message });

        // 2. Create store
        var store = new Store
        {
            Id = Guid.NewGuid().ToString(),
            UserId = userId,
            Name = request.StoreName.Trim(),
            StoreUrl = request.StoreUrl.Trim(),
            Niche = request.Niche?.Trim() ?? string.Empty,
            ClientId = request.ClientId.Trim(),
            ClientSecret = request.ClientSecret.Trim(),
            AccessToken = validation.AccessToken,
            GrantedScopes = validation.GrantedScopes.Count > 0 ? validation.GrantedScopes : (request.GrantedScopes ?? template.RequiredScopes),
            IsConnected = true,
            ProductCount = validation.ProductCount,
            CreatedAt = DateTime.UtcNow
        };
        _context.Stores.Add(store);

        // 3. Save settings (AI key)
        var existingSettings = await _context.UserSettings.FindAsync(userId);
        var settings = existingSettings ?? new Settings { UserId = userId };
        settings.AiProvider = request.AiProvider.Trim();
        if (request.AiProvider.Trim().ToLower() == "anthropic")
            settings.ApiKey = request.ApiKey.Trim();
        else
            settings.OpenAiApiKey = request.ApiKey.Trim();

        if (existingSettings is null)
            _context.UserSettings.Add(settings);

        // 4. Create agent
        var agentName = request.AgentName?.Trim() ?? $"{template.Name} — {store.Name}";
        var configuration = new Dictionary<string, string>();
        foreach (var field in template.ConfigFields)
            configuration[field.Key] = field.DefaultValue;
        if (request.Configuration is not null)
            foreach (var kvp in request.Configuration)
                configuration[kvp.Key] = kvp.Value;

        var agent = new Agent
        {
            Id = $"agent-{Guid.NewGuid():N}"[..14],
            Name = agentName,
            Type = template.Name,
            Status = AgentStatus.Running,
            LastActive = DateTime.UtcNow,
            TemplateId = request.TemplateId,
            StoreId = store.Id,
            StoreName = store.Name,
            CustomPrompt = request.CustomPrompt?.Trim() ?? string.Empty,
            Configuration = configuration,
            UserId = userId
        };
        _context.Agents.Add(agent);

        // 5. Seed first chat message
        var capabilities = template.Name switch
        {
            "Product Lister" => "- Create and optimize product listings\n- Write SEO-friendly titles and descriptions\n- Organize products into collections\n- Suggest tags and improve discoverability",
            "Daily Reporter" => "- Generate daily sales and revenue reports\n- Track top-performing products\n- Monitor inventory levels\n- Spot trends and anomalies",
            "Google Ads Optimizer" => "- Analyze your catalog for ad-worthy products\n- Generate Google Ads campaigns and copy\n- Suggest keywords and bidding strategies\n- Track and optimize ROAS",
            "Customer Service" => "- Answer customer questions about products\n- Track order statuses and shipping\n- Handle return and refund requests\n- Escalate complex issues to you",
            "Supply Chain Manager" => "- Monitor inventory levels in real-time\n- Predict stockouts before they happen\n- Calculate optimal reorder quantities\n- Track supplier lead times and reliability",
            _ => "- Help you manage your store efficiently"
        };

        var firstMessage = new ChatMessage
        {
            Id = $"msg-{Guid.NewGuid():N}"[..12],
            AgentId = agent.Id,
            Content = $"Hey! I'm your **{template.Name}** agent and I'm now connected to **{store.Name}** ({store.ProductCount} products detected).\n\nHere's what I can do for you:\n{capabilities}\n\nWhat would you like to start with?",
            IsUser = false,
            Timestamp = DateTime.UtcNow
        };
        _context.ChatMessages.Add(firstMessage);

        await _context.SaveChangesAsync();

        await _audit.LogAsync(HttpContext, AuditActions.StoreCreated, "Store", store.Id, $"Onboarding: {store.Name}");
        await _audit.LogAsync(HttpContext, AuditActions.AgentCreated, "Agent", agent.Id, $"Onboarding: {agent.Name}");

        return Ok(new
        {
            storeId = store.Id,
            agentId = agent.Id,
            agentName = agent.Name,
            storeName = store.Name
        });
    }

    [HttpPost("parse-sop")]
    [EnableRateLimiting("upload")]
    [RequestSizeLimit(10 * 1024 * 1024)] // 10MB
    public async Task<IActionResult> ParseSop(IFormFile file)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        if (file is null || file.Length == 0)
            return BadRequest(new { error = "No file uploaded" });

        if (file.Length > 10 * 1024 * 1024)
            return BadRequest(new { error = "File too large. Maximum 10MB." });

        using var stream = file.OpenReadStream();
        var result = await _sopParser.ParseAsync(stream, file.FileName);

        if (!result.Success)
            return BadRequest(new { error = result.ErrorMessage });

        return Ok(new
        {
            success = true,
            fileName = file.FileName,
            rules = result.Rules.Select(c => new
            {
                name = c.Name,
                icon = c.Icon,
                rules = c.Rules
            })
        });
    }

    [HttpPost("/api/stores/validate")]
    public async Task<IActionResult> ValidateStore([FromBody] ValidateStoreRequest request)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        if (string.IsNullOrWhiteSpace(request.StoreUrl))
            return BadRequest(new { error = "Store URL is required" });
        if (string.IsNullOrWhiteSpace(request.ClientId))
            return BadRequest(new { error = "Client ID is required" });
        if (string.IsNullOrWhiteSpace(request.ClientSecret))
            return BadRequest(new { error = "Client Secret is required" });

        var result = await _shopify.ValidateConnectionAsync(request.StoreUrl, request.ClientId, request.ClientSecret);

        return Ok(new
        {
            valid = result.Valid,
            storeName = result.ShopName,
            productCount = result.ProductCount,
            grantedScopes = result.GrantedScopes,
            message = result.Message
        });
    }

    [HttpPost("/api/settings/validate-key")]
    public IActionResult ValidateApiKey([FromBody] ValidateApiKeyRequest request)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        if (string.IsNullOrWhiteSpace(request.ApiKey))
            return BadRequest(new { error = "API key is required" });

        var isAnthropic = request.ApiKey.StartsWith("sk-ant-");
        var isOpenAi = request.ApiKey.StartsWith("sk-");

        if (!isAnthropic && !isOpenAi)
        {
            return Ok(new
            {
                valid = false,
                message = "Invalid API key format. Anthropic keys start with 'sk-ant-' and OpenAI keys start with 'sk-'."
            });
        }

        return Ok(new
        {
            valid = true,
            provider = isAnthropic ? "anthropic" : "openai",
            message = "API key format is valid. Balance cannot be verified — ensure your key has credits before deploying."
        });
    }
}

public record OnboardingRequest(
    string StoreName,
    string StoreUrl,
    string? Niche,
    string ClientId,
    string ClientSecret,
    List<string>? GrantedScopes,
    string TemplateId,
    string? AgentName,
    string? CustomPrompt,
    string AiProvider,
    string ApiKey,
    string? Schedule,
    Dictionary<string, string>? Configuration
);

public record ValidateStoreRequest(string StoreUrl, string ClientId, string ClientSecret);
public record ValidateApiKeyRequest(string ApiKey, string Provider);
