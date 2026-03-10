using System.Text.Json.Serialization;

namespace ClawCommerce.Api.Models;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum DeploymentStatus
{
    Provisioning,
    Installing,
    Starting,
    Running,
    Sleeping,
    Stopped,
    Error
}

public class Deployment
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string UserId { get; set; } = string.Empty;
    public string AgentId { get; set; } = string.Empty;
    public long ServerId { get; set; }
    public string ServerIp { get; set; } = string.Empty;
    public string ServerName { get; set; } = string.Empty;
    public string TunnelId { get; set; } = string.Empty;
    public string TunnelUrl { get; set; } = string.Empty;
    public string TunnelToken { get; set; } = string.Empty;
    public DeploymentStatus Status { get; set; } = DeploymentStatus.Provisioning;
    public string Region { get; set; } = "nbg1";
    public string GatewayToken { get; set; } = string.Empty;
    public int GatewayPort { get; set; } = 8080;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? StoppedAt { get; set; }
    public DateTime? LastHealthCheck { get; set; }
    public string? ErrorMessage { get; set; }
}
