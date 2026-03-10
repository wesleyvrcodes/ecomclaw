using ClawCommerce.Api.Data;
using ClawCommerce.Api.Extensions;
using ClawCommerce.Api.Models;
using ClawCommerce.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace ClawCommerce.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/settings")]
[EnableRateLimiting("global")]
public class SettingsController : ControllerBase
{
    private readonly ClawCommerceDbContext _context;
    private readonly AuditService _audit;
    private readonly DeploymentService _deploymentService;
    private readonly ILogger<SettingsController> _logger;

    public SettingsController(
        ClawCommerceDbContext context,
        AuditService audit,
        DeploymentService deploymentService,
        ILogger<SettingsController> logger)
    {
        _context = context;
        _audit = audit;
        _deploymentService = deploymentService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        var settings = await _context.UserSettings.FindAsync(userId);
        if (settings is null)
        {
            settings = new Settings { UserId = userId };
            _context.UserSettings.Add(settings);
            await _context.SaveChangesAsync();
        }

        return Ok(new
        {
            settings.UserId,
            settings.AiProvider,
            ApiKey = MaskKey(settings.ApiKey),
            OpenAiApiKey = MaskKey(settings.OpenAiApiKey),
            OpenRouterApiKey = MaskKey(settings.OpenRouterApiKey),
            settings.DefaultModel,
            settings.MaxTokens,
            settings.Temperature,
            settings.StreamResponses,
            settings.Theme,
            settings.NotificationsEnabled,
            settings.Plan,
            settings.UserName,
            settings.UserEmail
        });
    }

    private static string MaskKey(string? key) =>
        string.IsNullOrEmpty(key) ? "" :
        key.Length > 8 ? key[..4] + "****" + key[^4..] : "****";

    [HttpPut]
    public async Task<IActionResult> Update([FromBody] Settings settings)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        var existing = await _context.UserSettings.FindAsync(userId);

        // Helper: only update a key if the user actually typed a new value (not a masked echo)
        static bool IsRealKey(string? value) =>
            !string.IsNullOrEmpty(value) && !value.Contains("****");

        // Resolve actual key values: keep existing if masked/empty
        var resolvedApiKey = IsRealKey(settings.ApiKey) ? settings.ApiKey : existing?.ApiKey ?? "";
        var resolvedOpenAiKey = IsRealKey(settings.OpenAiApiKey) ? settings.OpenAiApiKey : existing?.OpenAiApiKey ?? "";
        var resolvedOpenRouterKey = IsRealKey(settings.OpenRouterApiKey) ? settings.OpenRouterApiKey : existing?.OpenRouterApiKey ?? "";

        // Detect API key or provider changes
        var apiKeyChanged = existing is null
            || existing.ApiKey != resolvedApiKey
            || existing.OpenAiApiKey != resolvedOpenAiKey
            || existing.OpenRouterApiKey != resolvedOpenRouterKey
            || existing.AiProvider != settings.AiProvider
            || existing.DefaultModel != settings.DefaultModel;

        if (existing is null)
        {
            settings.UserId = userId;
            settings.ApiKey = resolvedApiKey;
            settings.OpenAiApiKey = resolvedOpenAiKey;
            settings.OpenRouterApiKey = resolvedOpenRouterKey;
            _context.UserSettings.Add(settings);
        }
        else
        {
            existing.AiProvider = settings.AiProvider;
            existing.ApiKey = resolvedApiKey;
            existing.OpenAiApiKey = resolvedOpenAiKey;
            existing.OpenRouterApiKey = resolvedOpenRouterKey;
            existing.DefaultModel = settings.DefaultModel;
            existing.MaxTokens = settings.MaxTokens;
            existing.Temperature = settings.Temperature;
            existing.StreamResponses = settings.StreamResponses;
            existing.Theme = settings.Theme;
            existing.NotificationsEnabled = settings.NotificationsEnabled;
            // Plan is NOT updatable here — only via admin or Stripe webhook
            existing.UserName = settings.UserName;
            existing.UserEmail = settings.UserEmail;
        }

        await _context.SaveChangesAsync();

        if (apiKeyChanged)
        {
            await _audit.LogAsync(HttpContext, AuditActions.ApiKeyChanged, "Settings", userId);

            // Propagate new API keys to all active deployments (fire-and-forget, don't fail the request)
            try
            {
                await _deploymentService.UpdateDeploymentApiKeys(
                    userId, resolvedApiKey, resolvedOpenAiKey, resolvedOpenRouterKey,
                    settings.AiProvider, settings.DefaultModel);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Failed to propagate API key update to active deployments for user {UserId}", userId);
            }
        }
        else
        {
            await _audit.LogAsync(HttpContext, AuditActions.SettingsUpdated, "Settings", userId);
        }

        return Ok(new { success = true });
    }
}
