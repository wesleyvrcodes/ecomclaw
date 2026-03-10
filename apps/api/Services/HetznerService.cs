using System.Net.Http.Headers;
using System.Text.Json;

namespace ClawCommerce.Api.Services;

public class HetznerServerConfig
{
    public string Name { get; set; } = string.Empty;
    public string ServerType { get; set; } = "cx23";
    public string Location { get; set; } = "nbg1";
    public string Image { get; set; } = "ubuntu-24.04";
    public string UserData { get; set; } = string.Empty;
    public Dictionary<string, string> Labels { get; set; } = new();
}

public class HetznerServerInfo
{
    public long Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Ipv4 { get; set; } = string.Empty;
    public string Ipv6 { get; set; } = string.Empty;
}

public class HetznerService
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _config;
    private readonly ILogger<HetznerService> _logger;
    private readonly bool _mockMode;

    private const string BaseUrl = "https://api.hetzner.cloud/v1";

    public HetznerService(HttpClient httpClient, IConfiguration config, ILogger<HetznerService> logger)
    {
        _httpClient = httpClient;
        _config = config;
        _logger = logger;
        _mockMode = config.GetValue<bool>("Hetzner:MockMode", false);

        if (!_mockMode)
        {
            var apiToken = config["Hetzner:ApiToken"];
            if (!string.IsNullOrEmpty(apiToken))
            {
                _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiToken);
            }
        }
    }

    private string DefaultLocation => _config["Hetzner:Location"] ?? "nbg1";
    private string DefaultServerType => _config["Hetzner:ServerType"] ?? "cx23";
    private string? SshKeyName => _config["Hetzner:SshKeyName"];
    private long? FirewallId => _config.GetValue<long?>("Hetzner:FirewallId");

    public async Task<HetznerServerInfo> CreateServer(HetznerServerConfig serverConfig)
    {
        if (_mockMode)
        {
            var fakeId = Random.Shared.NextInt64(10_000_000, 99_999_999);
            _logger.LogInformation(
                "[MOCK] Would create Hetzner server '{Name}' type '{Type}' in '{Location}'. Labels: {Labels}",
                serverConfig.Name, serverConfig.ServerType, serverConfig.Location,
                string.Join(", ", serverConfig.Labels.Select(kv => $"{kv.Key}={kv.Value}")));

            await Task.Delay(500);
            return new HetznerServerInfo
            {
                Id = fakeId,
                Name = serverConfig.Name,
                Status = "initializing",
                Ipv4 = $"10.0.{Random.Shared.Next(1, 255)}.{Random.Shared.Next(1, 255)}",
                Ipv6 = "2a01:4f8:c17:1::1"
            };
        }

        var body = new Dictionary<string, object>
        {
            ["name"] = serverConfig.Name,
            ["server_type"] = serverConfig.ServerType.Length > 0 ? serverConfig.ServerType : DefaultServerType,
            ["location"] = serverConfig.Location.Length > 0 ? serverConfig.Location : DefaultLocation,
            ["image"] = serverConfig.Image,
            ["labels"] = serverConfig.Labels,
            ["user_data"] = serverConfig.UserData
        };

        if (!string.IsNullOrEmpty(SshKeyName))
            body["ssh_keys"] = new[] { SshKeyName };

        if (FirewallId.HasValue)
            body["firewalls"] = new[] { new { firewall = FirewallId.Value } };

        var response = await _httpClient.PostAsJsonAsync($"{BaseUrl}/servers", body);
        await EnsureSuccess(response, "CreateServer");

        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        var server = result.GetProperty("server");

        return ParseServerInfo(server);
    }

    public async Task PowerOn(long serverId)
    {
        if (_mockMode)
        {
            _logger.LogInformation("[MOCK] Would power on Hetzner server {ServerId}", serverId);
            await Task.Delay(300);
            return;
        }

        var response = await _httpClient.PostAsync($"{BaseUrl}/servers/{serverId}/actions/poweron", null);
        await EnsureSuccess(response, "PowerOn");
    }

    public async Task Shutdown(long serverId)
    {
        if (_mockMode)
        {
            _logger.LogInformation("[MOCK] Would shutdown Hetzner server {ServerId}", serverId);
            await Task.Delay(300);
            return;
        }

        // Graceful shutdown via ACPI signal
        var response = await _httpClient.PostAsync($"{BaseUrl}/servers/{serverId}/actions/shutdown", null);
        await EnsureSuccess(response, "Shutdown");
    }

    public async Task PowerOff(long serverId)
    {
        if (_mockMode)
        {
            _logger.LogInformation("[MOCK] Would power off Hetzner server {ServerId}", serverId);
            await Task.Delay(300);
            return;
        }

        var response = await _httpClient.PostAsync($"{BaseUrl}/servers/{serverId}/actions/poweroff", null);
        await EnsureSuccess(response, "PowerOff");
    }

    public async Task DeleteServer(long serverId)
    {
        if (_mockMode)
        {
            _logger.LogInformation("[MOCK] Would delete Hetzner server {ServerId}", serverId);
            await Task.Delay(200);
            return;
        }

        var response = await _httpClient.DeleteAsync($"{BaseUrl}/servers/{serverId}");
        await EnsureSuccess(response, "DeleteServer");
    }

    public async Task<HetznerServerInfo> GetServer(long serverId)
    {
        if (_mockMode)
        {
            _logger.LogInformation("[MOCK] Would get status of Hetzner server {ServerId}", serverId);
            return new HetznerServerInfo
            {
                Id = serverId,
                Name = "mock-server",
                Status = "running",
                Ipv4 = "10.0.0.1"
            };
        }

        var response = await _httpClient.GetAsync($"{BaseUrl}/servers/{serverId}");
        await EnsureSuccess(response, "GetServer");

        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        return ParseServerInfo(result.GetProperty("server"));
    }

    public async Task<string> GetServerStatus(long serverId)
    {
        var server = await GetServer(serverId);
        return server.Status;
    }

    public async Task<HetznerServerInfo> RebuildServer(long serverId, string userData)
    {
        if (_mockMode)
        {
            _logger.LogInformation("[MOCK] Would rebuild Hetzner server {ServerId}", serverId);
            await Task.Delay(500);
            return new HetznerServerInfo
            {
                Id = serverId,
                Name = "mock-server",
                Status = "rebuilding",
                Ipv4 = "10.0.0.1"
            };
        }

        var body = new { image = "ubuntu-24.04", user_data = userData };
        var response = await _httpClient.PostAsJsonAsync($"{BaseUrl}/servers/{serverId}/actions/rebuild", body);
        await EnsureSuccess(response, "RebuildServer");

        // Re-fetch server info after rebuild
        return await GetServer(serverId);
    }

    private static HetznerServerInfo ParseServerInfo(JsonElement server)
    {
        var ipv4 = "";
        var ipv6 = "";

        if (server.TryGetProperty("public_net", out var publicNet))
        {
            if (publicNet.TryGetProperty("ipv4", out var v4) && v4.TryGetProperty("ip", out var v4Ip))
                ipv4 = v4Ip.GetString() ?? "";
            if (publicNet.TryGetProperty("ipv6", out var v6) && v6.TryGetProperty("ip", out var v6Ip))
                ipv6 = v6Ip.GetString() ?? "";
        }

        return new HetznerServerInfo
        {
            Id = server.GetProperty("id").GetInt64(),
            Name = server.GetProperty("name").GetString() ?? "",
            Status = server.GetProperty("status").GetString() ?? "unknown",
            Ipv4 = ipv4,
            Ipv6 = ipv6
        };
    }

    private async Task EnsureSuccess(HttpResponseMessage response, string operation)
    {
        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync();
            _logger.LogError("Hetzner API {Operation} failed: {Status} {Body}", operation, response.StatusCode, body);
            throw new HttpRequestException($"Hetzner API {operation} failed: {response.StatusCode} - {body}");
        }
    }
}
