using System.Text.Json.Serialization;

namespace ClawCommerce.Api.Models;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum AgentStatus
{
    Running,
    Stopped,
    Error
}

public class Agent
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public AgentStatus Status { get; set; } = AgentStatus.Stopped;
    public DateTime LastActive { get; set; } = DateTime.UtcNow;
    public string TemplateId { get; set; } = string.Empty;
    public string StoreId { get; set; } = string.Empty;
    public string StoreName { get; set; } = string.Empty;
    public string CustomPrompt { get; set; } = string.Empty;
    public string MemoryMd { get; set; } = "";
    public Dictionary<string, string> Configuration { get; set; } = new();
    public string UserId { get; set; } = string.Empty;
    public string Language { get; set; } = "en";
    public string ToneOfVoice { get; set; } = "professional";
    public List<string> CustomRules { get; set; } = new();
    public string ContextCache { get; set; } = string.Empty;
    public DateTime? ContextCacheUpdatedAt { get; set; }
    public string Schedule { get; set; } = "daily";
    public string WorksheetData { get; set; } = "[]";
}
