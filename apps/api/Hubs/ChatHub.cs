using ClawCommerce.Api.Data;
using ClawCommerce.Api.Models;
using ClawCommerce.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace ClawCommerce.Api.Hubs;

[Authorize]
public class ChatHub : Hub
{
    private readonly ClawCommerceDbContext _context;
    private readonly ChatBridgeService _chatBridge;
    private readonly BillingService _billingService;

    public ChatHub(ClawCommerceDbContext context, ChatBridgeService chatBridge, BillingService billingService)
    {
        _context = context;
        _chatBridge = chatBridge;
        _billingService = billingService;
    }

    public async Task JoinAgentChat(string agentId)
    {
        var userId = Context.User?.FindFirst("sub")?.Value
                  ?? Context.User?.FindFirst("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier")?.Value;
        if (string.IsNullOrEmpty(userId)) return;

        var agent = await _context.Agents.FindAsync(agentId);
        if (agent == null || agent.UserId != userId) return;

        await Groups.AddToGroupAsync(Context.ConnectionId, agentId);
        await Clients.Caller.SendAsync("SystemMessage", $"Connected to agent {agentId}");
    }

    public async Task LeaveAgentChat(string agentId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, agentId);
    }

    public async Task SendMessage(string agentId, string message)
    {
        var userId = Context.User?.FindFirst("sub")?.Value
                  ?? Context.User?.FindFirst("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier")?.Value;

        if (string.IsNullOrEmpty(userId))
        {
            await Clients.Caller.SendAsync("ChatError", "Authentication required");
            return;
        }

        // Check active plan
        var (msgAllowed, msgError) = await _billingService.CheckPlanActive(userId);
        if (!msgAllowed)
        {
            await Clients.Caller.SendAsync("ChatError", msgError);
            return;
        }

        // Send typing indicator
        await Clients.Caller.SendAsync("ReceiveTypingStart", agentId);

        try
        {
            var result = await _chatBridge.StreamResponse(
                userId,
                agentId,
                message,
                onToken: async token =>
                {
                    await Clients.Caller.SendAsync("ReceiveToken", new { agentId, token });
                },
                onStatus: async status =>
                {
                    await Clients.Caller.SendAsync("AgentStatus", new { agentId, status });
                },
                ct: Context.ConnectionAborted
            );

            if (result.IsSuccess)
            {
                await Clients.Caller.SendAsync("ReceiveTypingEnd", new
                {
                    agentId,
                    fullMessage = result.FullMessage,
                    messageId = result.MessageId,
                    timestamp = result.Timestamp
                });
            }
            else
            {
                await Clients.Caller.SendAsync("ChatError", result.ErrorMessage);
            }
        }
        catch (Exception)
        {
            await Clients.Caller.SendAsync("ChatError", "An error occurred while processing your message. Please try again.");
        }
    }

    public async Task SendMessageWithFiles(string agentId, string message, List<FileAttachment> files)
    {
        var userId = Context.User?.FindFirst("sub")?.Value
                  ?? Context.User?.FindFirst("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier")?.Value;

        if (string.IsNullOrEmpty(userId))
        {
            await Clients.Caller.SendAsync("ChatError", "Authentication required");
            return;
        }

        var (msgAllowed, msgError) = await _billingService.CheckPlanActive(userId);
        if (!msgAllowed)
        {
            await Clients.Caller.SendAsync("ChatError", msgError);
            return;
        }

        await Clients.Caller.SendAsync("ReceiveTypingStart", agentId);

        try
        {
            var result = await _chatBridge.StreamResponse(
                userId,
                agentId,
                message,
                files: files,
                onToken: async token =>
                {
                    await Clients.Caller.SendAsync("ReceiveToken", new { agentId, token });
                },
                onStatus: async status =>
                {
                    await Clients.Caller.SendAsync("AgentStatus", new { agentId, status });
                },
                ct: Context.ConnectionAborted
            );

            if (result.IsSuccess)
            {
                await Clients.Caller.SendAsync("ReceiveTypingEnd", new
                {
                    agentId,
                    fullMessage = result.FullMessage,
                    messageId = result.MessageId,
                    timestamp = result.Timestamp
                });
            }
            else
            {
                await Clients.Caller.SendAsync("ChatError", result.ErrorMessage);
            }
        }
        catch (Exception)
        {
            await Clients.Caller.SendAsync("ChatError", "An error occurred while processing your message. Please try again.");
        }
    }

    public async Task<List<ChatMessage>> GetHistory(string agentId)
    {
        var userId = Context.User?.FindFirst("sub")?.Value
                  ?? Context.User?.FindFirst("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier")?.Value;
        if (string.IsNullOrEmpty(userId))
            throw new HubException("Authentication required");

        var agent = await _context.Agents.FindAsync(agentId);
        if (agent == null || agent.UserId != userId)
            throw new HubException("Agent not found");

        return await _context.ChatMessages
            .Where(m => m.AgentId == agentId)
            .OrderBy(m => m.Timestamp)
            .ToListAsync();
    }
}
