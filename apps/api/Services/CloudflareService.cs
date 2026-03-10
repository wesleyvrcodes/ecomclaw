using System.Net.Http.Headers;
using System.Text.Json;

namespace ClawCommerce.Api.Services;

public class TunnelInfo
{
    public string TunnelId { get; set; } = string.Empty;
    public string TunnelToken { get; set; } = string.Empty;
    public string Hostname { get; set; } = string.Empty;
}

/// <summary>
/// Manages Cloudflare Tunnels for secure agent connectivity.
/// Each deployment gets its own tunnel: agent-{deploymentId}.agents.yourdomain.com
/// All traffic is encrypted end-to-end via Cloudflare's network.
/// </summary>
public class CloudflareService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _config;
    private readonly ILogger<CloudflareService> _logger;
    private readonly bool _mockMode;

    private const string BaseUrl = "https://api.cloudflare.com/client/v4";

    public CloudflareService(HttpClient httpClient, IConfiguration config, ILogger<CloudflareService> logger)
    {
        _httpClient = httpClient;
        _config = config;
        _logger = logger;
        _mockMode = config.GetValue<bool>("Cloudflare:MockMode", false);

        if (!_mockMode)
        {
            var apiToken = config["Cloudflare:ApiToken"];
            if (!string.IsNullOrEmpty(apiToken))
            {
                _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiToken);
            }
        }
    }

    private string AccountId => _config["Cloudflare:AccountId"] ?? "";
    private string ZoneId => _config["Cloudflare:ZoneId"] ?? "";
    private string TunnelDomain => _config["Cloudflare:TunnelDomain"] ?? "agents.ecomclaw.com";

    /// <summary>
    /// Creates a Cloudflare Tunnel and DNS route for a deployment.
    /// Returns tunnel info needed for cloudflared on the VPS.
    /// </summary>
    public async Task<TunnelInfo> CreateTunnel(string deploymentId, string agentName)
    {
        var tunnelName = $"agent-{deploymentId}";
        var hostname = $"{tunnelName}.{TunnelDomain}";

        if (_mockMode)
        {
            var fakeTunnelId = Guid.NewGuid().ToString();
            _logger.LogInformation("[MOCK] Would create Cloudflare Tunnel '{Name}' → {Hostname}", tunnelName, hostname);
            return new TunnelInfo
            {
                TunnelId = fakeTunnelId,
                TunnelToken = $"mock-tunnel-token-{fakeTunnelId[..8]}",
                Hostname = hostname
            };
        }

        // Step 1: Create the tunnel
        var createBody = new { name = tunnelName, tunnel_secret = Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32)) };
        var createResponse = await _httpClient.PostAsJsonAsync($"{BaseUrl}/accounts/{AccountId}/cfd_tunnel", createBody);
        await EnsureSuccess(createResponse, "CreateTunnel");

        var createResult = await createResponse.Content.ReadFromJsonAsync<JsonElement>();
        var tunnelId = createResult.GetProperty("result").GetProperty("id").GetString()!;

        // Step 2: Get tunnel token (for cloudflared service)
        var tokenResponse = await _httpClient.GetAsync($"{BaseUrl}/accounts/{AccountId}/cfd_tunnel/{tunnelId}/token");
        await EnsureSuccess(tokenResponse, "GetTunnelToken");

        var tokenResult = await tokenResponse.Content.ReadFromJsonAsync<JsonElement>();
        var tunnelToken = tokenResult.GetProperty("result").GetString()!;

        // Step 3: Configure tunnel to route to localhost:8080
        var configBody = new
        {
            config = new
            {
                ingress = new object[]
                {
                    new { hostname, service = "http://localhost:8080" },
                    new { service = "http_status:404" } // catch-all
                }
            }
        };
        var configResponse = await _httpClient.PutAsJsonAsync(
            $"{BaseUrl}/accounts/{AccountId}/cfd_tunnel/{tunnelId}/configurations", configBody);
        await EnsureSuccess(configResponse, "ConfigureTunnel");

        // Step 4: Create DNS CNAME record pointing to the tunnel
        var dnsBody = new
        {
            type = "CNAME",
            name = $"{tunnelName}.{TunnelDomain}",
            content = $"{tunnelId}.cfargotunnel.com",
            proxied = true,
            comment = $"EcomClaw agent tunnel for {agentName}"
        };
        var dnsResponse = await _httpClient.PostAsJsonAsync($"{BaseUrl}/zones/{ZoneId}/dns_records", dnsBody);
        await EnsureSuccess(dnsResponse, "CreateDnsRecord");

        _logger.LogInformation("Created Cloudflare Tunnel {TunnelId} → {Hostname}", tunnelId, hostname);

        return new TunnelInfo
        {
            TunnelId = tunnelId,
            TunnelToken = tunnelToken,
            Hostname = hostname
        };
    }

    /// <summary>
    /// Retrieves the tunnel token for an existing tunnel (used for legacy deployments without stored token).
    /// </summary>
    public async Task<string> GetTunnelToken(string tunnelId)
    {
        if (_mockMode)
        {
            return $"mock-tunnel-token-{tunnelId[..Math.Min(8, tunnelId.Length)]}";
        }

        try
        {
            var tokenResponse = await _httpClient.GetAsync($"{BaseUrl}/accounts/{AccountId}/cfd_tunnel/{tunnelId}/token");
            await EnsureSuccess(tokenResponse, "GetTunnelToken");

            var tokenResult = await tokenResponse.Content.ReadFromJsonAsync<JsonElement>();
            return tokenResult.GetProperty("result").GetString() ?? "";
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch tunnel token for tunnel {TunnelId}", tunnelId);
            return "";
        }
    }

    /// <summary>
    /// Deletes a Cloudflare Tunnel and its DNS record.
    /// </summary>
    public async Task DeleteTunnel(string tunnelId, string deploymentId)
    {
        if (_mockMode)
        {
            _logger.LogInformation("[MOCK] Would delete Cloudflare Tunnel '{TunnelId}'", tunnelId);
            return;
        }

        // Delete DNS record first
        try
        {
            var tunnelName = $"agent-{deploymentId}";
            var hostname = $"{tunnelName}.{TunnelDomain}";

            // Find the DNS record
            var listResponse = await _httpClient.GetAsync(
                $"{BaseUrl}/zones/{ZoneId}/dns_records?name={hostname}&type=CNAME");
            if (listResponse.IsSuccessStatusCode)
            {
                var listResult = await listResponse.Content.ReadFromJsonAsync<JsonElement>();
                var records = listResult.GetProperty("result");
                foreach (var record in records.EnumerateArray())
                {
                    var recordId = record.GetProperty("id").GetString();
                    await _httpClient.DeleteAsync($"{BaseUrl}/zones/{ZoneId}/dns_records/{recordId}");
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to delete DNS record for tunnel {TunnelId}", tunnelId);
        }

        // Delete the tunnel
        var deleteResponse = await _httpClient.DeleteAsync($"{BaseUrl}/accounts/{AccountId}/cfd_tunnel/{tunnelId}");
        if (!deleteResponse.IsSuccessStatusCode)
        {
            var body = await deleteResponse.Content.ReadAsStringAsync();
            _logger.LogWarning("Failed to delete tunnel {TunnelId}: {Status} {Body}", tunnelId, deleteResponse.StatusCode, body);
        }
    }

    private async Task EnsureSuccess(HttpResponseMessage response, string operation)
    {
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync();
            _logger.LogError("Cloudflare API {Operation} failed: {Status} {Body}", operation, response.StatusCode, body);
            throw new HttpRequestException($"Cloudflare API {operation} failed: {response.StatusCode} - {body}");
        }
    }
}
