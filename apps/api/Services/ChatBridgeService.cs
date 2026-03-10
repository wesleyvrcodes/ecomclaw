using System.Text;
using System.Text.Json;
using ClawCommerce.Api.Data;
using ClawCommerce.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ClawCommerce.Api.Services;

public class ChatBridgeService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<ChatBridgeService> _logger;

    public ChatBridgeService(
        IServiceScopeFactory scopeFactory,
        IHttpClientFactory httpClientFactory,
        ILogger<ChatBridgeService> logger)
    {
        _scopeFactory = scopeFactory;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    /// <summary>
    /// Streams a response token-by-token via the Cloudflare Tunnel (HTTPS).
    /// Handles auto-waking stopped servers.
    /// </summary>
    public async Task<ChatBridgeResult> StreamResponse(
        string userId,
        string agentId,
        string message,
        List<FileAttachment>? files = null,
        Func<string, Task>? onToken = null,
        Func<string, Task>? onStatus = null,
        CancellationToken ct = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ClawCommerceDbContext>();

        var agent = await context.Agents.FindAsync(new object[] { agentId }, ct);
        if (agent == null)
            return ChatBridgeResult.Error("Agent not found");
        if (agent.UserId != userId)
            return ChatBridgeResult.Error("Not your agent");

        // Save user message
        var userMsg = new ChatMessage
        {
            Id = $"msg-{Guid.NewGuid():N}"[..16],
            AgentId = agentId,
            UserId = userId,
            Content = message,
            IsUser = true,
            Timestamp = DateTime.UtcNow
        };
        context.ChatMessages.Add(userMsg);
        await context.SaveChangesAsync(ct);

        var deployment = await context.Deployments
            .FirstOrDefaultAsync(d => d.AgentId == agentId, ct);

        string fullResponse;

        // Check if deployment is reachable (via tunnel URL or direct IP in MockMode)
        var deploymentService = scope.ServiceProvider.GetRequiredService<DeploymentService>();
        var reachable = deployment != null && deploymentService.GetAgentBaseUrl(deployment) != null;

        if (!reachable)
        {
            var errorMsg = "**Can't reach agent — not deployed yet.**\n\n" +
                           "- No VPS deployment found. Deploy the agent first.\n" +
                           "- Go to the Agent Store to deploy.";

            foreach (var word in errorMsg.Split(' '))
            {
                if (onToken != null) await onToken(word + " ");
                await Task.Delay(15, ct);
            }
            fullResponse = errorMsg;
        }
        else
        {
            // Push latest agent settings before every chat message so agent always has current config
            try
            {
                if (agent.Configuration.Count > 0)
                {
                    var baseUrl = deploymentService.GetAgentBaseUrl(deployment!);
                    if (baseUrl != null)
                    {
                        using var settingsClient = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
                        string gwToken;
                        try
                        {
                            var enc = scope.ServiceProvider.GetRequiredService<EncryptionService>();
                            gwToken = enc.Decrypt(deployment!.GatewayToken);
                        }
                        catch { gwToken = deployment!.GatewayToken; }

                        var settingsReq = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/config")
                        {
                            Content = System.Net.Http.Json.JsonContent.Create(new { agentSettings = agent.Configuration })
                        };
                        settingsReq.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", gwToken);
                        await settingsClient.SendAsync(settingsReq, ct);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to push settings before chat for agent {AgentId}", agentId);
            }

            var (streamedText, usageInput, usageOutput, usageModel) =
                await StreamFromAgent(deployment!, message, files, onToken, onStatus, ct);
            fullResponse = streamedText;

            // Record token usage
            if (usageInput > 0 || usageOutput > 0)
            {
                try
                {
                    using var usageScope = _scopeFactory.CreateScope();
                    var usageService = usageScope.ServiceProvider.GetRequiredService<ApiUsageService>();
                    var costCents = ApiUsageService.ComputeCostCents(usageModel, usageInput, usageOutput);
                    await usageService.RecordUsageAsync(userId, agentId, usageModel, usageInput, usageOutput, costCents);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to record usage for agent {AgentId}", agentId);
                }
            }
        }

        // Save agent response
        var agentMsg = new ChatMessage
        {
            Id = $"msg-{Guid.NewGuid():N}"[..16],
            AgentId = agentId,
            UserId = userId,
            Content = fullResponse,
            IsUser = false,
            Timestamp = DateTime.UtcNow
        };
        context.ChatMessages.Add(agentMsg);
        await context.SaveChangesAsync(ct);

        return ChatBridgeResult.Success(fullResponse, agentMsg.Id, agentMsg.Timestamp);
    }

    private async Task<(string Response, int InputTokens, int OutputTokens, string Model)> StreamFromAgent(
        Deployment deployment,
        string message,
        List<FileAttachment>? files,
        Func<string, Task>? onToken,
        Func<string, Task>? onStatus,
        CancellationToken ct)
    {
        using var urlScope = _scopeFactory.CreateScope();
        var deploymentService = urlScope.ServiceProvider.GetRequiredService<DeploymentService>();

        // Auto-wake stopped server
        if (deployment.Status is DeploymentStatus.Sleeping or DeploymentStatus.Stopped)
        {
            if (onStatus != null)
                await onStatus("waking");

            using var wakeScope = _scopeFactory.CreateScope();
            var hetznerService = wakeScope.ServiceProvider.GetRequiredService<HetznerService>();

            await hetznerService.PowerOn(deployment.ServerId);

            // Wait for server to be running (max 60s)
            for (int i = 0; i < 60; i++)
            {
                await Task.Delay(1000, ct);
                var status = await hetznerService.GetServerStatus(deployment.ServerId);
                if (status == "running") break;
                if (i == 59)
                    return ("Error: Server failed to start within 60 seconds.", 0, 0, "");
            }

            // Wait for agent to be healthy (max 30s)
            if (onStatus != null)
                await onStatus("starting_agent");

            var healthy = false;
            for (int i = 0; i < 30; i++)
            {
                await Task.Delay(1000, ct);
                try
                {
                    using var hc = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
                    var wakeBaseUrl = deploymentService.GetAgentBaseUrl(deployment) ?? deployment.TunnelUrl;
                    var healthResp = await hc.GetAsync($"{wakeBaseUrl}/health", ct);
                    if (healthResp.IsSuccessStatusCode) { healthy = true; break; }
                }
                catch { /* agent not ready yet */ }
            }

            if (!healthy)
                return ("Error: Agent failed to start. The server is running but the agent is not responding.", 0, 0, "");

            if (onStatus != null)
                await onStatus("ready");
        }

        // Decrypt gateway token
        string gatewayToken;
        try
        {
            using var cryptScope = _scopeFactory.CreateScope();
            var encryption = cryptScope.ServiceProvider.GetRequiredService<EncryptionService>();
            gatewayToken = encryption.Decrypt(deployment.GatewayToken);
        }
        catch
        {
            // Fallback: token might not be encrypted yet (pre-migration data)
            gatewayToken = deployment.GatewayToken;
        }

        var client = _httpClientFactory.CreateClient();
        client.Timeout = TimeSpan.FromMinutes(5); // Agent tool calls can take several minutes
        var baseUrl = deploymentService.GetAgentBaseUrl(deployment);
        if (baseUrl == null)
            return ("**Can't reach agent — no URL available.**\n\nCheck the deployment status on the Agents page.", 0, 0, "");
        var gatewayUrl = $"{baseUrl}/chat";

        var request = new HttpRequestMessage(HttpMethod.Post, gatewayUrl);
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", gatewayToken);

        var requestBody = new Dictionary<string, object>
        {
            ["message"] = message,
            ["sessionId"] = $"{deployment.AgentId}-{deployment.UserId}",
            ["stream"] = true // Request SSE streaming from agent
        };
        if (files != null && files.Count > 0)
        {
            requestBody["files"] = files.Select(f => new { name = f.Name, type = f.Type, data = f.Data }).ToArray();
        }
        request.Content = new StringContent(
            JsonSerializer.Serialize(requestBody),
            Encoding.UTF8,
            "application/json");
        request.Headers.Accept.Add(new System.Net.Http.Headers.MediaTypeWithQualityHeaderValue("text/event-stream"));

        HttpResponseMessage response;
        try
        {
            response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Failed to connect to agent at {Url}", gatewayUrl);
            return ("**Can't reach agent — server is not available.**\n\n" +
                   "- The agent's server may still be starting up.\n" +
                   "- Check the deployment status on the Agents page.", 0, 0, "");
        }

        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync(ct);
            _logger.LogError("Agent request failed: {Status} {Body}", response.StatusCode, errorBody);

            var userMessage = $"Agent returned an error (HTTP {(int)response.StatusCode}).";
            try
            {
                using var doc = JsonDocument.Parse(errorBody);
                var root = doc.RootElement;
                if (root.TryGetProperty("details", out var detailsProp))
                    userMessage = detailsProp.GetString() ?? userMessage;
                else if (root.TryGetProperty("error", out var errorProp))
                    userMessage = errorProp.GetString() ?? userMessage;
            }
            catch (JsonException) { }

            return ($"**Agent error:** {userMessage}", 0, 0, "");
        }

        var fullResponse = new StringBuilder();
        int usageInputTokens = 0, usageOutputTokens = 0;
        string usageModel = "";
        var contentType = response.Content.Headers.ContentType?.MediaType ?? "";

        if (contentType.Contains("text/event-stream"))
        {
            // Parse SSE stream — live updates from agent
            using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var reader = new StreamReader(stream);

            string? currentEvent = null;
            while (!reader.EndOfStream)
            {
                var line = await reader.ReadLineAsync(ct);
                if (line == null) break;

                if (line.StartsWith("event: "))
                {
                    currentEvent = line[7..];
                }
                else if (line.StartsWith("data: ") && currentEvent != null)
                {
                    var data = line[6..];
                    try
                    {
                        using var doc = JsonDocument.Parse(data);
                        var root = doc.RootElement;

                        switch (currentEvent)
                        {
                            case "text":
                                // Intermediate text — stream to client and accumulate
                                if (root.TryGetProperty("text", out var textProp))
                                {
                                    var text = textProp.GetString() ?? "";
                                    fullResponse.Append(text);
                                    if (onToken != null) await onToken(text);
                                }
                                break;

                            case "tool_start":
                                // Agent is calling a tool — show status
                                if (root.TryGetProperty("tool", out var toolProp) && onStatus != null)
                                {
                                    var toolName = toolProp.GetString() ?? "";
                                    var friendlyName = ToolFriendlyName(toolName);
                                    await onStatus($"tool:{friendlyName}");
                                }
                                break;

                            case "tool_done":
                                // Tool finished
                                break;

                            case "response":
                                // Final response — replaces any intermediate text
                                if (root.TryGetProperty("response", out var respProp))
                                {
                                    fullResponse.Clear();
                                    fullResponse.Append(respProp.GetString() ?? "");
                                }
                                break;

                            case "error":
                                if (root.TryGetProperty("details", out var detProp))
                                    fullResponse.Append($"**Agent error:** {detProp.GetString()}");
                                else if (root.TryGetProperty("error", out var errProp))
                                    fullResponse.Append($"**Agent error:** {errProp.GetString()}");
                                break;

                            case "usage":
                                if (root.TryGetProperty("inputTokens", out var inTok))
                                    usageInputTokens = inTok.GetInt32();
                                if (root.TryGetProperty("outputTokens", out var outTok))
                                    usageOutputTokens = outTok.GetInt32();
                                if (root.TryGetProperty("model", out var modelProp2))
                                    usageModel = modelProp2.GetString() ?? "";
                                break;

                            case "done":
                                break;
                        }
                    }
                    catch (JsonException) { }
                    currentEvent = null;
                }
                else if (string.IsNullOrEmpty(line))
                {
                    currentEvent = null;
                }
            }
        }
        else
        {
            // Fallback: parse JSON response (non-streaming)
            var responseBody = await response.Content.ReadAsStringAsync(ct);
            try
            {
                using var doc = JsonDocument.Parse(responseBody);
                if (doc.RootElement.TryGetProperty("response", out var responseProp))
                {
                    var agentResponse = responseProp.GetString() ?? "";
                    fullResponse.Append(agentResponse);
                    if (onToken != null) await onToken(agentResponse);
                }
                else if (doc.RootElement.TryGetProperty("error", out var errorProp))
                {
                    fullResponse.Append(errorProp.GetString() ?? "Unknown error");
                    if (onToken != null) await onToken(fullResponse.ToString());
                }

                // Extract usage from JSON response
                if (doc.RootElement.TryGetProperty("usage", out var usageProp))
                {
                    if (usageProp.TryGetProperty("inputTokens", out var jIn))
                        usageInputTokens = jIn.GetInt32();
                    if (usageProp.TryGetProperty("outputTokens", out var jOut))
                        usageOutputTokens = jOut.GetInt32();
                }
                if (doc.RootElement.TryGetProperty("model", out var jModel))
                    usageModel = jModel.GetString() ?? "";
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex, "Failed to parse agent response");
                fullResponse.Append("Error: Could not parse agent response.");
                if (onToken != null) await onToken(fullResponse.ToString());
            }
        }

        return (fullResponse.ToString().TrimEnd(), usageInputTokens, usageOutputTokens, usageModel);
    }

    private static string ToolFriendlyName(string toolName) => toolName switch
    {
        "shopify_get_products" => "Loading products",
        "shopify_get_product" => "Reading product",
        "shopify_create_product" => "Creating product",
        "shopify_update_product" => "Updating product (variants/images)",
        "shopify_get_orders" => "Loading orders",
        "shopify_get_collections" => "Loading collections",
        "fetch_url" => "Fetching URL",
        "save_memory" => "Saving memory",
        "read_worksheet" => "Reading worksheet",
        "update_worksheet_row" => "Updating worksheet",
        "delete_worksheet_row" => "Updating worksheet",
        _ => toolName.Replace("_", " ")
    };
}

public class ChatBridgeResult
{
    public bool IsSuccess { get; set; }
    public string FullMessage { get; set; } = string.Empty;
    public string MessageId { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
    public string? ErrorMessage { get; set; }

    public static ChatBridgeResult Success(string fullMessage, string messageId, DateTime timestamp)
        => new() { IsSuccess = true, FullMessage = fullMessage, MessageId = messageId, Timestamp = timestamp };

    public static ChatBridgeResult Error(string error)
        => new() { IsSuccess = false, ErrorMessage = error };
}
