using ClawCommerce.Api.Extensions;
using ClawCommerce.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace ClawCommerce.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/analytics")]
[EnableRateLimiting("global")]
public class AnalyticsController : ControllerBase
{
    private readonly ApiUsageService _usage;

    public AnalyticsController(ApiUsageService usage)
    {
        _usage = usage;
    }

    /// <summary>
    /// Get AI API usage and cost summary for the current month.
    /// </summary>
    [HttpGet]
    [HttpGet("usage")]
    public async Task<IActionResult> GetUsage()
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        var summary = await _usage.GetUsageSummaryAsync(userId);
        return Ok(summary);
    }
}
