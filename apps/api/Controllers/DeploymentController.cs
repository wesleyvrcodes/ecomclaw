using ClawCommerce.Api.Extensions;
using ClawCommerce.Api.Models;
using ClawCommerce.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace ClawCommerce.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/deployments")]
[EnableRateLimiting("global")]
public class DeploymentController : ControllerBase
{
    private readonly DeploymentService _deploymentService;
    private readonly HetznerService _hetznerService;
    private readonly AuditService _audit;
    private readonly ILogger<DeploymentController> _logger;

    public DeploymentController(DeploymentService deploymentService, HetznerService hetznerService, AuditService audit, ILogger<DeploymentController> logger)
    {
        _deploymentService = deploymentService;
        _hetznerService = hetznerService;
        _audit = audit;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var deployments = await _deploymentService.ListUserDeployments(userId);
        return Ok(deployments);
    }

    [HttpPost]
    public async Task<IActionResult> Deploy([FromBody] DeployRequest request)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        if (string.IsNullOrWhiteSpace(request.AgentId))
            return BadRequest(new { error = "AgentId is required" });

        try
        {
            var deployment = await _deploymentService.DeployAgent(userId, request.AgentId, request.ApiKey);
            await _audit.LogAsync(HttpContext, AuditActions.DeploymentCreated, "Deployment", deployment.Id, $"Agent: {request.AgentId}");
            return CreatedAtAction(nameof(GetStatus), new { id = deployment.Id }, deployment);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
    }

    [HttpGet("{id}/status")]
    public async Task<IActionResult> GetStatus(string id)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        try
        {
            var status = await _deploymentService.GetDetailedStatus(userId, id);
            return Ok(status);
        }
        catch (InvalidOperationException)
        {
            return NotFound();
        }
    }

    [HttpPost("{id}/stop")]
    public async Task<IActionResult> Stop(string id)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        try
        {
            var deployment = await _deploymentService.StopAgent(userId, id);
            return Ok(deployment);
        }
        catch (InvalidOperationException)
        {
            return NotFound();
        }
    }

    [HttpPost("{id}/start")]
    public async Task<IActionResult> Start(string id)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        try
        {
            var deployment = await _deploymentService.StartAgent(userId, id);
            return Ok(deployment);
        }
        catch (InvalidOperationException)
        {
            return NotFound();
        }
    }

    /// <summary>
    /// Redeploy an agent with updated configuration. Rebuilds the server with new cloud-init.
    /// </summary>
    [HttpPost("{id}/redeploy")]
    public async Task<IActionResult> Redeploy(string id)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        try
        {
            var deployment = await _deploymentService.RedeployAgent(userId, id);
            await _audit.LogAsync(HttpContext, AuditActions.DeploymentRedeployed, "Deployment", id);
            return Ok(deployment);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Fetch recent logs from the agent's VPS via the bootstrap log.
    /// </summary>
    [HttpGet("{id}/logs")]
    public async Task<IActionResult> GetLogs(string id, [FromQuery] string type = "bootstrap")
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        try
        {
            var deployments = await _deploymentService.ListUserDeployments(userId);
            var deployment = deployments.Find(d => d.Id == id);
            if (deployment == null) return NotFound();

            var baseUrl = _deploymentService.GetAgentBaseUrl(deployment);
            if (baseUrl == null)
                return Ok(new { logs = "Deployment has no tunnel URL yet. Server may still be provisioning." });

            using var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
            var logEndpoint = type switch
            {
                "agent" => $"{baseUrl}/logs",
                "bootstrap" => $"{baseUrl}/logs/bootstrap",
                _ => $"{baseUrl}/logs"
            };

            try
            {
                var response = await httpClient.GetAsync(logEndpoint);
                if (response.IsSuccessStatusCode)
                {
                    var logs = await response.Content.ReadAsStringAsync();
                    return Ok(new { logs });
                }

                return Ok(new { logs = $"Agent not reachable yet (HTTP {response.StatusCode}). Server may still be starting." });
            }
            catch (HttpRequestException)
            {
                return Ok(new { logs = "Agent not reachable. Server may still be provisioning or starting up." });
            }
        }
        catch (InvalidOperationException)
        {
            return NotFound();
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        try
        {
            await _deploymentService.DeleteDeployment(userId, id);
            await _audit.LogAsync(HttpContext, AuditActions.DeploymentDeleted, "Deployment", id);
            return NoContent();
        }
        catch (InvalidOperationException)
        {
            return NotFound();
        }
    }
}

public record DeployRequest(string AgentId, string? ApiKey);
