using ClawCommerce.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ClawCommerce.Api.Data;

public class ClawCommerceDbContext : DbContext
{
    public ClawCommerceDbContext(DbContextOptions<ClawCommerceDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Store> Stores => Set<Store>();
    public DbSet<AgentTemplate> AgentTemplates => Set<AgentTemplate>();
    public DbSet<Agent> Agents => Set<Agent>();
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
    public DbSet<Settings> UserSettings => Set<Settings>();
    public DbSet<Deployment> Deployments => Set<Deployment>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<ApiUsage> ApiUsages => Set<ApiUsage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // User
        modelBuilder.Entity<User>(e =>
        {
            e.HasKey(u => u.Id);
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.Email).IsRequired().HasMaxLength(256);
            e.Property(u => u.Name).IsRequired().HasMaxLength(256);
            e.Property(u => u.PasswordHash).IsRequired();
        });

        // Store
        modelBuilder.Entity<Store>(e =>
        {
            e.HasKey(s => s.Id);
            e.HasIndex(s => s.UserId);
            e.Property(s => s.Name).IsRequired().HasMaxLength(256);
            e.Property(s => s.StoreUrl).HasMaxLength(512);
            e.Property(s => s.GrantedScopes).HasColumnType("text[]");
        });

        // AgentTemplate
        modelBuilder.Entity<AgentTemplate>(e =>
        {
            e.HasKey(t => t.Id);
            e.HasIndex(t => t.Id).IsUnique();
            e.Property(t => t.Name).IsRequired().HasMaxLength(256);
            e.Property(t => t.RequiredScopes).HasColumnType("text[]");
            e.Property(t => t.ConfigFields).HasColumnType("jsonb");
            e.Property(t => t.Tools).HasColumnType("text[]");
            e.Property(t => t.TaskDefinitions).HasColumnType("jsonb");
            e.Property(t => t.DefaultConfig).HasColumnType("jsonb");
        });

        // Agent
        modelBuilder.Entity<Agent>(e =>
        {
            e.HasKey(a => a.Id);
            e.HasIndex(a => new { a.UserId, a.StoreId });
            e.Property(a => a.Name).IsRequired().HasMaxLength(256);
            e.Property(a => a.Configuration).HasColumnType("jsonb");
            e.Property(a => a.CustomRules).HasColumnType("text[]");
            e.Property(a => a.Status).HasConversion<string>();
        });

        // ChatMessage
        modelBuilder.Entity<ChatMessage>(e =>
        {
            e.HasKey(m => m.Id);
            e.HasIndex(m => new { m.AgentId, m.Timestamp });
            e.Property(m => m.Content).IsRequired();
        });

        // Settings
        modelBuilder.Entity<Settings>(e =>
        {
            e.HasKey(s => s.UserId);
        });

        // Deployment
        modelBuilder.Entity<Deployment>(e =>
        {
            e.HasKey(d => d.Id);
            e.HasIndex(d => d.UserId);
            e.HasIndex(d => d.AgentId).IsUnique();
            e.Property(d => d.Status).HasConversion<string>();
        });

        // RefreshToken
        modelBuilder.Entity<RefreshToken>(e =>
        {
            e.HasKey(t => t.Id);
            e.HasIndex(t => t.Token).IsUnique();
            e.HasIndex(t => t.UserId);
        });

        // AuditLog
        modelBuilder.Entity<AuditLog>(e =>
        {
            e.HasKey(a => a.Id);
            e.HasIndex(a => a.UserId);
            e.HasIndex(a => a.Timestamp);
        });

        // ApiUsage (Rule #14)
        modelBuilder.Entity<ApiUsage>(e =>
        {
            e.HasKey(u => u.Id);
            e.HasIndex(u => new { u.UserId, u.Period });
            e.HasIndex(u => new { u.UserId, u.AgentId, u.Period, u.Model }).IsUnique();
        });
    }
}
