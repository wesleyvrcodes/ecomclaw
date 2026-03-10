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
[Route("api/agents/{agentId}/tasks")]
[EnableRateLimiting("global")]
public class AgentTasksController : ControllerBase
{
    private readonly ClawCommerceDbContext _context;
    private readonly DeploymentService _deploymentService;
    private readonly EncryptionService _encryption;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<AgentTasksController> _logger;

    public AgentTasksController(
        ClawCommerceDbContext context,
        DeploymentService deploymentService,
        EncryptionService encryption,
        IHttpClientFactory httpClientFactory,
        ILogger<AgentTasksController> logger)
    {
        _context = context;
        _deploymentService = deploymentService;
        _encryption = encryption;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    /// <summary>List agent tasks (pass query params like ?status=pending)</summary>
    [HttpGet]
    public async Task<IActionResult> ListTasks(string agentId)
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
            var queryString = Request.QueryString.Value ?? "";
            var request = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/tasks{queryString}");
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var response = await client.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            return Content(body, "application/json");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to proxy task list to agent {AgentId}", agentId);
            return StatusCode(503, new { error = "Agent is not reachable" });
        }
    }

    /// <summary>Get a specific task by ID</summary>
    [HttpGet("{taskId}")]
    public async Task<IActionResult> GetTask(string agentId, string taskId)
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
            var request = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/tasks/{taskId}");
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var response = await client.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            return Content(body, "application/json");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to proxy task get to agent {AgentId}, task {TaskId}", agentId, taskId);
            return StatusCode(503, new { error = "Agent is not reachable" });
        }
    }

    /// <summary>Delete a specific task by ID</summary>
    [HttpDelete("{taskId}")]
    public async Task<IActionResult> DeleteTask(string agentId, string taskId)
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
            var request = new HttpRequestMessage(HttpMethod.Delete, $"{baseUrl}/tasks/{taskId}");
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var response = await client.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            return Content(body, "application/json");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to proxy task delete to agent {AgentId}, task {TaskId}", agentId, taskId);
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
