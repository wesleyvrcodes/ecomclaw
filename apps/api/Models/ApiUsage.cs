namespace ClawCommerce.Api.Models;

/// <summary>
/// Tracks AI API usage per user per month for cost cap enforcement (Rule #14).
/// </summary>
public class ApiUsage
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string UserId { get; set; } = string.Empty;
    public string AgentId { get; set; } = string.Empty;
    public string Model { get; set; } = string.Empty;

    /// <summary>Year-month key, e.g. "2026-03"</summary>
    public string Period { get; set; } = string.Empty;

    public int InputTokens { get; set; }
    public int OutputTokens { get; set; }
    public int RequestCount { get; set; }

    /// <summary>Estimated cost in USD cents</summary>
    public int EstimatedCostCents { get; set; }

    public DateTime LastUpdated { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Monthly spending limits per plan (in USD cents).
/// </summary>
public static class PlanCostCaps
{
    public static readonly Dictionary<string, int> MonthlyLimitCents = new()
    {
        ["none"] = 0,
        ["starter"] = 5000,     // $50/month
        ["pro"] = 15000,        // $150/month
        ["business"] = 50000,   // $500/month
    };

    public static int GetLimit(string? plan)
        => MonthlyLimitCents.GetValueOrDefault(plan ?? "none", 0);
}
