namespace ClawCommerce.Api.Models;

public record AnalyticsData
{
    public int TokensUsed { get; init; }
    public decimal EstimatedCost { get; init; }
    public int MessagesSent { get; init; }
    public int TasksCompleted { get; init; }
    public required List<DailyUsage> DailyUsage { get; init; }
}

public record DailyUsage
{
    public required string Date { get; init; }
    public int Tokens { get; init; }
    public int Messages { get; init; }
}
