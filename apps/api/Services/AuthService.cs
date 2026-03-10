using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using ClawCommerce.Api.Data;
using ClawCommerce.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace ClawCommerce.Api.Services;

public class AuthService
{
    public const string Issuer = "ClawCommerce";
    public const string Audience = "ClawCommerce";

    // Rule #01: Access token 15 min, refresh token 7 days
    private static readonly TimeSpan AccessTokenExpiry = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan RefreshTokenExpiry = TimeSpan.FromDays(7);
    private const int BcryptWorkFactor = 12;

    private readonly ClawCommerceDbContext _context;
    private readonly string _jwtSecret;

    public AuthService(ClawCommerceDbContext context, IConfiguration configuration)
    {
        _context = context;
        _jwtSecret = Environment.GetEnvironmentVariable("JWT_SECRET")
            ?? configuration["JWT_SECRET"]
            ?? throw new InvalidOperationException("JWT_SECRET is not configured.");
    }

    public async Task<(AuthResponse? Response, string? Error, int StatusCode)> RegisterAsync(RegisterRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();

        if (!IsValidEmail(email))
            return (null, "Invalid email format", 400);

        if (string.IsNullOrWhiteSpace(request.Name))
            return (null, "Name is required", 400);

        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
            return (null, "Password must be at least 8 characters", 400);

        if (await _context.Users.AnyAsync(u => u.Email == email))
            return (null, "An account with this email already exists", 409);

        var user = new User
        {
            Id = Guid.NewGuid().ToString(),
            Email = email,
            Name = request.Name.Trim(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password, BcryptWorkFactor),
            CreatedAt = DateTime.UtcNow
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var accessToken = GenerateAccessToken(user);
        var refreshToken = await GenerateRefreshToken(user.Id);

        return (new AuthResponse
        {
            Token = accessToken,
            RefreshToken = refreshToken.Token,
            ExpiresIn = (int)AccessTokenExpiry.TotalSeconds,
            User = new UserResponse { Id = user.Id, Email = user.Email, Name = user.Name }
        }, null, 200);
    }

    public async Task<(AuthResponse? Response, string? Error, int StatusCode)> LoginAsync(LoginRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == email);

        if (user is null)
            return (null, "Invalid email or password", 401);

        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return (null, "Invalid email or password", 401);

        var accessToken = GenerateAccessToken(user);
        var refreshToken = await GenerateRefreshToken(user.Id);

        return (new AuthResponse
        {
            Token = accessToken,
            RefreshToken = refreshToken.Token,
            ExpiresIn = (int)AccessTokenExpiry.TotalSeconds,
            User = new UserResponse { Id = user.Id, Email = user.Email, Name = user.Name }
        }, null, 200);
    }

    /// <summary>
    /// Rotate refresh token — issues new access + refresh token, revokes old one.
    /// Rule #01: Single-use refresh tokens with rotation.
    /// </summary>
    public async Task<(AuthResponse? Response, string? Error, int StatusCode)> RefreshAsync(string refreshTokenValue)
    {
        var existing = await _context.RefreshTokens
            .FirstOrDefaultAsync(t => t.Token == refreshTokenValue);

        if (existing is null)
            return (null, "Invalid refresh token", 401);

        if (existing.IsRevoked)
        {
            // Token reuse detected — revoke entire chain (possible theft)
            await RevokeAllUserTokens(existing.UserId, "Token reuse detected");
            return (null, "Token has been revoked — all sessions invalidated for security", 401);
        }

        if (existing.ExpiresAt < DateTime.UtcNow)
            return (null, "Refresh token expired", 401);

        var user = await _context.Users.FindAsync(existing.UserId);
        if (user is null)
            return (null, "User not found", 401);

        // Revoke old token
        existing.IsRevoked = true;
        existing.RevokedReason = "Rotated";

        // Issue new tokens
        var newAccessToken = GenerateAccessToken(user);
        var newRefreshToken = await GenerateRefreshToken(user.Id);
        existing.ReplacedByTokenId = newRefreshToken.Id;

        await _context.SaveChangesAsync();

        return (new AuthResponse
        {
            Token = newAccessToken,
            RefreshToken = newRefreshToken.Token,
            ExpiresIn = (int)AccessTokenExpiry.TotalSeconds,
            User = new UserResponse { Id = user.Id, Email = user.Email, Name = user.Name }
        }, null, 200);
    }

    /// <summary>
    /// Revoke a specific refresh token (logout).
    /// </summary>
    public async Task RevokeTokenAsync(string refreshTokenValue)
    {
        var token = await _context.RefreshTokens
            .FirstOrDefaultAsync(t => t.Token == refreshTokenValue && !t.IsRevoked);

        if (token is not null)
        {
            token.IsRevoked = true;
            token.RevokedReason = "User logout";
            await _context.SaveChangesAsync();
        }
    }

    /// <summary>
    /// Delete user account and all associated data (Rule #21 — GDPR right to erasure).
    /// </summary>
    public async Task<bool> DeleteAccountAsync(string userId)
    {
        var user = await _context.Users.FindAsync(userId);
        if (user is null) return false;

        // Revoke all refresh tokens
        await RevokeAllUserTokens(userId, "Account deleted");

        // Delete chat messages (via agents)
        var agentIds = await _context.Agents
            .Where(a => a.UserId == userId)
            .Select(a => a.Id)
            .ToListAsync();
        var chatMessages = await _context.ChatMessages
            .Where(m => agentIds.Contains(m.AgentId))
            .ToListAsync();
        _context.ChatMessages.RemoveRange(chatMessages);

        // Delete deployments
        var deployments = await _context.Deployments
            .Where(d => d.UserId == userId)
            .ToListAsync();
        _context.Deployments.RemoveRange(deployments);

        // Delete agents
        var agents = await _context.Agents.Where(a => a.UserId == userId).ToListAsync();
        _context.Agents.RemoveRange(agents);

        // Delete stores
        var stores = await _context.Stores.Where(s => s.UserId == userId).ToListAsync();
        _context.Stores.RemoveRange(stores);

        // Delete settings
        var settings = await _context.UserSettings.FindAsync(userId);
        if (settings is not null)
            _context.UserSettings.Remove(settings);

        // Delete user
        _context.Users.Remove(user);

        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<User?> GetUserByIdAsync(string id)
    {
        return await _context.Users.FindAsync(id);
    }

    private string GenerateAccessToken(User user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSecret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim("name", user.Name),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var token = new JwtSecurityToken(
            issuer: Issuer,
            audience: Audience,
            claims: claims,
            expires: DateTime.UtcNow.Add(AccessTokenExpiry),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private async Task<RefreshToken> GenerateRefreshToken(string userId)
    {
        var token = new RefreshToken
        {
            UserId = userId,
            Token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)),
            ExpiresAt = DateTime.UtcNow.Add(RefreshTokenExpiry),
            CreatedAt = DateTime.UtcNow
        };

        _context.RefreshTokens.Add(token);
        await _context.SaveChangesAsync();

        return token;
    }

    private async Task RevokeAllUserTokens(string userId, string reason)
    {
        var tokens = await _context.RefreshTokens
            .Where(t => t.UserId == userId && !t.IsRevoked)
            .ToListAsync();

        foreach (var token in tokens)
        {
            token.IsRevoked = true;
            token.RevokedReason = reason;
        }

        await _context.SaveChangesAsync();
    }

    private static bool IsValidEmail(string email)
    {
        if (string.IsNullOrWhiteSpace(email)) return false;
        try
        {
            var addr = new System.Net.Mail.MailAddress(email);
            return addr.Address == email;
        }
        catch { return false; }
    }
}
