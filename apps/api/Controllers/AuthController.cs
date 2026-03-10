using System.Security.Claims;
using ClawCommerce.Api.Models;
using ClawCommerce.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace ClawCommerce.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly AuthService _authService;
    private readonly AuditService _audit;

    public AuthController(AuthService authService, AuditService audit)
    {
        _authService = authService;
        _audit = audit;
    }

    [HttpPost("register")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(new { error = "All fields are required" });

        var (response, error, statusCode) = await _authService.RegisterAsync(request);

        if (response is null)
        {
            return statusCode switch
            {
                409 => Conflict(new { error }),
                _ => BadRequest(new { error })
            };
        }

        await _audit.LogAsync(HttpContext, AuditActions.Register, "User", response.User.Id);
        return Ok(response);
    }

    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(new { error = "Email and password are required" });

        var (response, error, statusCode) = await _authService.LoginAsync(request);

        if (response is null)
        {
            await _audit.LogAsync(AuditActions.LoginFailed, "User", details: $"Email: {request.Email}",
                ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString());
            return Unauthorized(new { error });
        }

        await _audit.LogAsync(HttpContext, AuditActions.Login, "User", response.User.Id);
        return Ok(response);
    }

    /// <summary>
    /// Rotate refresh token — returns new access + refresh token pair (Rule #01).
    /// </summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RefreshToken))
            return BadRequest(new { error = "Refresh token is required" });

        var (response, error, statusCode) = await _authService.RefreshAsync(request.RefreshToken);

        if (response is null)
            return Unauthorized(new { error });

        await _audit.LogAsync(HttpContext, AuditActions.TokenRefresh, "User", response.User.Id);
        return Ok(response);
    }

    /// <summary>
    /// Revoke refresh token (logout).
    /// </summary>
    [HttpPost("logout")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Logout([FromBody] RefreshRequest request)
    {
        if (!string.IsNullOrWhiteSpace(request.RefreshToken))
            await _authService.RevokeTokenAsync(request.RefreshToken);

        return Ok(new { message = "Logged out" });
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
                     ?? User.FindFirstValue("sub");

        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        var user = await _authService.GetUserByIdAsync(userId);
        if (user is null)
            return Unauthorized(new { error = "User not found" });

        return Ok(new { User = new UserResponse { Id = user.Id, Email = user.Email, Name = user.Name } });
    }

    /// <summary>
    /// Delete account and all data (Rule #21 — GDPR right to erasure).
    /// </summary>
    [HttpDelete("account")]
    [Authorize]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> DeleteAccount()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier)
                     ?? User.FindFirstValue("sub");

        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        await _audit.LogAsync(HttpContext, AuditActions.AccountDeleted, "User", userId);

        var deleted = await _authService.DeleteAccountAsync(userId);
        if (!deleted)
            return NotFound(new { error = "Account not found" });

        return Ok(new { message = "Account and all associated data have been permanently deleted." });
    }
}

public record RefreshRequest(string RefreshToken);
