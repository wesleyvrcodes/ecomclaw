using ClawCommerce.Api.Data;
using ClawCommerce.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ClawCommerce.Api.Services;

/// <summary>
/// Tracks and enforces AI API cost caps per user per month (Rule #14).
/// Called by ChatBridgeService when relaying messages to agent VPS.
/// </summary>
public class ApiUsageService
{
    private readonly ClawCommerceDbContext _context;

    public ApiUsageService(ClawCommerceDbContext context)
    {
        _context = context;
    }

    private static string CurrentPeriod() => DateTime.UtcNow.ToString("yyyy-MM");

    // Model pricing: (input per 1M tokens USD, output per 1M tokens USD)
    private static readonly Dictionary<string, (double Input, double Output)> ModelPricing = new()
    {
        ["claude-sonnet-4-5-20250514"] = (3.0, 15.0),
        ["claude-sonnet-4-5"] = (3.0, 15.0),
        ["anthropic/claude-sonnet-4-5"] = (3.0, 15.0),
        ["claude-sonnet-4-20250514"] = (3.0, 15.0),
        ["claude-3-5-sonnet-20241022"] = (3.0, 15.0),
        ["claude-haiku-3-5"] = (0.80, 4.0),
        ["claude-3-5-haiku-20241022"] = (0.80, 4.0),
        ["claude-3-haiku-20240307"] = (0.25, 1.25),
        ["gpt-4o"] = (2.50, 10.0),
        ["gpt-4o-2024-11-20"] = (2.50, 10.0),
        ["gpt-4o-mini"] = (0.15, 0.60),
        ["gpt-4o-mini-2024-07-18"] = (0.15, 0.60),
        ["gpt-4.1"] = (2.0, 8.0),
        ["gpt-4.1-mini"] = (0.40, 1.60),
        ["gpt-4.1-nano"] = (0.10, 0.40),
    };

    public static int ComputeCostCents(string model, int inputTokens, int outputTokens)
    {
        // Strip provider prefix (e.g. "anthropic/claude-sonnet-4-5" -> "claude-sonnet-4-5")
        var lookupModel = model.Contains('/') ? model[(model.LastIndexOf('/') + 1)..] : model;

        if (!ModelPricing.TryGetValue(lookupModel, out var pricing))
        {
            // Also try original (for models with explicit provider prefix in the map)
            if (!ModelPricing.TryGetValue(model, out pricing))
                pricing = (3.0, 15.0); // default to Sonnet pricing
        }

        var costUsd = (inputTokens / 1_000_000.0 * pricing.Input) + (outputTokens / 1_000_000.0 * pricing.Output);
        return (int)Math.Ceiling(costUsd * 100);
    }

    /// <summary>
    /// Check if a user has exceeded their monthly AI cost cap.
    /// </summary>
    public async Task<(bool Allowed, int RemainingCents, string? Message)> CheckLimitAsync(string userId)
    {
        var user = await _context.Users.FindAsync(userId);
        var limitCents = PlanCostCaps.GetLimit(user?.Plan);

        if (limitCents == 0)
            return (false, 0, "No active plan. Subscribe to use AI agents.");

        var period = CurrentPeriod();
        var totalSpentCents = await _context.Set<ApiUsage>()
            .Where(u => u.UserId == userId && u.Period == period)
            .SumAsync(u => u.EstimatedCostCents);

        var remaining = limitCents - totalSpentCents;
        if (remaining <= 0)
            return (false, 0, $"Monthly AI budget exceeded (${limitCents / 100.0:F2} limit). Resets next month or upgrade your plan.");

        return (true, remaining, null);
    }

    /// <summary>
    /// Record AI API usage after a request completes.
    /// </summary>
    public async Task RecordUsageAsync(string userId, string agentId, string model, int inputTokens, int outputTokens, int estimatedCostCents)
    {
        var period = CurrentPeriod();
        var id = Guid.NewGuid().ToString();
        var now = DateTime.UtcNow;

        await _context.Database.ExecuteSqlInterpolatedAsync($@"
            INSERT INTO ""ApiUsages"" (""Id"", ""UserId"", ""AgentId"", ""Model"", ""Period"", ""InputTokens"", ""OutputTokens"", ""RequestCount"", ""EstimatedCostCents"", ""LastUpdated"")
            VALUES ({id}, {userId}, {agentId}, {model}, {period}, {inputTokens}, {outputTokens}, 1, {estimatedCostCents}, {now})
            ON CONFLICT (""UserId"", ""AgentId"", ""Period"", ""Model"")
            DO UPDATE SET
                ""InputTokens"" = ""ApiUsages"".""InputTokens"" + {inputTokens},
                ""OutputTokens"" = ""ApiUsages"".""OutputTokens"" + {outputTokens},
                ""RequestCount"" = ""ApiUsages"".""RequestCount"" + 1,
                ""EstimatedCostCents"" = ""ApiUsages"".""EstimatedCostCents"" + {estimatedCostCents},
                ""LastUpdated"" = {now}
        ");
    }

    /// <summary>
    /// Get usage summary for a user for the current month.
    /// </summary>
    public async Task<object> GetUsageSummaryAsync(string userId)
    {
        var period = CurrentPeriod();
        var user = await _context.Users.FindAsync(userId);
        var limitCents = PlanCostCaps.GetLimit(user?.Plan);

        var usages = await _context.Set<ApiUsage>()
            .Where(u => u.UserId == userId && u.Period == period)
            .ToListAsync();

        var totalInputTokens = usages.Sum(u => u.InputTokens);
        var totalOutputTokens = usages.Sum(u => u.OutputTokens);
        var totalRequests = usages.Sum(u => u.RequestCount);
        var totalCostCents = usages.Sum(u => u.EstimatedCostCents);

        // Per-agent breakdown (join with Agents to get name)
        var agentIds = usages.Select(u => u.AgentId).Distinct().ToList();
        var agents = await _context.Agents
            .Where(a => agentIds.Contains(a.Id))
            .Select(a => new { a.Id, a.Name, a.StoreName })
            .ToListAsync();

        var byAgent = usages
            .GroupBy(u => u.AgentId)
            .Select(g =>
            {
                var agentInfo = agents.FirstOrDefault(a => a.Id == g.Key);
                return new
                {
                    agentId = g.Key,
                    agentName = agentInfo?.Name ?? g.Key,
                    storeName = agentInfo?.StoreName ?? "",
                    inputTokens = g.Sum(u => u.InputTokens),
                    outputTokens = g.Sum(u => u.OutputTokens),
                    requests = g.Sum(u => u.RequestCount),
                    costCents = g.Sum(u => u.EstimatedCostCents)
                };
            })
            .OrderByDescending(x => x.costCents)
            .ToList();

        // Per-model breakdown
        var byModel = usages
            .GroupBy(u => u.Model)
            .Select(g => new
            {
                model = g.Key,
                inputTokens = g.Sum(u => u.InputTokens),
                outputTokens = g.Sum(u => u.OutputTokens),
                requests = g.Sum(u => u.RequestCount),
                costCents = g.Sum(u => u.EstimatedCostCents)
            })
            .OrderByDescending(x => x.costCents)
            .ToList();

        return new
        {
            period,
            totalInputTokens,
            totalOutputTokens,
            totalRequests,
            totalCostCents,
            totalCostUsd = totalCostCents / 100.0,
            limitCents,
            limitUsd = limitCents / 100.0,
            remainingCents = Math.Max(0, limitCents - totalCostCents),
            percentUsed = limitCents > 0 ? Math.Round(totalCostCents * 100.0 / limitCents, 1) : 0,
            byAgent,
            byModel
        };
    }
}
