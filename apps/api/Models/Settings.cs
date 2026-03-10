namespace ClawCommerce.Api.Models;

public class Settings
{
    public string UserId { get; set; } = string.Empty;
    public string AiProvider { get; set; } = "";           // "anthropic", "openai", or "openrouter"
    public string ApiKey { get; set; } = "";               // Anthropic API key
    public string OpenAiApiKey { get; set; } = "";         // OpenAI API key
    public string OpenRouterApiKey { get; set; } = "";     // OpenRouter API key (sk-or-...)
    public string DefaultModel { get; set; } = "";         // Model ID
    public int MaxTokens { get; set; } = 4096;
    public double Temperature { get; set; } = 0.7;
    public bool StreamResponses { get; set; } = true;
    public string Theme { get; set; } = "dark";
    public bool NotificationsEnabled { get; set; } = true;
    public string Plan { get; set; } = "starter";
    public string UserName { get; set; } = "";
    public string UserEmail { get; set; } = "";
}
