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
[Route("api/agents/{agentId}/cron")]
[EnableRateLimiting("global")]
public class AgentCronController : ControllerBase
{
    private readonly ClawCommerceDbContext _context;
    private readonly DeploymentService _deploymentService;
    private readonly EncryptionService _encryption;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<AgentCronController> _logger;

    public AgentCronController(
        ClawCommerceDbContext context,
        DeploymentService deploymentService,
        EncryptionService encryption,
        IHttpClientFactory httpClientFactory,
        ILogger<AgentCronController> logger)
    {
        _context = context;
        _deploymentService = deploymentService;
        _encryption = encryption;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    /// <summary>List all cron jobs for the agent</summary>
    [HttpGet]
    public async Task<IActionResult> ListCronJobs(string agentId)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var agent = await _context.Agents.FindAsync(agentId);
        if (agent == null || agent.UserId != userId) return NotFound();

        var deployment = await _context.Deployments.FirstOrDefaultAsync(d => d.AgentId == agentId);
        var baseUrl = deployment != null ? _deploymentService.GetAgentBaseUrl(deployment) : null;
        if (baseUrl == null)
            return StatusCode(503, new { error = "Agent is not deployed or not reachable" });

        try
        {
            var (client, _, token) = GetAgentClient(deployment!);
            var request = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/cron");
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var response = await client.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            return Content(body, "application/json");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to proxy cron list to agent {AgentId}", agentId);
            return StatusCode(503, new { error = "Agent is not reachable" });
        }
    }

    /// <summary>Create a new cron job</summary>
    [HttpPost]
    public async Task<IActionResult> CreateCronJob(string agentId)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var agent = await _context.Agents.FindAsync(agentId);
        if (agent == null || agent.UserId != userId) return NotFound();

        var deployment = await _context.Deployments.FirstOrDefaultAsync(d => d.AgentId == agentId);
        var baseUrl = deployment != null ? _deploymentService.GetAgentBaseUrl(deployment) : null;
        if (baseUrl == null)
            return StatusCode(503, new { error = "Agent is not deployed or not reachable" });

        try
        {
            var (client, _, token) = GetAgentClient(deployment!);
            var bodyContent = await new StreamReader(Request.Body).ReadToEndAsync();
            var request = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/cron")
            {
                Content = new StringContent(bodyContent, System.Text.Encoding.UTF8, "application/json")
            };
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var response = await client.SendAsync(request);
            var responseBody = await response.Content.ReadAsStringAsync();
            return Content(responseBody, "application/json");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to proxy cron create to agent {AgentId}", agentId);
            return StatusCode(503, new { error = "Agent is not reachable" });
        }
    }

    /// <summary>Update an existing cron job by ID</summary>
    [HttpPut("{cronId}")]
    public async Task<IActionResult> UpdateCronJob(string agentId, string cronId)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var agent = await _context.Agents.FindAsync(agentId);
        if (agent == null || agent.UserId != userId) return NotFound();

        var deployment = await _context.Deployments.FirstOrDefaultAsync(d => d.AgentId == agentId);
        var baseUrl = deployment != null ? _deploymentService.GetAgentBaseUrl(deployment) : null;
        if (baseUrl == null)
            return StatusCode(503, new { error = "Agent is not deployed or not reachable" });

        try
        {
            var (client, _, token) = GetAgentClient(deployment!);
            var bodyContent = await new StreamReader(Request.Body).ReadToEndAsync();
            var request = new HttpRequestMessage(HttpMethod.Put, $"{baseUrl}/cron/{cronId}")
            {
                Content = new StringContent(bodyContent, System.Text.Encoding.UTF8, "application/json")
            };
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var response = await client.SendAsync(request);
            var responseBody = await response.Content.ReadAsStringAsync();
            return Content(responseBody, "application/json");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to proxy cron update to agent {AgentId}, cron {CronId}", agentId, cronId);
            return StatusCode(503, new { error = "Agent is not reachable" });
        }
    }

    /// <summary>Delete a cron job by ID</summary>
    [HttpDelete("{cronId}")]
    public async Task<IActionResult> DeleteCronJob(string agentId, string cronId)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var agent = await _context.Agents.FindAsync(agentId);
        if (agent == null || agent.UserId != userId) return NotFound();

        var deployment = await _context.Deployments.FirstOrDefaultAsync(d => d.AgentId == agentId);
        var baseUrl = deployment != null ? _deploymentService.GetAgentBaseUrl(deployment) : null;
        if (baseUrl == null)
            return StatusCode(503, new { error = "Agent is not deployed or not reachable" });

        try
        {
            var (client, _, token) = GetAgentClient(deployment!);
            var request = new HttpRequestMessage(HttpMethod.Delete, $"{baseUrl}/cron/{cronId}");
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var response = await client.SendAsync(request);
            var responseBody = await response.Content.ReadAsStringAsync();
            return Content(responseBody, "application/json");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to proxy cron delete to agent {AgentId}, cron {CronId}", agentId, cronId);
            return StatusCode(503, new { error = "Agent is not reachable" });
        }
    }

    private (HttpClient client, string baseUrl, string token) GetAgentClient(Deployment deployment)
    {
        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(10);
        var baseUrl = _deploymentService.GetAgentBaseUrl(deployment)!;
        var token = _encryption.Decrypt(deployment.GatewayToken);
        return (client, baseUrl, token);
    }
}
