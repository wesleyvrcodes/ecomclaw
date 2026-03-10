namespace ClawCommerce.Api.Models;

public class Store
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string UserId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string StoreUrl { get; set; } = string.Empty;
    public string Niche { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
    [System.Text.Json.Serialization.JsonIgnore]
    public string AccessToken { get; set; } = string.Empty;
    public List<string> GrantedScopes { get; set; } = new();
    public bool IsConnected { get; set; } = false;
    public int ProductCount { get; set; } = 0;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
