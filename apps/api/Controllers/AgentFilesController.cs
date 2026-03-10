using ClawCommerce.Api.Data;
using ClawCommerce.Api.Extensions;
using ClawCommerce.Api.Models;
using ClawCommerce.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace ClawCommerce.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/agents/{agentId}/files")]
[EnableRateLimiting("global")]
public class AgentFilesController : ControllerBase
{
    private readonly ClawCommerceDbContext _context;
    private readonly DeploymentService _deploymentService;
    private readonly EncryptionService _encryption;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<AgentFilesController> _logger;

    public AgentFilesController(
        ClawCommerceDbContext context,
        DeploymentService deploymentService,
        EncryptionService encryption,
        IHttpClientFactory httpClientFactory,
        ILogger<AgentFilesController> logger)
    {
        _context = context;
        _deploymentService = deploymentService;
        _encryption = encryption;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    /// <summary>List agent files</summary>
    [HttpGet]
    public async Task<IActionResult> ListFiles(string agentId)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var agent = await _context.Agents.FindAsync(agentId);
        if (agent == null || agent.UserId != userId) return NotFound();

        var deployment = await _context.Deployments.FirstOrDefaultAsync(d => d.AgentId == agentId);
        var isLive = deployment != null && _deploymentService.GetAgentBaseUrl(deployment) != null;

        // If agent is live, proxy to agent; otherwise return from DB
        if (isLive)
        {
            try
            {
                var (client, baseUrl, token) = GetAgentClient(deployment!);
                var request = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/files");
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                var response = await client.SendAsync(request);
                if (response.IsSuccessStatusCode)
                {
                    var body = await response.Content.ReadAsStringAsync();
                    return Content(body, "application/json");
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to proxy file list to agent {AgentId}", agentId);
            }
        }

        // Fallback: return from DB
        return Ok(new
        {
            files = new[]
            {
                new { name = "soul.md", description = "Agent personality and instructions", size = (agent.CustomPrompt ?? "").Length },
                new { name = "memory.md", description = "Persistent memory and notes", size = (agent.MemoryMd ?? "").Length },
                new { name = "worksheet.json", description = "Shared worksheet data (spreadsheet)", size = (agent.WorksheetData ?? "[]").Length }
            }
        });
    }

    /// <summary>Read a specific agent file</summary>
    [HttpGet("{fileName}")]
    public async Task<IActionResult> GetFile(string agentId, string fileName)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var agent = await _context.Agents.FindAsync(agentId);
        if (agent == null || agent.UserId != userId) return NotFound();

        var deployment = await _context.Deployments.FirstOrDefaultAsync(d => d.AgentId == agentId);
        var isLive = deployment != null && _deploymentService.GetAgentBaseUrl(deployment) != null;

        // If live, proxy to agent for real-time content
        if (isLive)
        {
            try
            {
                var (client, baseUrl, token) = GetAgentClient(deployment!);
                var request = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/files/{fileName}");
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                var response = await client.SendAsync(request);
                if (response.IsSuccessStatusCode)
                {
                    var body = await response.Content.ReadAsStringAsync();
                    return Content(body, "application/json");
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to proxy file read to agent {AgentId}", agentId);
            }
        }

        // Fallback: return from DB
        string? content = fileName switch
        {
            "soul.md" => agent.CustomPrompt ?? "",
            "memory.md" => agent.MemoryMd ?? "",
            "worksheet.json" => agent.WorksheetData ?? "[]",
            _ => null
        };

        if (content == null)
            return NotFound(new { error = $"Unknown file: {fileName}" });

        return Ok(new { name = fileName, content });
    }

    /// <summary>Update a specific agent file</summary>
    [HttpPut("{fileName}")]
    public async Task<IActionResult> UpdateFile(string agentId, string fileName, [FromBody] UpdateFileRequest request)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var agent = await _context.Agents.FindAsync(agentId);
        if (agent == null || agent.UserId != userId) return NotFound();

        if (fileName != "soul.md" && fileName != "memory.md" && fileName != "worksheet.json")
            return NotFound(new { error = $"Unknown file: {fileName}" });

        // Persist to DB first
        if (fileName == "soul.md")
            agent.CustomPrompt = request.Content;
        else if (fileName == "memory.md")
            agent.MemoryMd = request.Content;
        else if (fileName == "worksheet.json")
            agent.WorksheetData = request.Content;

        await _context.SaveChangesAsync();

        // Push to live agent if deployed
        var deployment = await _context.Deployments.FirstOrDefaultAsync(d => d.AgentId == agentId);
        bool pushedToAgent = false;

        if (deployment != null)
        {
            var baseUrl = _deploymentService.GetAgentBaseUrl(deployment);
            if (baseUrl != null)
            {
                try
                {
                    var (client, _, token) = GetAgentClient(deployment);
                    var putRequest = new HttpRequestMessage(HttpMethod.Put, $"{baseUrl}/files/{fileName}")
                    {
                        Content = System.Net.Http.Json.JsonContent.Create(new { content = request.Content })
                    };
                    putRequest.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
                    var response = await client.SendAsync(putRequest);
                    pushedToAgent = response.IsSuccessStatusCode;

                    if (!pushedToAgent)
                        _logger.LogWarning("Failed to push file update to agent {AgentId}: HTTP {Status}", agentId, (int)response.StatusCode);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to push file update to agent {AgentId}", agentId);
                }
            }
        }

        return Ok(new { name = fileName, content = request.Content, saved = true, pushedToAgent });
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

public record UpdateFileRequest(string Content);
