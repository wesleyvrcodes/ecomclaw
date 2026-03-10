using System.Text.Json;
using System.Text.Json.Serialization;

namespace ClawCommerce.Api.Services;

public class ShopifyService
{
    private readonly HttpClient _http;

    public ShopifyService(HttpClient http, IConfiguration configuration)
    {
        _http = http;
    }

    /// <summary>
    /// Validates Shopify credentials by performing a client_credentials token exchange,
    /// then uses the token to fetch the shop info and product count.
    /// </summary>
    public async Task<ShopifyValidationResult> ValidateConnectionAsync(string storeUrl, string clientId, string clientSecret)
    {
        var shop = NormalizeStoreUrl(storeUrl);
        if (string.IsNullOrEmpty(shop))
            return ShopifyValidationResult.Fail("Invalid store URL. Use the format: your-store.myshopify.com");

        // Step 1: Exchange client credentials for an access token
        string accessToken;
        string grantedScopes;
        try
        {
            var tokenUrl = $"https://{shop}/admin/oauth/access_token";
            var payload = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["client_id"] = clientId,
                ["client_secret"] = clientSecret,
                ["grant_type"] = "client_credentials"
            });

            var tokenResponse = await _http.PostAsync(tokenUrl, payload);
            var body = await tokenResponse.Content.ReadAsStringAsync();

            if (!tokenResponse.IsSuccessStatusCode)
            {
                var statusCode = (int)tokenResponse.StatusCode;
                return statusCode switch
                {
                    401 or 403 => ShopifyValidationResult.Fail("Invalid Client ID or Client Secret. Please double-check your credentials in the Shopify Dev Dashboard."),
                    404 => ShopifyValidationResult.Fail($"Store not found: {shop}. Make sure the URL is correct."),
                    _ => ShopifyValidationResult.Fail($"Shopify returned an error ({statusCode}). Please try again.")
                };
            }

            var tokenData = JsonSerializer.Deserialize<ShopifyTokenResponse>(body);
            if (tokenData is null || string.IsNullOrEmpty(tokenData.AccessToken))
                return ShopifyValidationResult.Fail("Received an empty token from Shopify. Please check your app configuration.");

            accessToken = tokenData.AccessToken;
            grantedScopes = tokenData.Scope ?? "";
        }
        catch (HttpRequestException)
        {
            return ShopifyValidationResult.Fail($"Could not reach {shop}. Make sure the store URL is correct and the store exists.");
        }
        catch (TaskCanceledException)
        {
            return ShopifyValidationResult.Fail("Connection timed out. Please try again.");
        }

        // Step 2: Use the token to fetch shop info + product count
        int productCount = 0;
        string shopName = shop.Replace(".myshopify.com", "");
        try
        {
            _http.DefaultRequestHeaders.Clear();
            _http.DefaultRequestHeaders.Add("X-Shopify-Access-Token", accessToken);

            var countResponse = await _http.GetAsync($"https://{shop}/admin/api/2025-01/products/count.json?status=active");
            if (countResponse.IsSuccessStatusCode)
            {
                var countBody = await countResponse.Content.ReadAsStringAsync();
                var countData = JsonSerializer.Deserialize<ShopifyCountResponse>(countBody);
                productCount = countData?.Count ?? 0;
            }

            var shopResponse = await _http.GetAsync($"https://{shop}/admin/api/2025-01/shop.json");
            if (shopResponse.IsSuccessStatusCode)
            {
                var shopBody = await shopResponse.Content.ReadAsStringAsync();
                var shopData = JsonSerializer.Deserialize<ShopifyShopWrapper>(shopBody);
                if (!string.IsNullOrEmpty(shopData?.Shop?.Name))
                    shopName = shopData.Shop.Name;
            }
        }
        catch
        {
            // Non-critical — we already have a valid token, just couldn't fetch extra info
        }

        return new ShopifyValidationResult
        {
            Valid = true,
            AccessToken = accessToken,
            GrantedScopes = grantedScopes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList(),
            ProductCount = productCount,
            ShopName = shopName,
            Message = $"Connected successfully! We can see {productCount} products."
        };
    }

    private static string? NormalizeStoreUrl(string url)
    {
        url = url.Trim()
            .ToLower()
            .Replace("https://", "")
            .Replace("http://", "")
            .TrimEnd('/');

        // Handle admin URLs like admin.shopify.com/store/xxx
        if (url.StartsWith("admin.shopify.com/store/"))
        {
            var storeName = url.Replace("admin.shopify.com/store/", "").Split('/')[0];
            return string.IsNullOrEmpty(storeName) ? null : $"{storeName}.myshopify.com";
        }

        // Already has .myshopify.com
        if (url.EndsWith(".myshopify.com"))
            return url;

        // Just the store name
        if (!url.Contains('.'))
            return $"{url}.myshopify.com";

        return null;
    }
}

public class ShopifyValidationResult
{
    public bool Valid { get; set; }
    public string AccessToken { get; set; } = "";
    public List<string> GrantedScopes { get; set; } = new();
    public int ProductCount { get; set; }
    public string ShopName { get; set; } = "";
    public string Message { get; set; } = "";

    public static ShopifyValidationResult Fail(string message) => new()
    {
        Valid = false,
        Message = message
    };
}

public class ShopifyTokenResponse
{
    [JsonPropertyName("access_token")]
    public string AccessToken { get; set; } = "";

    [JsonPropertyName("scope")]
    public string Scope { get; set; } = "";
}

public class ShopifyCountResponse
{
    [JsonPropertyName("count")]
    public int Count { get; set; }
}

public class ShopifyShopWrapper
{
    [JsonPropertyName("shop")]
    public ShopifyShopInfo? Shop { get; set; }
}

public class ShopifyShopInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";
}
