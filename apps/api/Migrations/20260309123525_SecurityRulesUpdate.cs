using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace api.Migrations
{
    /// <inheritdoc />
    public partial class SecurityRulesUpdate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ApiUsages",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    UserId = table.Column<string>(type: "text", nullable: false),
                    AgentId = table.Column<string>(type: "text", nullable: false),
                    Period = table.Column<string>(type: "text", nullable: false),
                    InputTokens = table.Column<int>(type: "integer", nullable: false),
                    OutputTokens = table.Column<int>(type: "integer", nullable: false),
                    RequestCount = table.Column<int>(type: "integer", nullable: false),
                    EstimatedCostCents = table.Column<int>(type: "integer", nullable: false),
                    LastUpdated = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ApiUsages", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AuditLogs",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    UserId = table.Column<string>(type: "text", nullable: true),
                    Action = table.Column<string>(type: "text", nullable: false),
                    EntityType = table.Column<string>(type: "text", nullable: false),
                    EntityId = table.Column<string>(type: "text", nullable: true),
                    Details = table.Column<string>(type: "text", nullable: true),
                    IpAddress = table.Column<string>(type: "text", nullable: true),
                    UserAgent = table.Column<string>(type: "text", nullable: true),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditLogs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RefreshTokens",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    UserId = table.Column<string>(type: "text", nullable: false),
                    Token = table.Column<string>(type: "text", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsRevoked = table.Column<bool>(type: "boolean", nullable: false),
                    ReplacedByTokenId = table.Column<string>(type: "text", nullable: true),
                    RevokedReason = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RefreshTokens", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ApiUsages_UserId_AgentId_Period",
                table: "ApiUsages",
                columns: new[] { "UserId", "AgentId", "Period" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ApiUsages_UserId_Period",
                table: "ApiUsages",
                columns: new[] { "UserId", "Period" });

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_Timestamp",
                table: "AuditLogs",
                column: "Timestamp");

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_UserId",
                table: "AuditLogs",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_RefreshTokens_Token",
                table: "RefreshTokens",
                column: "Token",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RefreshTokens_UserId",
                table: "RefreshTokens",
                column: "UserId");

            // Rule #09: PostgreSQL Row-Level Security
            // Create app role for RLS policies
            migrationBuilder.Sql(@"
                DO $$ BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
                        CREATE ROLE app_user;
                    END IF;
                END $$;
            ");

            // Enable RLS on user-scoped tables
            var rlsTables = new[] { "\"Stores\"", "\"Agents\"", "\"Deployments\"", "\"ChatMessages\"", "\"ApiUsages\"" };
            foreach (var table in rlsTables)
            {
                migrationBuilder.Sql($"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;");
                migrationBuilder.Sql($"ALTER TABLE {table} FORCE ROW LEVEL SECURITY;");
            }

            // Stores: users can only see their own stores
            migrationBuilder.Sql(@"
                CREATE POLICY stores_user_isolation ON ""Stores""
                    USING (""UserId"" = current_setting('app.current_user_id', true))
                    WITH CHECK (""UserId"" = current_setting('app.current_user_id', true));
            ");

            // Agents: users can only see their own agents
            migrationBuilder.Sql(@"
                CREATE POLICY agents_user_isolation ON ""Agents""
                    USING (""UserId"" = current_setting('app.current_user_id', true))
                    WITH CHECK (""UserId"" = current_setting('app.current_user_id', true));
            ");

            // Deployments: users can only see their own deployments
            migrationBuilder.Sql(@"
                CREATE POLICY deployments_user_isolation ON ""Deployments""
                    USING (""UserId"" = current_setting('app.current_user_id', true))
                    WITH CHECK (""UserId"" = current_setting('app.current_user_id', true));
            ");

            // ChatMessages: users can only see messages for agents they own
            // Uses a subquery to check agent ownership since ChatMessages has AgentId, not UserId
            migrationBuilder.Sql(@"
                CREATE POLICY chat_messages_user_isolation ON ""ChatMessages""
                    USING (""AgentId"" IN (SELECT ""Id"" FROM ""Agents"" WHERE ""UserId"" = current_setting('app.current_user_id', true)))
                    WITH CHECK (""AgentId"" IN (SELECT ""Id"" FROM ""Agents"" WHERE ""UserId"" = current_setting('app.current_user_id', true)));
            ");

            // ApiUsages: users can only see their own usage
            migrationBuilder.Sql(@"
                CREATE POLICY api_usages_user_isolation ON ""ApiUsages""
                    USING (""UserId"" = current_setting('app.current_user_id', true))
                    WITH CHECK (""UserId"" = current_setting('app.current_user_id', true));
            ");

            // Grant app_user access
            foreach (var table in rlsTables)
            {
                migrationBuilder.Sql($"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO app_user;");
            }

            // AuditLogs: read-only for app (no updates/deletes — immutable audit trail)
            migrationBuilder.Sql(@"ALTER TABLE ""AuditLogs"" ENABLE ROW LEVEL SECURITY;");
            migrationBuilder.Sql(@"ALTER TABLE ""AuditLogs"" FORCE ROW LEVEL SECURITY;");
            migrationBuilder.Sql(@"
                CREATE POLICY audit_logs_insert_only ON ""AuditLogs""
                    FOR INSERT WITH CHECK (true);
            ");
            migrationBuilder.Sql(@"
                CREATE POLICY audit_logs_read_own ON ""AuditLogs""
                    FOR SELECT USING (""UserId"" = current_setting('app.current_user_id', true));
            ");
            migrationBuilder.Sql(@"GRANT SELECT, INSERT ON ""AuditLogs"" TO app_user;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Drop RLS policies
            migrationBuilder.Sql(@"DROP POLICY IF EXISTS stores_user_isolation ON ""Stores"";");
            migrationBuilder.Sql(@"DROP POLICY IF EXISTS agents_user_isolation ON ""Agents"";");
            migrationBuilder.Sql(@"DROP POLICY IF EXISTS deployments_user_isolation ON ""Deployments"";");
            migrationBuilder.Sql(@"DROP POLICY IF EXISTS chat_messages_user_isolation ON ""ChatMessages"";");
            migrationBuilder.Sql(@"DROP POLICY IF EXISTS api_usages_user_isolation ON ""ApiUsages"";");
            migrationBuilder.Sql(@"DROP POLICY IF EXISTS audit_logs_insert_only ON ""AuditLogs"";");
            migrationBuilder.Sql(@"DROP POLICY IF EXISTS audit_logs_read_own ON ""AuditLogs"";");

            var rlsTables = new[] { "\"Stores\"", "\"Agents\"", "\"Deployments\"", "\"ChatMessages\"", "\"AuditLogs\"" };
            foreach (var table in rlsTables)
                migrationBuilder.Sql($"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY;");

            migrationBuilder.DropTable(
                name: "ApiUsages");

            migrationBuilder.DropTable(
                name: "AuditLogs");

            migrationBuilder.DropTable(
                name: "RefreshTokens");
        }
    }
}
