using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace api.Migrations
{
    /// <inheritdoc />
    public partial class AddModelToApiUsage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ApiUsages_UserId_AgentId_Period",
                table: "ApiUsages");

            migrationBuilder.AddColumn<string>(
                name: "Model",
                table: "ApiUsages",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "IX_ApiUsages_UserId_AgentId_Period_Model",
                table: "ApiUsages",
                columns: new[] { "UserId", "AgentId", "Period", "Model" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ApiUsages_UserId_AgentId_Period_Model",
                table: "ApiUsages");

            migrationBuilder.DropColumn(
                name: "Model",
                table: "ApiUsages");

            migrationBuilder.CreateIndex(
                name: "IX_ApiUsages_UserId_AgentId_Period",
                table: "ApiUsages",
                columns: new[] { "UserId", "AgentId", "Period" },
                unique: true);
        }
    }
}
