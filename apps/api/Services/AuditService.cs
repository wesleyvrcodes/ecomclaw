using ClawCommerce.Api.Data;
using ClawCommerce.Api.Models;

namespace ClawCommerce.Api.Services;

/// <summary>
/// Audit logging service (Rule #20).
/// Logs critical actions: deletions, role changes, payments, exports, auth events.
/// </summary>
public class AuditService
{
    private readonly ClawCommerceDbContext _context;
    private readonly ILogger<AuditService> _logger;

    public AuditService(ClawCommerceDbContext context, ILogger<AuditService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task LogAsync(string action, string entityType, string? entityId = null,
        string? userId = null, string? details = null, string? ipAddress = null, string? userAgent = null)
    {
        var entry = new AuditLog
        {
            UserId = userId,
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            Details = details,
            IpAddress = ipAddress,
            UserAgent = userAgent,
            Timestamp = DateTime.UtcNow
        };

        _context.AuditLogs.Add(entry);

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            // Audit logging should never break the request — log and continue
            _logger.LogError(ex, "Failed to write audit log: {Action} {EntityType} {EntityId}", action, entityType, entityId);
        }
    }

    public Task LogAsync(HttpContext httpContext, string action, string entityType,
        string? entityId = null, string? details = null)
    {
        var userId = httpContext.User.FindFirst("sub")?.Value
                     ?? httpContext.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var ip = httpContext.Connection.RemoteIpAddress?.ToString();
        var ua = httpContext.Request.Headers.UserAgent.FirstOrDefault();

        return LogAsync(action, entityType, entityId, userId, details, ip, ua);
    }
}
