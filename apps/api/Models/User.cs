namespace ClawCommerce.Api.Models;

public class User
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Email { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Plan { get; set; } = "none";
    public string? StripeCustomerId { get; set; }
    public string? StripeSubscriptionId { get; set; }
    public DateTime? PlanExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public static class PlanLimits
{
    public static (int Agents, int Stores) GetLimits(string plan) => plan switch
    {
        "starter" => (3, 1),
        "pro" => (10, 3),
        "business" => (int.MaxValue, 10),
        _ => (0, 0) // no plan
    };

    public static string GetDisplayName(string plan) => plan switch
    {
        "starter" => "Starter",
        "pro" => "Pro",
        "business" => "Business",
        _ => "No Plan"
    };
}
