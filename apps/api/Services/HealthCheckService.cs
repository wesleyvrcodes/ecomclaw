using System.Text.Json;
using ClawCommerce.Api.Data;
using ClawCommerce.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ClawCommerce.Api.Services;

public class HealthCheckService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<HealthCheckService> _logger;

    // Track last memory sync per agent to avoid hammering every 30s
    private readonly Dictionary<string, DateTime> _lastMemorySync = new();
    private static readonly TimeSpan MemorySyncInterval = TimeSpan.FromMinutes(5);

    public HealthCheckService(IServiceScopeFactory scopeFactory, ILogger<HealthCheckService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        _logger.LogInformation("Health check service started");

        while (!ct.IsCancellationRequested)
        {
            try
            {
                await CheckAllDeployments(ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Health check iteration failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(30), ct);
        }
    }

    private async Task CheckAllDeployments(CancellationToken ct)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ClawCommerceDbContext>();
        var hetznerService = scope.ServiceProvider.GetRequiredService<HetznerService>();
        var deploymentService = scope.ServiceProvider.GetRequiredService<DeploymentService>();
        var encryption = scope.ServiceProvider.GetRequiredService<EncryptionService>();

        var activeDeployments = await context.Deployments
            .Where(d => d.Status == DeploymentStatus.Running
                     || d.Status == DeploymentStatus.Provisioning
                     || d.Status == DeploymentStatus.Installing
                     || d.Status == DeploymentStatus.Starting
                     || d.Status == DeploymentStatus.Error)
            .ToListAsync(ct);

        if (activeDeployments.Count == 0) return;

        _logger.LogInformation("Checking {Count} active deployments", activeDeployments.Count);

        foreach (var deployment in activeDeployments)
        {
            if (ct.IsCancellationRequested) break;

            try
            {
                await CheckDeployment(deployment, hetznerService, deploymentService, context);

                // Sync memory from running agents back to DB periodically
                if (deployment.Status == DeploymentStatus.Running)
                {
                    await SyncAgentMemory(deployment, deploymentService, encryption, context);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to check deployment {Id}", deployment.Id);
            }
        }

        await context.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Pulls the latest memory.md from a running agent and persists it to the database.
    /// This ensures self-learned insights survive container restarts and redeploys.
    /// </summary>
    private async Task SyncAgentMemory(
        Deployment deployment,
        DeploymentService deploymentService,
        EncryptionService encryption,
        ClawCommerceDbContext context)
    {
        // Rate-limit: only sync every 5 minutes per agent
        if (_lastMemorySync.TryGetValue(deployment.AgentId, out var lastSync)
            && DateTime.UtcNow - lastSync < MemorySyncInterval)
            return;

        var baseUrl = deploymentService.GetAgentBaseUrl(deployment);
        if (baseUrl == null) return;

        try
        {
            using var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
            var gatewayToken = encryption.Decrypt(deployment.GatewayToken);

            var request = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/files/memory.md");
            request.Headers.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", gatewayToken);

            var response = await httpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode) return;

            var body = await response.Content.ReadAsStringAsync();
            var doc = JsonDocument.Parse(body);
            if (!doc.RootElement.TryGetProperty("content", out var contentEl)) return;

            var remoteMemory = contentEl.GetString() ?? "";

            var agent = await context.Agents.FindAsync(deployment.AgentId);
            if (agent == null) return;

            // Only update if memory actually changed (agent learned something new)
            if (remoteMemory != (agent.MemoryMd ?? ""))
            {
                agent.MemoryMd = remoteMemory;
                _logger.LogInformation(
                    "Synced memory from agent {AgentId}: {Chars} chars saved to DB",
                    agent.Id, remoteMemory.Length);
            }

            _lastMemorySync[deployment.AgentId] = DateTime.UtcNow;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to sync memory for agent {AgentId}", deployment.AgentId);
        }
    }

    private async Task CheckDeployment(
        Deployment deployment,
        HetznerService hetznerService,
        DeploymentService deploymentService,
        ClawCommerceDbContext context)
    {
        var serverStatus = await hetznerService.GetServerStatus(deployment.ServerId);
        deployment.LastHealthCheck = DateTime.UtcNow;

        // Update IP if missing
        if (string.IsNullOrEmpty(deployment.ServerIp) && serverStatus == "running")
        {
            var server = await hetznerService.GetServer(deployment.ServerId);
            if (!string.IsNullOrEmpty(server.Ipv4))
                deployment.ServerIp = server.Ipv4;
        }

        // Server-level status mapping
        var serverUp = serverStatus == "running";
        var serverProvisioning = serverStatus is "initializing" or "starting" or "rebuilding";

        if (serverProvisioning)
        {
            if (deployment.Status != DeploymentStatus.Provisioning)
            {
                _logger.LogInformation("Deployment {Id}: server is {Status}", deployment.Id, serverStatus);
                deployment.Status = DeploymentStatus.Provisioning;
            }
            return;
        }

        if (!serverUp)
        {
            // Server is off/stopped/unknown
            if (deployment.Status is DeploymentStatus.Running or DeploymentStatus.Starting or DeploymentStatus.Installing)
            {
                // Server went down unexpectedly — try to restart
                var minutesSinceCreated = (DateTime.UtcNow - deployment.CreatedAt).TotalMinutes;
                if (minutesSinceCreated > 10) // Don't auto-restart freshly created servers
                {
                    _logger.LogWarning("Deployment {Id}: server is {Status} but should be running, powering on",
                        deployment.Id, serverStatus);
                    try
                    {
                        await hetznerService.PowerOn(deployment.ServerId);
                        deployment.Status = DeploymentStatus.Starting;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to power on server {ServerId}", deployment.ServerId);
                        deployment.Status = DeploymentStatus.Error;
                        deployment.ErrorMessage = $"Auto-restart failed: {ex.Message}";
                    }
                }
            }
            return;
        }

        // Server is running — check agent application health
        if (!string.IsNullOrEmpty(deployment.TunnelUrl) || !string.IsNullOrEmpty(deployment.ServerIp))
        {
            var agentHealthy = await deploymentService.CheckAgentHealth(deployment);

            // Sync Agent.Status with actual health
            var agent = await context.Agents.FindAsync(deployment.AgentId);

            if (agentHealthy)
            {
                if (deployment.Status != DeploymentStatus.Running)
                {
                    _logger.LogInformation("Deployment {Id}: agent is now healthy -> Running", deployment.Id);
                    deployment.Status = DeploymentStatus.Running;
                    deployment.ErrorMessage = null;
                }
                // Only set agent to Running when actually confirmed healthy
                if (agent != null && agent.Status != AgentStatus.Running)
                {
                    agent.Status = AgentStatus.Running;
                    agent.LastActive = DateTime.UtcNow;
                    _logger.LogInformation("Agent {AgentId}: confirmed healthy, status -> Running", agent.Id);
                }
            }
            else
            {
                // Server running but agent not responding
                if (deployment.Status == DeploymentStatus.Running)
                {
                    _logger.LogWarning("Deployment {Id}: agent health check failed", deployment.Id);
                    deployment.Status = DeploymentStatus.Installing;
                }
                // Agent is not reachable — make sure agent status reflects that
                if (agent != null && agent.Status == AgentStatus.Running)
                {
                    agent.Status = AgentStatus.Stopped;
                    _logger.LogWarning("Agent {AgentId}: unreachable, status -> Stopped", agent.Id);
                }

                // If stuck in Installing for > 10 minutes, mark as error
                var minutesSinceCreated = (DateTime.UtcNow - deployment.CreatedAt).TotalMinutes;
                if (deployment.Status == DeploymentStatus.Installing && minutesSinceCreated > 10)
                {
                    _logger.LogError("Deployment {Id}: agent failed to start within 10 minutes", deployment.Id);
                    deployment.Status = DeploymentStatus.Error;
                    deployment.ErrorMessage = "Agent failed to start within 10 minutes. Check logs for details.";
                    if (agent != null) agent.Status = AgentStatus.Error;
                }
            }
        }
    }
}
