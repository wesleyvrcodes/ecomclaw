using ClawCommerce.Api.Extensions;
using ClawCommerce.Api.Models;
using ClawCommerce.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace ClawCommerce.Api.Controllers;

[ApiController]
[Route("api/billing")]
[EnableRateLimiting("global")]
public class BillingController : ControllerBase
{
    private readonly BillingService _billing;
    private readonly AuditService _audit;

    public BillingController(BillingService billing, AuditService audit)
    {
        _billing = billing;
        _audit = audit;
    }

    [Authorize]
    [HttpPost("checkout")]
    public async Task<IActionResult> CreateCheckout([FromBody] CheckoutRequest request)
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        if (!_billing.IsConfigured)
            return BadRequest(new { error = "Billing not configured" });

        try
        {
            var url = await _billing.CreateCheckoutSession(userId, request.PriceId);
            // Rule #12: Validate redirect URL against allow-list
            var allowedHosts = new[] { "checkout.stripe.com", "billing.stripe.com" };
            if (Uri.TryCreate(url, UriKind.Absolute, out var uri) && !allowedHosts.Contains(uri.Host))
                return BadRequest(new { error = "Invalid checkout URL" });
            await _audit.LogAsync(HttpContext, AuditActions.SubscriptionCreated, "Billing", userId, $"Plan: {request.PriceId}");
            return Ok(new { url });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [Authorize]
    [HttpPost("portal")]
    public async Task<IActionResult> CreatePortal()
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        if (!_billing.IsConfigured)
            return BadRequest(new { error = "Billing not configured" });

        try
        {
            var url = await _billing.CreatePortalSession(userId);
            var allowedHosts = new[] { "billing.stripe.com", "checkout.stripe.com" };
            if (Uri.TryCreate(url, UriKind.Absolute, out var uri) && !allowedHosts.Contains(uri.Host))
                return BadRequest(new { error = "Invalid portal URL" });
            return Ok(new { url });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("webhook")]
    [EnableRateLimiting("webhook")]
    public async Task<IActionResult> Webhook()
    {
        if (!_billing.IsConfigured)
            return Ok();

        var json = await new StreamReader(HttpContext.Request.Body).ReadToEndAsync();
        var signature = Request.Headers["Stripe-Signature"].FirstOrDefault();

        if (string.IsNullOrEmpty(signature))
            return BadRequest(new { error = "Missing Stripe-Signature" });

        try
        {
            await _billing.HandleWebhook(json, signature);
            return Ok();
        }
        catch (Stripe.StripeException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [Authorize]
    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        var userId = User.GetUserId();
        if (string.IsNullOrEmpty(userId))
            return Unauthorized(new { error = "Invalid token" });

        try
        {
            var status = await _billing.GetSubscriptionStatus(userId);
            return Ok(status);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}

public record CheckoutRequest(string PriceId);
