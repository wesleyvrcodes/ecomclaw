using System.Text;
using System.Threading.RateLimiting;
using ClawCommerce.Api.Data;
using ClawCommerce.Api.Hubs;
using ClawCommerce.Api.Models;
using ClawCommerce.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Load .env file if it exists
DotNetEnv.Env.TraversePath().Load();

// Map environment variables to configuration sections
builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
{
    // JWT
    ["JWT_SECRET"] = Environment.GetEnvironmentVariable("JWT_SECRET"),

    // Hetzner
    ["Hetzner:MockMode"] = Environment.GetEnvironmentVariable("HETZNER_MOCK_MODE"),
    ["Hetzner:ApiToken"] = Environment.GetEnvironmentVariable("HETZNER_API_TOKEN"),
    ["Hetzner:Location"] = Environment.GetEnvironmentVariable("HETZNER_LOCATION"),
    ["Hetzner:ServerType"] = Environment.GetEnvironmentVariable("HETZNER_SERVER_TYPE"),
    ["Hetzner:SshKeyName"] = Environment.GetEnvironmentVariable("HETZNER_SSH_KEY_NAME"),
    ["Hetzner:FirewallId"] = Environment.GetEnvironmentVariable("HETZNER_FIREWALL_ID"),
    ["Hetzner:AgentImage"] = Environment.GetEnvironmentVariable("HETZNER_AGENT_IMAGE"),

    // Cloudflare
    ["Cloudflare:MockMode"] = Environment.GetEnvironmentVariable("CLOUDFLARE_MOCK_MODE"),
    ["Cloudflare:ApiToken"] = Environment.GetEnvironmentVariable("CLOUDFLARE_API_TOKEN"),
    ["Cloudflare:AccountId"] = Environment.GetEnvironmentVariable("CLOUDFLARE_ACCOUNT_ID"),
    ["Cloudflare:ZoneId"] = Environment.GetEnvironmentVariable("CLOUDFLARE_ZONE_ID"),
    ["Cloudflare:TunnelDomain"] = Environment.GetEnvironmentVariable("CLOUDFLARE_TUNNEL_DOMAIN"),

    // Docker Hub credentials (for VPS image pulls)
    ["Docker:Username"] = Environment.GetEnvironmentVariable("DOCKER_USERNAME"),
    ["Docker:Token"] = Environment.GetEnvironmentVariable("DOCKER_TOKEN"),

    // Encryption (Rule #04: key rotation support)
    ["Encryption:MasterKey"] = Environment.GetEnvironmentVariable("ENCRYPTION_MASTER_KEY"),
    ["Encryption:PreviousMasterKey"] = Environment.GetEnvironmentVariable("ENCRYPTION_PREVIOUS_MASTER_KEY"),

    // Stripe
    ["Stripe:SecretKey"] = Environment.GetEnvironmentVariable("STRIPE_SECRET_KEY"),
    ["Stripe:WebhookSecret"] = Environment.GetEnvironmentVariable("STRIPE_WEBHOOK_SECRET"),
    ["Stripe:PriceIdStarter"] = Environment.GetEnvironmentVariable("STRIPE_PRICE_ID_STARTER"),
    ["Stripe:PriceIdPro"] = Environment.GetEnvironmentVariable("STRIPE_PRICE_ID_PRO"),
    ["Stripe:PriceIdBusiness"] = Environment.GetEnvironmentVariable("STRIPE_PRICE_ID_BUSINESS"),

    // URLs
    ["Api:BaseUrl"] = Environment.GetEnvironmentVariable("API_BASE_URL"),
    ["Frontend:Url"] = Environment.GetEnvironmentVariable("FRONTEND_URL"),
}.Where(kv => kv.Value != null)!);

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddSignalR(options =>
{
    options.KeepAliveInterval = TimeSpan.FromSeconds(15);
    options.ClientTimeoutInterval = TimeSpan.FromMinutes(5);
    options.MaximumReceiveMessageSize = 1024 * 1024; // 1MB for file attachments
});

// Database
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? Environment.GetEnvironmentVariable("CONNECTION_STRING")
    ?? throw new InvalidOperationException("CONNECTION_STRING is not configured. Set it in .env or environment variables.");
var dataSourceBuilder = new Npgsql.NpgsqlDataSourceBuilder(connectionString);
dataSourceBuilder.EnableDynamicJson();
var dataSource = dataSourceBuilder.Build();
builder.Services.AddDbContext<ClawCommerceDbContext>(options =>
    options.UseNpgsql(dataSource));

// Register services
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<AuditService>();

// Register ShopifyService with HttpClient
builder.Services.AddHttpClient<ShopifyService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(15);
});

// Register Hetzner, Cloudflare, and deployment services
builder.Services.AddHttpClient<HetznerService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(60);
});
builder.Services.AddHttpClient<CloudflareService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
});
builder.Services.AddSingleton<EncryptionService>();
builder.Services.AddScoped<DeploymentService>();
builder.Services.AddSingleton<SopParserService>();
builder.Services.AddSingleton<OpenClawConfigService>();
builder.Services.AddScoped<BillingService>();
builder.Services.AddScoped<ApiUsageService>();
builder.Services.AddSingleton<ChatBridgeService>();
builder.Services.AddHostedService<HealthCheckService>();
builder.Services.AddHostedService<BackupService>();

// Rule #13: Rate limiting — per-IP and per-user limits
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    // Default global limiter: 100 requests per minute per IP (applies to all endpoints)
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 100,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    // Named "global" policy for backwards compatibility with [EnableRateLimiting("global")]
    options.AddPolicy("global", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 100,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    // Auth endpoints: 10 requests per minute per IP (brute-force protection)
    options.AddPolicy("auth", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    // File upload: 5 per minute per user
    options.AddPolicy("upload", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.User.FindFirst("sub")?.Value ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));

    // Webhook: 50 per minute (Stripe retries)
    options.AddPolicy("webhook", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: "webhook-global",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 50,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
});

// Configure JWT Authentication
var jwtSecret = Environment.GetEnvironmentVariable("JWT_SECRET")
    ?? throw new InvalidOperationException("JWT_SECRET is not configured. Set it in .env or environment variables.");
var jwtKey = Encoding.UTF8.GetBytes(jwtSecret);
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(jwtKey),
        ValidateIssuer = true,
        ValidIssuer = AuthService.Issuer,
        ValidateAudience = true,
        ValidAudience = AuthService.Audience,
        ValidateLifetime = true,
        ClockSkew = TimeSpan.Zero
    };

    // Allow JWT token to be passed via query string for SignalR
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        }
    };
});

builder.Services.AddAuthorization();

var corsOrigins = (Environment.GetEnvironmentVariable("CORS_ORIGINS") ?? "http://localhost:3000")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(corsOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

// Initialize database
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<ClawCommerceDbContext>();
    await SeedData.InitializeAsync(context);
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}
else
{
    // Rule #23: Production-only security hardening
    app.UseHsts();
    app.UseHttpsRedirection();
}

// Rule #15: Security headers (all environments)
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["X-XSS-Protection"] = "0";
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    context.Response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
    if (!app.Environment.IsDevelopment())
    {
        context.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
    }
    await next();
});

app.UseCors("AllowFrontend");
app.UseRateLimiter();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<ChatHub>("/hubs/chat").RequireCors("AllowFrontend");

app.MapGet("/api/health", () => Results.Ok(new { Status = "Healthy", Timestamp = DateTime.UtcNow }));

app.Run();
