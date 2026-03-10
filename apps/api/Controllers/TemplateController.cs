using ClawCommerce.Api.Data;
using ClawCommerce.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace ClawCommerce.Api.Controllers;

[ApiController]
[Route("api/templates")]
[EnableRateLimiting("global")]
public class TemplateController : ControllerBase
{
    private readonly ClawCommerceDbContext _context;

    public TemplateController(ClawCommerceDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var templates = await _context.AgentTemplates
            .Where(t => t.IsActive)
            .OrderBy(t => t.SortOrder)
            .ToListAsync();
        return Ok(templates);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(string id)
    {
        var template = await _context.AgentTemplates.FindAsync(id);
        return template is null ? NotFound(new { error = "Template not found" }) : Ok(template);
    }
}
