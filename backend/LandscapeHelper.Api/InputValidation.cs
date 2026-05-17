using System.Text.RegularExpressions;

namespace LandscapeHelper.Api;

/// <summary>
/// Defense-in-depth input caps + shape checks shared across every endpoint
/// that accepts user-supplied text or base64 photos. Tier-2 review (yard /
/// house photos, single-user auth) — limits are deliberately generous so
/// they only stop accidents and adversarial payloads, not normal usage.
/// </summary>
public static class InputValidation
{
    // ~6 MB decoded → ~8 MB base64. Big enough for a high-res phone photo
    // after Expo's image-picker default compression, small enough to keep
    // a single bad request from OOM'ing the OpenAI call or wedging Kestrel.
    public const int MaxBase64ImageChars = 8 * 1024 * 1024;

    // Hard ceiling on photos forwarded to GPT-4o per request. The mobile UI
    // tops out at 4 sides × 2 photos = 8 for house-advice, so 12 leaves
    // generous slack while preventing a hostile client from sending 100.
    public const int MaxImagesPerRequest = 12;

    public const int MaxDescriptionChars = 8_000;
    public const int MaxShortStringChars = 512;
    public const int MaxNotesChars       = 4_000;

    // MIME types we ever expect from the mobile image picker. Anything else
    // is either an accident or a probe — reject without reading the bytes.
    private static readonly HashSet<string> AllowedImageMimeTypes =
        new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/jpg", "image/png",
        "image/webp", "image/heic", "image/heif",
    };

    // Tight email/zip patterns chosen for cheap rejection at the HTTP edge.
    // The auth path still uses its own normalization; these are for shape
    // checks at endpoints that don't already validate (help-requests POST,
    // weather lookup, deletion endpoint).
    private static readonly Regex EmailLike =
        new(@"^[^@\s]+@[^@\s]+\.[^@\s]+$", RegexOptions.Compiled);

    private static readonly Regex UsZipLike =
        new(@"^\d{5}(-\d{4})?$", RegexOptions.Compiled);

    public static bool LooksLikeEmail(string? s)
        => !string.IsNullOrEmpty(s)
           && s.Length <= MaxShortStringChars
           && EmailLike.IsMatch(s);

    public static bool LooksLikeZip(string? s)
        => !string.IsNullOrEmpty(s) && UsZipLike.IsMatch(s.Trim());

    /// <summary>
    /// Returns the string truncated to <paramref name="max"/> chars. Used
    /// liberally on incoming free-form text so a 5 MB notes field can't sneak
    /// into the database or the AI prompt context.
    /// </summary>
    public static string? Trunc(string? s, int max)
        => s == null ? null : (s.Length <= max ? s : s.Substring(0, max));

    /// <summary>
    /// Cheap pre-decode check for a base64 image payload. Rejects oversize
    /// strings and unsupported MIME types before we hand the bytes to the
    /// OpenAI SDK (which does its own decode and would otherwise spend CPU
    /// on garbage).
    /// </summary>
    public static bool IsAcceptableImage(string? base64, string? mimeType)
    {
        if (string.IsNullOrEmpty(base64)) return false;
        if (base64.Length > MaxBase64ImageChars) return false;
        if (!string.IsNullOrEmpty(mimeType) && !AllowedImageMimeTypes.Contains(mimeType))
            return false;
        return true;
    }
}
