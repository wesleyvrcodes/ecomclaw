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
[Route("api/stores")]
public class StoreController : ControllerBase
{
    private readonly ClawCommerceDbContext _context;
    private readonly ShopifyService _shopify;
    private readonly BillingService _billingService;
    private readonly AuditService _audit;
    private readonly DeploymentService _deploymentService;

    public StoreController(ClawCommerceDbContext context, ShopifyService shopify, BillingService billingService, AuditService audit, DeploymentService deploymentService)
    {
        _context = context;
        _shopify = shopify;
        _billingService = billingService;
        _audit = audit;
        _deploymentService = deploymentService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        var userStores = await _context.Stores
            .Where(s => s.UserId == userId)
            .OrderByDescending(s => s.CreatedAt)
            .Select(s => new
            {
                s.Id,
                s.UserId,
                s.Name,
                s.StoreUrl,
                s.Niche,
                s.IsConnected,
                s.ProductCount,
                s.CreatedAt,
                AgentCount = _context.Agents.Count(a => a.StoreId == s.Id && a.UserId == userId)
            })
            .ToListAsync();

        return Ok(userStores);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        var store = await _context.Stores.FindAsync(id);
        if (store is null)
            return NotFound(new { error = "Store not found" });
        if (store.UserId != userId)
            return Forbid();

        return Ok(new
        {
            store.Id,
            store.UserId,
            store.Name,
            store.StoreUrl,
            store.Niche,
            store.IsConnected,
            store.ProductCount,
            store.CreatedAt,
            store.GrantedScopes,
            HasCredentials = !string.IsNullOrEmpty(store.ClientId)
        });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateStoreRequest request)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        // Check store limit
        var (storeAllowed, storeError) = await _billingService.CheckStoreLimit(userId);
        if (!storeAllowed)
            return BadRequest(new { error = storeError });

        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { error = "Store name is required" });
        if (string.IsNullOrWhiteSpace(request.StoreUrl))
            return BadRequest(new { error = "Store URL is required" });

        var isConnected = false;
        var accessToken = "";
        var grantedScopes = request.GrantedScopes ?? new List<string>();
        var productCount = 0;

        if (!string.IsNullOrWhiteSpace(request.ClientId) && !string.IsNullOrWhiteSpace(request.ClientSecret))
        {
            var validation = await _shopify.ValidateConnectionAsync(request.StoreUrl, request.ClientId, request.ClientSecret);
            if (!validation.Valid)
                return BadRequest(new { error = validation.Message });

            isConnected = true;
            accessToken = validation.AccessToken;
            productCount = validation.ProductCount;
            if (validation.GrantedScopes.Count > 0)
                grantedScopes = validation.GrantedScopes;
        }

        var store = new Store
        {
            Id = Guid.NewGuid().ToString(),
            UserId = userId,
            Name = request.Name.Trim(),
            StoreUrl = request.StoreUrl.Trim(),
            Niche = request.Niche?.Trim() ?? string.Empty,
            ClientId = request.ClientId?.Trim() ?? string.Empty,
            ClientSecret = request.ClientSecret?.Trim() ?? string.Empty,
            AccessToken = accessToken,
            GrantedScopes = grantedScopes,
            IsConnected = isConnected,
            ProductCount = productCount,
            CreatedAt = DateTime.UtcNow
        };

        _context.Stores.Add(store);
        await _context.SaveChangesAsync();

        await _audit.LogAsync(HttpContext, AuditActions.StoreCreated, "Store", store.Id);

        return CreatedAtAction(nameof(GetById), new { id = store.Id }, new
        {
            store.Id,
            store.UserId,
            store.Name,
            store.StoreUrl,
            store.Niche,
            store.IsConnected,
            store.ProductCount,
            store.CreatedAt,
            HasCredentials = !string.IsNullOrEmpty(store.ClientId)
        });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] UpdateStoreRequest request)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        var store = await _context.Stores.FindAsync(id);
        if (store is null)
            return NotFound(new { error = "Store not found" });
        if (store.UserId != userId)
            return Forbid();

        if (!string.IsNullOrWhiteSpace(request.Name))
            store.Name = request.Name.Trim();
        if (!string.IsNullOrWhiteSpace(request.StoreUrl))
            store.StoreUrl = request.StoreUrl.Trim();
        if (request.Niche is not null)
            store.Niche = request.Niche.Trim();
        if (request.ClientId is not null)
            store.ClientId = request.ClientId.Trim();
        if (request.ClientSecret is not null)
            store.ClientSecret = request.ClientSecret.Trim();

        store.IsConnected = !string.IsNullOrWhiteSpace(store.ClientId) && !string.IsNullOrWhiteSpace(store.ClientSecret);
        await _context.SaveChangesAsync();

        await _audit.LogAsync(HttpContext, AuditActions.StoreUpdated, "Store", id);

        return Ok(new
        {
            store.Id,
            store.UserId,
            store.Name,
            store.StoreUrl,
            store.Niche,
            store.IsConnected,
            store.ProductCount,
            store.CreatedAt,
            HasCredentials = !string.IsNullOrEmpty(store.ClientId)
        });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        var store = await _context.Stores.FindAsync(id);
        if (store is null)
            return NotFound(new { error = "Store not found" });
        if (store.UserId != userId)
            return Forbid();

        // Check for active deployments — don't allow deleting store with running agents
        var storeAgentIds = await _context.Agents
            .Where(a => a.StoreId == id && a.UserId == userId)
            .Select(a => a.Id)
            .ToListAsync();
        var activeDeployments = await _context.Deployments
            .Where(d => storeAgentIds.Contains(d.AgentId) &&
                        d.Status != DeploymentStatus.Stopped)
            .AnyAsync();
        if (activeDeployments)
            return BadRequest(new { error = "Cannot delete store with active deployments. Stop all agents first." });

        // Remove agents belonging to this store (scoped to userId)
        var agentsToRemove = await _context.Agents.Where(a => a.StoreId == id && a.UserId == userId).ToListAsync();
        _context.Agents.RemoveRange(agentsToRemove);
        _context.Stores.Remove(store);
        await _context.SaveChangesAsync();

        await _audit.LogAsync(HttpContext, AuditActions.StoreDeleted, "Store", id);

        return NoContent();
    }

    [HttpGet("{id}/agents")]
    public async Task<IActionResult> GetStoreAgents(string id)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        var store = await _context.Stores.FindAsync(id);
        if (store is null)
            return NotFound(new { error = "Store not found" });
        if (store.UserId != userId)
            return Forbid();

        var agents = await _context.Agents
            .Where(a => a.StoreId == id && a.UserId == userId)
            .OrderByDescending(a => a.LastActive)
            .ToListAsync();

        return Ok(agents);
    }
}

public record CreateStoreRequest(string Name, string StoreUrl, string? Niche, string? ClientId, string? ClientSecret, List<string>? GrantedScopes);
public record UpdateStoreRequest(string? Name, string? StoreUrl, string? Niche, string? ClientId, string? ClientSecret);
