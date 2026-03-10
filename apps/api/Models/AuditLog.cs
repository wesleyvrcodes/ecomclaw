namespace ClawCommerce.Api.Models;

/// <summary>
/// Immutable audit trail for critical actions (Rule #20).
/// Tracks: deletions, role changes, payments, exports, auth events.
/// </summary>
public class AuditLog
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string? UserId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public string? EntityId { get; set; }
    public string? Details { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

public static class AuditActions
{
    // Auth
    public const string Register = "auth.register";
    public const string Login = "auth.login";
    public const string LoginFailed = "auth.login_failed";
    public const string TokenRefresh = "auth.token_refresh";
    public const string AccountDeleted = "auth.account_deleted";

    // Agents
    public const string AgentCreated = "agent.created";
    public const string AgentUpdated = "agent.updated";
    public const string AgentDeleted = "agent.deleted";
    public const string AgentToggled = "agent.toggled";

    // Stores
    public const string StoreCreated = "store.created";
    public const string StoreUpdated = "store.updated";
    public const string StoreDeleted = "store.deleted";

    // Deployments
    public const string DeploymentCreated = "deployment.created";
    public const string DeploymentStarted = "deployment.started";
    public const string DeploymentStopped = "deployment.stopped";
    public const string DeploymentDeleted = "deployment.deleted";
    public const string DeploymentRedeployed = "deployment.redeployed";

    // Billing
    public const string SubscriptionCreated = "billing.subscription_created";
    public const string SubscriptionCanceled = "billing.subscription_canceled";
    public const string PaymentFailed = "billing.payment_failed";

    // Settings
    public const string SettingsUpdated = "settings.updated";
    public const string ApiKeyChanged = "settings.api_key_changed";
}
