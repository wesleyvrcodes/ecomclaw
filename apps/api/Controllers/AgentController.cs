using System.Net.Http.Headers;
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
[Route("api/agents")]
[EnableRateLimiting("global")]
public class AgentController : ControllerBase
{
    private readonly ClawCommerceDbContext _context;
    private readonly DeploymentService _deploymentService;
    private readonly BillingService _billingService;
    private readonly AuditService _audit;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly EncryptionService _encryption;
    private readonly ILogger<AgentController> _logger;

    public AgentController(
        ClawCommerceDbContext context,
        DeploymentService deploymentService,
        BillingService billingService,
        AuditService audit,
        IHttpClientFactory httpClientFactory,
        EncryptionService encryption,
        ILogger<AgentController> logger)
    {
        _context = context;
        _deploymentService = deploymentService;
        _billingService = billingService;
        _audit = audit;
        _httpClientFactory = httpClientFactory;
        _encryption = encryption;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? storeId)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        var query = _context.Agents.Where(a => a.UserId == userId);

        if (!string.IsNullOrWhiteSpace(storeId))
            query = query.Where(a => a.StoreId == storeId);

        var result = await query.OrderByDescending(a => a.LastActive).ToListAsync();
        return Ok(result);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        var agent = await _context.Agents.FindAsync(id);
        if (agent is null)
            return NotFound(new { error = "Agent not found" });

        if (agent.UserId != userId)
            return Forbid();

        return Ok(agent);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAgentRequest request)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { error = "Agent name is required" });
        if (string.IsNullOrWhiteSpace(request.StoreId))
            return BadRequest(new { error = "Store ID is required" });
        if (string.IsNullOrWhiteSpace(request.TemplateId))
            return BadRequest(new { error = "Template ID is required" });

        // Check agent limit
        var (agentAllowed, agentError) = await _billingService.CheckAgentLimit(userId);
        if (!agentAllowed)
            return BadRequest(new { error = agentError });

        var store = await _context.Stores.FindAsync(request.StoreId);
        if (store is null)
            return NotFound(new { error = "Store not found" });
        if (store.UserId != userId)
            return Forbid();

        var template = await _context.AgentTemplates.FindAsync(request.TemplateId);
        if (template is null)
            return NotFound(new { error = "Template not found" });

        var configuration = new Dictionary<string, string>();
        foreach (var field in template.ConfigFields)
            configuration[field.Key] = field.DefaultValue;
        if (request.Configuration is not null)
            foreach (var kvp in request.Configuration)
                configuration[kvp.Key] = kvp.Value;

        var agent = new Agent
        {
            Id = $"agent-{Guid.NewGuid():N}"[..14],
            Name = request.Name.Trim(),
            Type = template.Name,
            Status = AgentStatus.Stopped,
            LastActive = DateTime.UtcNow,
            TemplateId = request.TemplateId,
            StoreId = request.StoreId,
            StoreName = store.Name,
            CustomPrompt = request.CustomPrompt?.Trim() ?? string.Empty,
            Configuration = configuration,
            UserId = userId
        };

        _context.Agents.Add(agent);
        await _context.SaveChangesAsync();

        await _audit.LogAsync(HttpContext, AuditActions.AgentCreated, "Agent", agent.Id);

        return CreatedAtAction(nameof(GetById), new { id = agent.Id }, agent);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] UpdateAgentRequest request)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        var agent = await _context.Agents.FindAsync(id);
        if (agent is null)
            return NotFound(new { error = "Agent not found" });
        if (agent.UserId != userId)
            return Forbid();

        if (request.CustomPrompt is not null)
            agent.CustomPrompt = request.CustomPrompt.Trim();
        if (request.Name is not null)
            agent.Name = request.Name.Trim();
        if (request.Language is not null)
            agent.Language = request.Language.Trim();
        if (request.ToneOfVoice is not null)
            agent.ToneOfVoice = request.ToneOfVoice.Trim();
        if (request.Schedule is not null)
            agent.Schedule = request.Schedule.Trim();
        if (request.CustomRules is not null)
            agent.CustomRules = request.CustomRules;
        if (request.Configuration is not null)
        {
            var updated = new Dictionary<string, string>(agent.Configuration);
            foreach (var kvp in request.Configuration)
                updated[kvp.Key] = kvp.Value;
            agent.Configuration = updated;
        }

        agent.LastActive = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        await _audit.LogAsync(HttpContext, AuditActions.AgentUpdated, "Agent", id);

        // Push settings to live agent if deployed
        if (request.Configuration is not null)
        {
            try
            {
                var deployment = await _context.Deployments.FirstOrDefaultAsync(d => d.AgentId == id);
                if (deployment == null)
                {
                    _logger.LogInformation("No deployment found for agent {AgentId}, skipping settings push", id);
                }
                else
                {
                    var baseUrl = _deploymentService.GetAgentBaseUrl(deployment);
                    if (baseUrl == null)
                    {
                        _logger.LogWarning("No reachable URL for agent {AgentId} (IP={Ip}, Tunnel={Tunnel})",
                            id, deployment.ServerIp, deployment.TunnelUrl);
                    }
                    else
                    {
                        var client = _httpClientFactory.CreateClient();
                        client.Timeout = TimeSpan.FromSeconds(10);
                        string gatewayToken;
                        try { gatewayToken = _encryption.Decrypt(deployment.GatewayToken); }
                        catch { gatewayToken = deployment.GatewayToken; }

                        var configRequest = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/config")
                        {
                            Content = JsonContent.Create(new { agentSettings = agent.Configuration })
                        };
                        configRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", gatewayToken);
                        var pushResp = await client.SendAsync(configRequest);
                        _logger.LogInformation("Pushed settings to agent {AgentId} at {Url}: {Status}",
                            id, baseUrl, pushResp.StatusCode);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to push settings to agent {AgentId}", id);
            }
        }

        return Ok(agent);
    }

    [HttpPut("{id}/toggle")]
    public async Task<IActionResult> Toggle(string id)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        var agent = await _context.Agents.FindAsync(id);
        if (agent is null)
            return NotFound(new { error = "Agent not found" });
        if (agent.UserId != userId)
            return Forbid();

        agent.Status = agent.Status == AgentStatus.Running ? AgentStatus.Stopped : AgentStatus.Running;
        agent.LastActive = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        await _audit.LogAsync(HttpContext, AuditActions.AgentToggled, "Agent", id, $"Status: {agent.Status}");

        return Ok(agent);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        var agent = await _context.Agents.FindAsync(id);
        if (agent is null)
            return NotFound(new { error = "Agent not found" });
        if (agent.UserId != userId)
            return Forbid();

        // Also delete deployment if exists
        var deployment = await _deploymentService.GetByAgentId(agent.Id);
        if (deployment != null)
        {
            try
            {
                await _deploymentService.DeleteDeployment(userId, deployment.Id);
            }
            catch (Exception)
            {
                // Best effort — still delete agent
            }
        }

        _context.Agents.Remove(agent);
        await _context.SaveChangesAsync();

        await _audit.LogAsync(HttpContext, AuditActions.AgentDeleted, "Agent", id);

        return NoContent();
    }
}

public record CreateAgentRequest(
    string Name,
    string TemplateId,
    string StoreId,
    string? CustomPrompt,
    Dictionary<string, string>? Configuration
);

public record UpdateAgentRequest(
    string? Name,
    string? CustomPrompt,
    string? Language,
    string? ToneOfVoice,
    string? Schedule,
    List<string>? CustomRules,
    Dictionary<string, string>? Configuration
);
