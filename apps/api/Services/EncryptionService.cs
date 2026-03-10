using System.Security.Cryptography;
using System.Text;

namespace ClawCommerce.Api.Services;

/// <summary>
/// AES-256-GCM encryption service for secrets at rest (Rule #04 — key versioning + rotation).
/// Format: base64(version[1] + nonce[12] + ciphertext[n] + tag[16])
/// Version byte enables key rotation without re-encrypting all data at once.
/// </summary>
public class EncryptionService
{
    // Use 0xEC ("EC" for EcomClaw) as version marker — distinguishable from random nonce bytes
    // Legacy format (no version byte) will never start with 0xEC reliably, but we try-catch as fallback
    private const byte CurrentKeyVersion = 0xEC;
    private readonly Dictionary<byte, byte[]> _keys = new();
    private readonly byte[] _currentKey;
    private readonly ILogger<EncryptionService> _logger;

    public EncryptionService(IConfiguration config, ILogger<EncryptionService> logger)
    {
        _logger = logger;

        var keyBase64 = config["Encryption:MasterKey"];
        if (string.IsNullOrEmpty(keyBase64))
        {
            _currentKey = RandomNumberGenerator.GetBytes(32);
            _keys[CurrentKeyVersion] = _currentKey;
            _logger.LogWarning(
                "No Encryption:MasterKey configured — using random key. Encrypted data will NOT survive restarts. " +
                "Set Encryption:MasterKey to a base64-encoded 32-byte key in production.");
            return;
        }

        _currentKey = Convert.FromBase64String(keyBase64);
        if (_currentKey.Length != 32)
            throw new InvalidOperationException("Encryption:MasterKey must be exactly 32 bytes (256 bits) when base64-decoded.");
        _keys[CurrentKeyVersion] = _currentKey;

        // Support previous key for rotation (decrypt old data during transition)
        var prevKeyBase64 = config["Encryption:PreviousMasterKey"];
        if (!string.IsNullOrEmpty(prevKeyBase64))
        {
            var prevKey = Convert.FromBase64String(prevKeyBase64);
            if (prevKey.Length == 32)
            {
                _keys[0] = prevKey;
                _logger.LogInformation("Previous encryption key loaded for rotation support.");
            }
        }
    }

    public string Encrypt(string plaintext)
    {
        if (string.IsNullOrEmpty(plaintext))
            return plaintext;

        var plaintextBytes = Encoding.UTF8.GetBytes(plaintext);
        var nonce = RandomNumberGenerator.GetBytes(12);
        var ciphertext = new byte[plaintextBytes.Length];
        var tag = new byte[16];

        using var aes = new AesGcm(_currentKey, 16);
        aes.Encrypt(nonce, plaintextBytes, ciphertext, tag);

        // Pack: version(1) + nonce(12) + ciphertext(n) + tag(16)
        var result = new byte[1 + 12 + ciphertext.Length + 16];
        result[0] = CurrentKeyVersion;
        Buffer.BlockCopy(nonce, 0, result, 1, 12);
        Buffer.BlockCopy(ciphertext, 0, result, 13, ciphertext.Length);
        Buffer.BlockCopy(tag, 0, result, 13 + ciphertext.Length, 16);

        return Convert.ToBase64String(result);
    }

    public string Decrypt(string encryptedBase64)
    {
        if (string.IsNullOrEmpty(encryptedBase64))
            return encryptedBase64;

        var data = Convert.FromBase64String(encryptedBase64);
        if (data.Length < 28)
            throw new CryptographicException("Invalid encrypted data: too short.");

        // Try versioned format first (version byte 0xEC + nonce + ciphertext + tag)
        if (data.Length >= 29 && _keys.ContainsKey(data[0]))
        {
            try
            {
                return DecryptWithOffset(data, keyVersion: data[0], nonceOffset: 1);
            }
            catch (CryptographicException)
            {
                // Versioned decryption failed — fall through to legacy attempt
            }
        }

        // Legacy format (nonce + ciphertext + tag, no version byte) — try all keys
        foreach (var (_, key) in _keys)
        {
            try
            {
                return DecryptRaw(data, key, nonceOffset: 0);
            }
            catch (CryptographicException)
            {
                // Try next key
            }
        }

        throw new CryptographicException("Decryption failed: no key could decrypt this data.");
    }

    private string DecryptWithOffset(byte[] data, byte keyVersion, int nonceOffset)
    {
        if (!_keys.TryGetValue(keyVersion, out var key))
            throw new CryptographicException($"No key available for version {keyVersion}.");
        return DecryptRaw(data, key, nonceOffset);
    }

    private static string DecryptRaw(byte[] data, byte[] key, int nonceOffset)
    {
        var nonce = data[nonceOffset..(nonceOffset + 12)];
        var tag = data[^16..];
        var ciphertext = data[(nonceOffset + 12)..^16];
        var plaintext = new byte[ciphertext.Length];

        using var aes = new AesGcm(key, 16);
        aes.Decrypt(nonce, ciphertext, tag, plaintext);

        return Encoding.UTF8.GetString(plaintext);
    }

    /// <summary>
    /// Re-encrypt data from any key version to the current key.
    /// Use during key rotation to migrate old encrypted values.
    /// </summary>
    public string ReEncrypt(string encryptedBase64)
    {
        var plaintext = Decrypt(encryptedBase64);
        return Encrypt(plaintext);
    }

    /// <summary>
    /// Check if data was encrypted with the current key version.
    /// Returns false if it needs re-encryption during rotation.
    /// </summary>
    public bool IsCurrentVersion(string encryptedBase64)
    {
        if (string.IsNullOrEmpty(encryptedBase64)) return true;
        try
        {
            var data = Convert.FromBase64String(encryptedBase64);
            return data.Length >= 29 && data[0] == CurrentKeyVersion; // 0xEC
        }
        catch { return false; }
    }

    public static string GenerateMasterKey()
    {
        return Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
    }
}
