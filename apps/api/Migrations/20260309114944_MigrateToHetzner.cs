using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace api.Migrations
{
    /// <inheritdoc />
    public partial class MigrateToHetzner : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FlyAppName",
                table: "Deployments");

            migrationBuilder.RenameColumn(
                name: "FlyMachineIp",
                table: "Deployments",
                newName: "ServerName");

            migrationBuilder.RenameColumn(
                name: "FlyMachineId",
                table: "Deployments",
                newName: "ServerIp");

            migrationBuilder.AddColumn<long>(
                name: "ServerId",
                table: "Deployments",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ServerId",
                table: "Deployments");

            migrationBuilder.RenameColumn(
                name: "ServerName",
                table: "Deployments",
                newName: "FlyMachineIp");

            migrationBuilder.RenameColumn(
                name: "ServerIp",
                table: "Deployments",
                newName: "FlyMachineId");

            migrationBuilder.AddColumn<string>(
                name: "FlyAppName",
                table: "Deployments",
                type: "text",
                nullable: false,
                defaultValue: "");
        }
    }
}
