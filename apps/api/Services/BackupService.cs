using System.Diagnostics;

namespace ClawCommerce.Api.Services;

/// <summary>
/// Automated PostgreSQL backup service (Rule #22).
/// Runs daily via IHostedService, dumps to configured backup directory.
/// Retains backups for configurable days (default 30).
/// </summary>
public class BackupService : BackgroundService
{
    private readonly IConfiguration _config;
    private readonly ILogger<BackupService> _logger;

    public BackupService(IConfiguration config, ILogger<BackupService> logger)
    {
        _config = config;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var enabled = _config.GetValue("Backup:Enabled", false);
        if (!enabled)
        {
            _logger.LogInformation("Backup service is disabled. Set Backup:Enabled=true to enable.");
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunBackupAsync(stoppingToken);
                CleanupOldBackups();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Backup failed");
            }

            // Run daily at configured hour (default 3 AM UTC)
            var nextRun = GetNextRunTime();
            var delay = nextRun - DateTime.UtcNow;
            if (delay > TimeSpan.Zero)
                await Task.Delay(delay, stoppingToken);
        }
    }

    private async Task RunBackupAsync(CancellationToken ct)
    {
        var connectionString = _config.GetConnectionString("DefaultConnection")
            ?? Environment.GetEnvironmentVariable("CONNECTION_STRING");

        if (string.IsNullOrEmpty(connectionString))
        {
            _logger.LogWarning("No connection string configured for backup.");
            return;
        }

        var backupDir = _config["Backup:Directory"] ?? "/var/backups/clawcommerce";
        Directory.CreateDirectory(backupDir);

        var timestamp = DateTime.UtcNow.ToString("yyyyMMdd_HHmmss");
        var backupFile = Path.Combine(backupDir, $"clawcommerce_{timestamp}.sql.gz");

        // Parse connection string for pg_dump
        var parts = ParseConnectionString(connectionString);
        if (parts is null)
        {
            _logger.LogWarning("Could not parse connection string for backup.");
            return;
        }

        var env = new Dictionary<string, string> { ["PGPASSWORD"] = parts.Value.Password };
        // Use -Fp (plain text SQL) so we can gzip the output effectively
        var args = $"-h {parts.Value.Host} -p {parts.Value.Port} -U {parts.Value.Username} -d {parts.Value.Database} -Fp";

        _logger.LogInformation("Starting backup to {File}", backupFile);

        var psi = new ProcessStartInfo
        {
            FileName = "pg_dump",
            Arguments = args,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };
        foreach (var kv in env)
            psi.EnvironmentVariables[kv.Key] = kv.Value;

        using var process = Process.Start(psi);
        if (process is null)
        {
            _logger.LogError("Failed to start pg_dump process");
            return;
        }

        // Write compressed output
        await using var outputFile = File.Create(backupFile);
        await using var gzip = new System.IO.Compression.GZipStream(outputFile, System.IO.Compression.CompressionLevel.Optimal);
        await process.StandardOutput.BaseStream.CopyToAsync(gzip, ct);

        await process.WaitForExitAsync(ct);

        if (process.ExitCode == 0)
        {
            var size = new FileInfo(backupFile).Length;
            _logger.LogInformation("Backup completed: {File} ({Size} bytes)", backupFile, size);
        }
        else
        {
            var stderr = await process.StandardError.ReadToEndAsync(ct);
            _logger.LogError("pg_dump failed with exit code {Code}: {Error}", process.ExitCode, stderr);
            File.Delete(backupFile); // Clean up failed backup
        }
    }

    private void CleanupOldBackups()
    {
        var backupDir = _config["Backup:Directory"] ?? "/var/backups/clawcommerce";
        var retentionDays = _config.GetValue("Backup:RetentionDays", 30);

        if (!Directory.Exists(backupDir)) return;

        var cutoff = DateTime.UtcNow.AddDays(-retentionDays);
        foreach (var file in Directory.GetFiles(backupDir, "clawcommerce_*.sql.gz"))
        {
            if (File.GetCreationTimeUtc(file) < cutoff)
            {
                File.Delete(file);
                _logger.LogInformation("Deleted old backup: {File}", Path.GetFileName(file));
            }
        }
    }

    private DateTime GetNextRunTime()
    {
        var hour = _config.GetValue("Backup:HourUtc", 3);
        var now = DateTime.UtcNow;
        var today = now.Date.AddHours(hour);
        return now < today ? today : today.AddDays(1);
    }

    private (string Host, string Port, string Username, string Password, string Database)? ParseConnectionString(string cs)
    {
        try
        {
            var builder = new Npgsql.NpgsqlConnectionStringBuilder(cs);
            return (
                builder.Host ?? "localhost",
                builder.Port.ToString(),
                builder.Username ?? "postgres",
                builder.Password ?? "",
                builder.Database ?? "clawcommerce"
            );
        }
        catch
        {
            return null;
        }
    }
}
