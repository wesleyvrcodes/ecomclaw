namespace ClawCommerce.Api.Models;

public class ConfigField
{
    public string Key { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string Type { get; set; } = "text";
    public string DefaultValue { get; set; } = string.Empty;
    public string Placeholder { get; set; } = string.Empty;
    public bool Required { get; set; } = false;
}

public class AgentTemplate
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Icon { get; set; } = string.Empty;
    public List<ConfigField> ConfigFields { get; set; } = new();
    public List<string> RequiredScopes { get; set; } = new();
    public string SoulMd { get; set; } = string.Empty;
    public List<string> Tools { get; set; } = new();
    public List<TaskDefinition> TaskDefinitions { get; set; } = new();
    public Dictionary<string, string> DefaultConfig { get; set; } = new();
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; } = 0;
}

public class TaskDefinition
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Trigger { get; set; } = "on_request";
    public string PromptTemplate { get; set; } = string.Empty;
}
