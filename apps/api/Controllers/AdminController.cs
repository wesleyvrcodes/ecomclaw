using ClawCommerce.Api.Data;
using ClawCommerce.Api.Extensions;
using ClawCommerce.Api.Models;
using ClawCommerce.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace ClawCommerce.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/admin")]
[EnableRateLimiting("global")]
public class AdminController : ControllerBase
{
    private static readonly HashSet<string> AdminEmails = new(StringComparer.OrdinalIgnoreCase);

    static AdminController()
    {
        var emails = Environment.GetEnvironmentVariable("ADMIN_EMAILS");
        if (!string.IsNullOrEmpty(emails))
        {
            foreach (var email in emails.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                AdminEmails.Add(email);
        }
    }

    private readonly ClawCommerceDbContext _context;
    private readonly AuditService _audit;

    public AdminController(ClawCommerceDbContext context, AuditService audit)
    {
        _context = context;
        _audit = audit;
    }

    private async Task<bool> IsAdminAsync()
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId)) return false;
        var user = await _context.Users.FindAsync(userId);
        return user != null && AdminEmails.Contains(user.Email);
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        if (!await IsAdminAsync())
            return Forbid();

        var totalUsers = await _context.Users.CountAsync();
        var totalAgents = await _context.Agents.CountAsync();
        var totalStores = await _context.Stores.CountAsync();
        var totalDeployments = await _context.Deployments.CountAsync();

        var runningAgents = await _context.Agents.CountAsync(a => a.Status == Models.AgentStatus.Running);
        var stoppedAgents = await _context.Agents.CountAsync(a => a.Status == Models.AgentStatus.Stopped);
        var errorAgents = await _context.Agents.CountAsync(a => a.Status == Models.AgentStatus.Error);

        var plans = await _context.Users
            .GroupBy(u => u.Plan)
            .Select(g => new { Plan = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Plan ?? "free", x => x.Count);

        return Ok(new
        {
            totalUsers,
            totalAgents,
            totalStores,
            totalDeployments,
            runningAgents,
            stoppedAgents,
            errorAgents,
            plans
        });
    }

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers()
    {
        if (!await IsAdminAsync())
            return Forbid();

        var users = await _context.Users
            .OrderByDescending(u => u.CreatedAt)
            .Select(u => new
            {
                u.Id,
                u.Email,
                u.Name,
                u.Plan,
                AgentCount = _context.Agents.Count(a => a.UserId == u.Id),
                StoreCount = _context.Stores.Count(s => s.UserId == u.Id),
                u.CreatedAt
            })
            .ToListAsync();

        return Ok(users);
    }

    [HttpPut("users/{userId}/plan")]
    public async Task<IActionResult> SetPlan(string userId, [FromBody] SetPlanRequest request)
    {
        if (!await IsAdminAsync())
            return Forbid();

        var user = await _context.Users.FindAsync(userId)
            ?? await _context.Users.FirstOrDefaultAsync(u => u.Email == userId);
        if (user == null)
            return NotFound(new { error = "User not found" });

        var validPlans = new[] { "none", "starter", "pro", "business" };
        if (!validPlans.Contains(request.Plan))
            return BadRequest(new { error = $"Invalid plan. Must be one of: {string.Join(", ", validPlans)}" });

        var oldPlan = user.Plan;
        user.Plan = request.Plan;
        await _context.SaveChangesAsync();

        await _audit.LogAsync(HttpContext, AuditActions.SettingsUpdated, "User", userId, $"Plan changed: {oldPlan} → {request.Plan}");

        return Ok(new { user.Id, user.Email, user.Plan });
    }
}

public record SetPlanRequest(string Plan);
