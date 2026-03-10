using System.Security.Cryptography;
using System.Text;
using ClawCommerce.Api.Data;
using ClawCommerce.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ClawCommerce.Api.Services;

public class DeploymentService
{
    private readonly ClawCommerceDbContext _context;
    private readonly HetznerService _hetznerService;
    private readonly CloudflareService _cloudflareService;
    private readonly OpenClawConfigService _configService;
    private readonly EncryptionService _encryption;
    private readonly IConfiguration _config;
    private readonly ILogger<DeploymentService> _logger;

    public DeploymentService(
        ClawCommerceDbContext context,
        HetznerService hetznerService,
        CloudflareService cloudflareService,
        OpenClawConfigService configService,
        EncryptionService encryption,
        IConfiguration config,
        ILogger<DeploymentService> logger)
    {
        _context = context;
        _hetznerService = hetznerService;
        _cloudflareService = cloudflareService;
        _configService = configService;
        _encryption = encryption;
        _config = config;
        _logger = logger;
    }

    public async Task<Deployment> DeployAgent(string userId, string agentId, string? apiKey)
    {
        var agent = await _context.Agents.FindAsync(agentId)
            ?? throw new InvalidOperationException("Agent not found");
        if (agent.UserId != userId)
            throw new UnauthorizedAccessException("Not your agent");

        var store = await _context.Stores.FindAsync(agent.StoreId)
            ?? throw new InvalidOperationException("Store not found");

        var template = await _context.AgentTemplates.FindAsync(agent.TemplateId)
            ?? throw new InvalidOperationException("Template not found");

        // Check if already deployed (scoped to user)
        var existing = await _context.Deployments.FirstOrDefaultAsync(d => d.AgentId == agentId && d.UserId == userId);
        if (existing != null)
            throw new InvalidOperationException("Agent is already deployed");

        // Fetch user settings for API keys and provider preference
        var settings = await _context.UserSettings.FirstOrDefaultAsync(s => s.UserId == userId);
        var anthropicKey = settings?.ApiKey ?? "";
        var openAiKey = settings?.OpenAiApiKey ?? "";
        var openRouterKey = settings?.OpenRouterApiKey ?? "";
        var aiProvider = settings?.AiProvider ?? "";
        var aiModel = settings?.DefaultModel ?? "";

        // If explicit key passed (legacy), detect by prefix
        if (!string.IsNullOrEmpty(apiKey))
        {
            if (apiKey.StartsWith("sk-ant-"))
                anthropicKey = apiKey;
            else
                openAiKey = apiKey;
        }

        if (string.IsNullOrEmpty(anthropicKey) && string.IsNullOrEmpty(openAiKey) && string.IsNullOrEmpty(openRouterKey))
            throw new InvalidOperationException("No AI API key configured. Go to Settings → API & Model to add your API key.");

        // Generate gateway token
        var gatewayToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));

        // Create deployment record early so we have an ID for the tunnel
        var deployment = new Deployment
        {
            UserId = userId,
            AgentId = agentId,
            Status = DeploymentStatus.Provisioning,
            Region = _config["Hetzner:Location"] ?? "nbg1",
            GatewayToken = _encryption.Encrypt(gatewayToken),
            GatewayPort = 8080,
            LastHealthCheck = DateTime.UtcNow
        };

        // Step 1: Create Cloudflare Tunnel for secure HTTPS access
        var tunnel = await _cloudflareService.CreateTunnel(deployment.Id, agent.Name);
        deployment.TunnelId = tunnel.TunnelId;
        deployment.TunnelUrl = $"https://{tunnel.Hostname}";
        deployment.TunnelToken = _encryption.Encrypt(tunnel.TunnelToken);

        // Step 2: Build env vars for cloud-init
        var envVars = _configService.BuildEnvironmentVariables(
            gatewayToken, agent, store, template, anthropicKey, openAiKey, aiProvider, aiModel, openRouterKey);

        // Step 3: Generate cloud-init script (includes cloudflared + Docker + OpenClaw)
        var cloudInit = BuildCloudInitScript(envVars, tunnel.TunnelToken, deployment.Id);

        // Step 4: Create Hetzner server
        var location = _config["Hetzner:Location"] ?? "nbg1";
        var serverType = _config["Hetzner:ServerType"] ?? "cx23";
        var serverName = $"agent-{userId[..Math.Min(8, userId.Length)]}-{agentId}";

        var serverConfig = new HetznerServerConfig
        {
            Name = serverName,
            ServerType = serverType,
            Location = location,
            Image = "ubuntu-24.04",
            UserData = cloudInit,
            Labels = new Dictionary<string, string>
            {
                ["managed-by"] = "ecomclaw",
                ["user-id"] = userId[..Math.Min(16, userId.Length)],
                ["agent-id"] = agentId
            }
        };

        var serverInfo = await _hetznerService.CreateServer(serverConfig);

        deployment.ServerId = serverInfo.Id;
        deployment.ServerIp = serverInfo.Ipv4;
        deployment.ServerName = serverInfo.Name;

        _context.Deployments.Add(deployment);

        // Don't set agent to Running yet — health check will confirm once healthy
        agent.Status = AgentStatus.Stopped;
        agent.LastActive = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        _logger.LogInformation(
            "Deployed agent {AgentId} for user {UserId} -> Hetzner server {ServerId} via tunnel {TunnelUrl}",
            agentId, userId, serverInfo.Id, deployment.TunnelUrl);

        return deployment;
    }

    public async Task<Deployment> StopAgent(string userId, string deploymentId)
    {
        var deployment = await GetUserDeployment(userId, deploymentId);

        await _hetznerService.Shutdown(deployment.ServerId);

        deployment.Status = DeploymentStatus.Stopped;
        deployment.StoppedAt = DateTime.UtcNow;

        var agent = await _context.Agents.FindAsync(deployment.AgentId);
        if (agent != null)
        {
            agent.Status = AgentStatus.Stopped;
            agent.LastActive = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();
        return deployment;
    }

    public async Task<Deployment> StartAgent(string userId, string deploymentId)
    {
        var deployment = await GetUserDeployment(userId, deploymentId);

        await _hetznerService.PowerOn(deployment.ServerId);

        deployment.Status = DeploymentStatus.Starting;
        deployment.StoppedAt = null;
        deployment.LastHealthCheck = DateTime.UtcNow;

        // Don't set agent to Running yet — health check will do that once confirmed
        await _context.SaveChangesAsync();
        return deployment;
    }

    public async Task DeleteDeployment(string userId, string deploymentId)
    {
        var deployment = await GetUserDeployment(userId, deploymentId);

        // Delete Cloudflare Tunnel first (non-blocking)
        try
        {
            if (!string.IsNullOrEmpty(deployment.TunnelId))
                await _cloudflareService.DeleteTunnel(deployment.TunnelId, deployment.Id);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to delete Cloudflare Tunnel {TunnelId}", deployment.TunnelId);
        }

        // Delete Hetzner server with retries
        var deleted = false;
        for (int attempt = 1; attempt <= 3; attempt++)
        {
            try
            {
                await _hetznerService.DeleteServer(deployment.ServerId);
                deleted = true;
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Failed to delete Hetzner server {ServerId} (attempt {Attempt}/3)",
                    deployment.ServerId, attempt);
                if (attempt < 3)
                    await Task.Delay(TimeSpan.FromSeconds(5 * attempt));
            }
        }

        if (!deleted)
            _logger.LogError("ORPHANED SERVER: Failed to delete Hetzner server {ServerId} after 3 attempts. Manual cleanup required.",
                deployment.ServerId);

        var agent = await _context.Agents.FindAsync(deployment.AgentId);
        if (agent != null)
        {
            agent.Status = AgentStatus.Stopped;
            agent.LastActive = DateTime.UtcNow;
        }

        _context.Deployments.Remove(deployment);
        await _context.SaveChangesAsync();
    }

    public async Task<Deployment> RedeployAgent(string userId, string deploymentId)
    {
        var deployment = await GetUserDeployment(userId, deploymentId);

        var agent = await _context.Agents.FindAsync(deployment.AgentId)
            ?? throw new InvalidOperationException("Agent not found");
        var store = await _context.Stores.FindAsync(agent.StoreId)
            ?? throw new InvalidOperationException("Store not found");
        var template = await _context.AgentTemplates.FindAsync(agent.TemplateId)
            ?? throw new InvalidOperationException("Template not found");

        // Decrypt gateway token for new cloud-init
        var gatewayToken = _encryption.Decrypt(deployment.GatewayToken);

        // Fetch current user settings for API keys and provider
        var settings = await _context.UserSettings.FirstOrDefaultAsync(s => s.UserId == userId);
        var envVars = _configService.BuildEnvironmentVariables(
            gatewayToken, agent, store, template,
            settings?.ApiKey, settings?.OpenAiApiKey, settings?.AiProvider, settings?.DefaultModel,
            settings?.OpenRouterApiKey);

        // Reuse the stored tunnel token so cloudflared starts on the rebuilt server
        var tunnelToken = "";
        if (!string.IsNullOrEmpty(deployment.TunnelToken))
        {
            tunnelToken = _encryption.Decrypt(deployment.TunnelToken);
        }
        else if (!string.IsNullOrEmpty(deployment.TunnelId))
        {
            // Legacy deployment without stored token — fetch from Cloudflare
            _logger.LogInformation("No stored tunnel token for deployment {Id}, fetching from Cloudflare", deployment.Id);
            tunnelToken = await _cloudflareService.GetTunnelToken(deployment.TunnelId);
            if (!string.IsNullOrEmpty(tunnelToken))
            {
                deployment.TunnelToken = _encryption.Encrypt(tunnelToken);
            }
        }
        var cloudInit = BuildCloudInitScript(envVars, tunnelToken, deployment.Id);

        await _hetznerService.RebuildServer(deployment.ServerId, cloudInit);

        deployment.Status = DeploymentStatus.Provisioning;
        deployment.ErrorMessage = null;
        deployment.CreatedAt = DateTime.UtcNow; // Reset timer for 10-minute health check window
        deployment.LastHealthCheck = DateTime.UtcNow;

        // Mark agent as stopped until health check confirms it's back
        agent.Status = AgentStatus.Stopped;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Redeployed agent {AgentId} on server {ServerId}", deployment.AgentId, deployment.ServerId);
        return deployment;
    }

    public async Task<Deployment?> GetByAgentId(string agentId)
    {
        return await _context.Deployments.FirstOrDefaultAsync(d => d.AgentId == agentId);
    }

    public async Task<DeploymentStatusInfo> GetDetailedStatus(string userId, string deploymentId)
    {
        var deployment = await GetUserDeployment(userId, deploymentId);
        var serverStatus = await _hetznerService.GetServerStatus(deployment.ServerId);

        // Map Hetzner states
        var newStatus = serverStatus switch
        {
            "running" => DeploymentStatus.Running,
            "off" => DeploymentStatus.Stopped,
            "stopping" => DeploymentStatus.Stopped,
            "starting" => DeploymentStatus.Starting,
            "initializing" => DeploymentStatus.Provisioning,
            "rebuilding" => DeploymentStatus.Provisioning,
            "migrating" => DeploymentStatus.Provisioning,
            "deleting" => DeploymentStatus.Stopped,
            _ => DeploymentStatus.Error
        };

        // If server is running, check if agent is actually healthy
        var agentHealthy = false;
        if (newStatus == DeploymentStatus.Running)
        {
            agentHealthy = await CheckAgentHealth(deployment);
            if (!agentHealthy)
                newStatus = DeploymentStatus.Installing; // Server up, agent not ready yet
        }

        if (deployment.Status != newStatus)
        {
            deployment.Status = newStatus;
            deployment.LastHealthCheck = DateTime.UtcNow;

            // Update IP if not available
            if (string.IsNullOrEmpty(deployment.ServerIp) && serverStatus == "running")
            {
                var server = await _hetznerService.GetServer(deployment.ServerId);
                if (!string.IsNullOrEmpty(server.Ipv4))
                    deployment.ServerIp = server.Ipv4;
            }

            await _context.SaveChangesAsync();
        }

        return new DeploymentStatusInfo
        {
            Status = newStatus.ToString(),
            ServerStatus = serverStatus,
            AgentHealthy = agentHealthy,
            TunnelUrl = deployment.TunnelUrl,
            Region = deployment.Region,
            CreatedAt = deployment.CreatedAt,
            LastHealthCheck = deployment.LastHealthCheck,
            ErrorMessage = deployment.ErrorMessage
        };
    }

    // Keep simple string version for backward compat
    public async Task<string> GetStatus(string userId, string deploymentId)
    {
        var info = await GetDetailedStatus(userId, deploymentId);
        return info.Status;
    }

    public async Task<List<Deployment>> ListUserDeployments(string userId)
    {
        return await _context.Deployments
            .Where(d => d.UserId == userId)
            .OrderByDescending(d => d.CreatedAt)
            .ToListAsync();
    }

    /// <summary>
    /// Pushes updated API keys to all active (Running/Installing) deployments for a user
    /// by calling the agent's POST /config endpoint. Failures are logged but do not throw.
    /// </summary>
    public async Task UpdateDeploymentApiKeys(string userId, string? anthropicApiKey, string? openAiApiKey,
        string? openRouterApiKey = null, string? aiProvider = null, string? aiModel = null)
    {
        var activeDeployments = await _context.Deployments
            .Where(d => d.UserId == userId)
            .ToListAsync();

        if (activeDeployments.Count == 0)
            return;

        _logger.LogInformation(
            "Propagating API key update to {Count} active deployment(s) for user {UserId}",
            activeDeployments.Count, userId);

        using var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };

        var tasks = activeDeployments.Select(async deployment =>
        {
            var baseUrl = GetAgentBaseUrl(deployment);
            if (baseUrl == null)
            {
                _logger.LogWarning(
                    "Skipping API key update for deployment {DeploymentId}: no reachable URL",
                    deployment.Id);
                return;
            }

            try
            {
                var gatewayToken = _encryption.Decrypt(deployment.GatewayToken);

                var request = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/config")
                {
                    Content = System.Net.Http.Json.JsonContent.Create(new
                    {
                        anthropicApiKey = anthropicApiKey ?? "",
                        openAiApiKey = openAiApiKey ?? "",
                        openRouterApiKey = openRouterApiKey ?? "",
                        aiProvider = aiProvider ?? "",
                        aiModel = aiModel ?? ""
                    })
                };
                request.Headers.Authorization =
                    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", gatewayToken);

                var response = await httpClient.SendAsync(request);

                if (response.IsSuccessStatusCode)
                {
                    _logger.LogInformation(
                        "Updated API keys on deployment {DeploymentId} (agent {AgentId})",
                        deployment.Id, deployment.AgentId);
                }
                else
                {
                    _logger.LogWarning(
                        "Failed to update API keys on deployment {DeploymentId}: HTTP {StatusCode}",
                        deployment.Id, (int)response.StatusCode);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Failed to update API keys on deployment {DeploymentId}",
                    deployment.Id);
            }
        });

        await Task.WhenAll(tasks);
    }

    /// <summary>
    /// Checks if the OpenClaw agent is responding on its /health endpoint via the Cloudflare Tunnel.
    /// </summary>
    /// <summary>
    /// Returns the base URL for reaching the agent — direct IP if Cloudflare is in mock mode, otherwise tunnel URL.
    /// </summary>
    public string? GetAgentBaseUrl(Deployment deployment)
    {
        var cfMockMode = _config.GetValue<bool>("Cloudflare:MockMode", false);
        if (cfMockMode && !string.IsNullOrEmpty(deployment.ServerIp))
            return $"http://{deployment.ServerIp}:{deployment.GatewayPort}";
        if (!string.IsNullOrEmpty(deployment.TunnelUrl))
            return deployment.TunnelUrl;
        return null;
    }

    public async Task<bool> CheckAgentHealth(Deployment deployment)
    {
        var baseUrl = GetAgentBaseUrl(deployment);
        if (baseUrl == null) return false;
        var healthUrl = $"{baseUrl}/health";

        try
        {
            using var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            var response = await httpClient.GetAsync(healthUrl);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    private async Task<Deployment> GetUserDeployment(string userId, string deploymentId)
    {
        var deployment = await _context.Deployments.FindAsync(deploymentId)
            ?? throw new InvalidOperationException("Deployment not found");
        if (deployment.UserId != userId)
            throw new UnauthorizedAccessException("Not your deployment");
        return deployment;
    }

    /// <summary>
    /// Generates a cloud-init script that bootstraps an OpenClaw agent on a fresh Ubuntu 24.04 server.
    /// Installs Docker, cloudflared (Cloudflare Tunnel), writes env file, and starts everything as systemd services.
    /// </summary>
    private static string ShellEscape(string value) =>
        "'" + value.Replace("'", "'\\''") + "'";

    private string BuildCloudInitScript(Dictionary<string, string> envVars, string tunnelToken, string deploymentId)
    {
        var image = _config["Hetzner:AgentImage"] ?? "ghcr.io/ecomclaw/openclaw-agent:latest";
        var callbackUrl = _config["Api:BaseUrl"] ?? "http://localhost:5000";

        var envFileLines = new StringBuilder();
        foreach (var (key, value) in envVars)
        {
            // Docker --env-file requires single-line values, so replace newlines
            // Also escape single quotes to prevent env file corruption
            var flatValue = value.Replace("\r", "").Replace("\n", "\\n").Replace("'", "'\\''");
            envFileLines.AppendLine($"{key}={flatValue}");
        }

        return $"""
                #!/bin/bash
                set -euo pipefail
                exec > /var/log/ecomclaw-bootstrap.log 2>&1

                echo "=== EcomClaw Agent Bootstrap ==="
                echo "Deployment: {ShellEscape(deploymentId)}"
                echo "Started: $(date -u)"

                export DEBIAN_FRONTEND=noninteractive

                # -----------------------------------------------
                # Step 1: Install Docker
                # -----------------------------------------------
                echo "[1/5] Installing Docker..."
                apt-get update -qq
                apt-get install -y -qq ca-certificates curl gnupg
                install -m 0755 -d /etc/apt/keyrings
                curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
                chmod a+r /etc/apt/keyrings/docker.gpg
                echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
                apt-get update -qq
                apt-get install -y -qq docker-ce docker-ce-cli containerd.io
                systemctl enable docker
                systemctl start docker

                # Authenticate with Docker Hub to avoid rate limits
                echo '{_config["Docker:Token"] ?? ""}' | docker login -u '{_config["Docker:Username"] ?? ""}' --password-stdin 2>/dev/null || true
                echo "[1/5] Docker installed."

                # -----------------------------------------------
                # Step 2: Install Cloudflare Tunnel (cloudflared)
                # -----------------------------------------------
                echo "[2/5] Installing cloudflared..."
                curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
                dpkg -i /tmp/cloudflared.deb
                rm /tmp/cloudflared.deb

                # Configure cloudflared as a systemd service with the tunnel token
                if [ -n {ShellEscape(tunnelToken)} ] && ! echo {ShellEscape(tunnelToken)} | grep -q "^mock-"; then
                    cloudflared service install {ShellEscape(tunnelToken)}
                    systemctl enable cloudflared
                    systemctl start cloudflared
                    echo "[2/5] Cloudflare Tunnel active."
                else
                    echo "[2/5] No real tunnel token — skipping cloudflared setup."
                fi

                # -----------------------------------------------
                # Step 3: Configure firewall (UFW)
                # -----------------------------------------------
                echo "[3/5] Configuring firewall..."
                apt-get install -y -qq ufw
                ufw default deny incoming
                ufw default allow outgoing
                ufw allow 22/tcp
                ufw allow 8080/tcp
                ufw --force enable
                echo "[3/5] Firewall configured. SSH (22) and agent (8080) open."

                # -----------------------------------------------
                # Step 4: Write agent environment and config
                # -----------------------------------------------
                echo "[4/5] Writing agent configuration..."
                mkdir -p /opt/ecomclaw

                cat > /opt/ecomclaw/agent.env << 'ENVEOF'
                {envFileLines}ENVEOF

                # -----------------------------------------------
                # Step 5: Create and start agent container
                # -----------------------------------------------
                echo "[5/5] Starting OpenClaw agent container..."

                # Create persistent memory directory on host
                mkdir -p /opt/ecomclaw/data

                cat > /etc/systemd/system/ecomclaw-agent.service << 'SVCEOF'
                [Unit]
                Description=EcomClaw OpenClaw Agent
                After=docker.service cloudflared.service
                Requires=docker.service

                [Service]
                Type=simple
                Restart=always
                RestartSec=10
                ExecStartPre=-/usr/bin/docker rm -f ecomclaw-agent
                ExecStartPre=/usr/bin/docker pull {image}
                ExecStart=/usr/bin/docker run --rm --name ecomclaw-agent \
                    --env-file /opt/ecomclaw/agent.env \
                    -v /opt/ecomclaw/data:/root \
                    -p 0.0.0.0:8080:8080 \
                    {image}
                ExecStop=/usr/bin/docker stop ecomclaw-agent

                [Install]
                WantedBy=multi-user.target
                SVCEOF

                systemctl daemon-reload
                systemctl enable ecomclaw-agent
                systemctl start ecomclaw-agent

                echo "=== Bootstrap complete: $(date -u) ==="
                """;
    }
}

public class DeploymentStatusInfo
{
    public string Status { get; set; } = string.Empty;
    public string ServerStatus { get; set; } = string.Empty;
    public bool AgentHealthy { get; set; }
    public string TunnelUrl { get; set; } = string.Empty;
    public string Region { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime? LastHealthCheck { get; set; }
    public string? ErrorMessage { get; set; }
}
