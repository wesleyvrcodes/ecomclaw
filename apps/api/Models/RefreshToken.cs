namespace ClawCommerce.Api.Models;

/// <summary>
/// Refresh token for JWT rotation (Rule #01).
/// Access tokens: 15 min. Refresh tokens: 7 days, single-use with rotation.
/// </summary>
public class RefreshToken
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string UserId { get; set; } = string.Empty;
    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsRevoked { get; set; }
    public string? ReplacedByTokenId { get; set; }
    public string? RevokedReason { get; set; }
}
