using ClawCommerce.Api.Data;
using ClawCommerce.Api.Extensions;
using ClawCommerce.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace ClawCommerce.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/chat")]
[EnableRateLimiting("global")]
public class ChatController : ControllerBase
{
    private readonly ClawCommerceDbContext _context;

    public ChatController(ClawCommerceDbContext context)
    {
        _context = context;
    }

    [HttpGet("{agentId}/history")]
    public async Task<IActionResult> GetHistory(
        string agentId,
        [FromQuery] DateTime? before = null,
        [FromQuery] int limit = 50)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        var agent = await _context.Agents.FindAsync(agentId);
        if (agent is null)
            return NotFound(new { error = "Agent not found" });
        if (agent.UserId != userId)
            return Forbid();

        limit = Math.Clamp(limit, 1, 100);

        var query = _context.ChatMessages
            .Where(m => m.AgentId == agentId);

        if (before.HasValue)
            query = query.Where(m => m.Timestamp < before.Value);

        var messages = await query
            .OrderByDescending(m => m.Timestamp)
            .Take(limit)
            .ToListAsync();

        // Reverse to chronological order
        messages.Reverse();

        return Ok(messages);
    }
}
