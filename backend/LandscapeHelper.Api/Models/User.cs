namespace LandscapeHelper.Api.Models;

public class User
{
    public int Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class HouseAdviceSession
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User? User { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string? Budget { get; set; }
    public string? Ideas { get; set; }
    public string? OverallNotes { get; set; }
    // Full AI response serialized as JSON (suggestions array, etc.)
    public string SuggestionsJson { get; set; } = "{}";
    public List<HouseAdvicePhoto> Photos { get; set; } = new();
}

public class HouseAdvicePhoto
{
    public int Id { get; set; }
    public int SessionId { get; set; }
    public HouseAdviceSession? Session { get; set; }
    public string Side { get; set; } = string.Empty; // front | left | back | right
    public string Base64 { get; set; } = string.Empty;
    public string MimeType { get; set; } = "image/jpeg";
}
