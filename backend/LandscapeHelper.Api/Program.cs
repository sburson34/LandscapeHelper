using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using OpenAI.Chat;
using OpenAI;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Linq;
using System.ClientModel;
using System.ClientModel.Primitives;
using Amazon.SecretsManager;
using Amazon.SecretsManager.Model;
using LandscapeHelper.Api;
using LandscapeHelper.Api.Data;
using LandscapeHelper.Api.Integrations;
using LandscapeHelper.Api.Models;
using LandscapeHelper.Api.Observability;
using Sburson.Shared.FeatureFlags;
using Sburson.Shared.Web;

var builder = WebApplication.CreateBuilder(args);

// Sentry: reads the DSN from the Sentry__Dsn env var. Safe to call when not
// configured (no-op when DSN is empty). See Observability/SentrySetup.cs.
builder.WebHost.UseLandscapeHelperSentry();

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddOpenApi();

builder.Logging.AddConsole();
builder.Logging.AddDebug();

// Increase max request body size to 50MB (default is 30MB)
builder.WebHost.ConfigureKestrel(serverOptions =>
{
    serverOptions.Limits.MaxRequestBodySize = 50 * 1024 * 1024;
});
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 50 * 1024 * 1024;
});

// Database — SQLite for local dev, PostgreSQL on the shared host.
// Configured via env: ConnectionStrings__Default + Database__Provider.
var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? "Data Source=helpRequests.db";
var dbProvider = builder.Configuration["Database:Provider"]?.ToLower() ?? "sqlite";

builder.Services.AddDbContext<AppDbContext>(options =>
{
    if (dbProvider == "postgresql")
        options.UseNpgsql(connectionString);
    else
        options.UseSqlite(connectionString);
});

// Add CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("MobilePolicy",
        policy =>
        {
            policy.AllowAnyOrigin()
                  .AllowAnyHeader()
                  .AllowAnyMethod();
        });
});

// Lazily fetch + cache the JSON-wrapped secret payload from AWS Secrets Manager.
// SECRET_ARN is set on the shared host; absent locally so we just fall back
// to env vars. Returns null if SECRET_ARN is unset or the fetch fails.
JsonElement? cachedSecret = null;
bool secretFetched = false;
JsonElement? GetSecretJson()
{
    if (secretFetched) return cachedSecret;
    secretFetched = true;
    var secretArn = Environment.GetEnvironmentVariable("SECRET_ARN");
    if (string.IsNullOrEmpty(secretArn)) return null;
    try
    {
        using var smClient = new AmazonSecretsManagerClient(Amazon.RegionEndpoint.USEast1);
        var resp = smClient.GetSecretValueAsync(new GetSecretValueRequest { SecretId = secretArn }).GetAwaiter().GetResult();
        try
        {
            cachedSecret = JsonSerializer.Deserialize<JsonElement>(resp.SecretString);
        }
        catch (JsonException) { }
    }
    catch { }
    return cachedSecret;
}

string? ReadSecretKey(string key)
{
    var json = GetSecretJson();
    if (json is JsonElement el && el.TryGetProperty(key, out var prop))
        return prop.GetString();
    return null;
}

// JWT signing key. In prod we read from Secrets Manager (key JWT_SIGNING_KEY).
// In dev, fall back to env var or generate an ephemeral one (sessions reset on restart).
string jwtSigningKey;
{
    var key = ReadSecretKey("JWT_SIGNING_KEY")
              ?? Environment.GetEnvironmentVariable("JWT_SIGNING_KEY");
    if (string.IsNullOrEmpty(key))
    {
        // Generate ephemeral key — only acceptable in dev. Tokens won't survive restart.
        var randomBytes = new byte[64];
        System.Security.Cryptography.RandomNumberGenerator.Fill(randomBytes);
        key = Convert.ToBase64String(randomBytes);
    }
    jwtSigningKey = key;
}

const string JWT_ISSUER = "LandscapeHelper";
const string JWT_AUDIENCE = "LandscapeHelperUsers";
var jwtKeyBytes = System.Text.Encoding.UTF8.GetBytes(jwtSigningKey);

// Load admin email list — either from the same Secrets Manager secret (key "ADMIN_EMAILS")
// or from the ADMIN_EMAILS env var. Comma-separated, case-insensitive.
HashSet<string> adminEmails;
{
    var emailsRaw = ReadSecretKey("ADMIN_EMAILS")
                    ?? Environment.GetEnvironmentVariable("ADMIN_EMAILS");
    adminEmails = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    if (!string.IsNullOrWhiteSpace(emailsRaw))
    {
        foreach (var e in emailsRaw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            adminEmails.Add(e);
    }
}

bool IsAdminEmail(string email) => !string.IsNullOrEmpty(email) && adminEmails.Contains(email);

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.RequireHttpsMetadata = false; // EB terminates TLS at the ALB
        options.SaveToken = true;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = JWT_ISSUER,
            ValidAudience = JWT_AUDIENCE,
            IssuerSigningKey = new SymmetricSecurityKey(jwtKeyBytes),
            ClockSkew = TimeSpan.FromMinutes(5),
        };
    });
builder.Services.AddAuthorization();

// Feature flags — read once at startup from env vars; the mobile app pulls
// the current set via GET /api/features at boot to gate scaffolded screens
// behind a server flip.
builder.Services.AddSingleton<FeatureFlags>();

// Shared web pipeline (CorrelationId / Exception / RequestLogging / SecurityHeaders).
// Classify OpenAI ClientResultException to friendly statuses without coupling
// the package to the OpenAI SDK.
builder.Services.AddSburonWeb(classifiers =>
{
    classifiers.Add(ex =>
    {
        if (ex is ClientResultException cre)
        {
            var status = cre.Status;
            if (status == 429)
                return (429, "The service is temporarily busy. Please wait a moment and try again.", "rate_limited");
            if (status == 400 || ex.Message.Contains("content_filter", StringComparison.OrdinalIgnoreCase))
                return (422, "The AI could not process this request. Try a shorter description or different photo.", "ai_rejected");
            return (502, "The AI service returned an error. Please try again.", "ai_error");
        }
        return null;
    });
});

var app = builder.Build();

// Fetch OpenAI API key from AWS Secrets Manager (or fall back to env var for local dev)
string? openAiKey;
{
    var startupLogger = app.Services.GetRequiredService<ILogger<Program>>();
    openAiKey = ReadSecretKey("OPENAI_API_KEY")
                ?? Environment.GetEnvironmentVariable("OPENAI_API_KEY");
    if (string.IsNullOrEmpty(openAiKey))
        startupLogger.LogWarning("OPENAI_API_KEY is not configured. Set SECRET_ARN or OPENAI_API_KEY env var.");
    else
        startupLogger.LogInformation("Backend starting up. Listening for requests...");
}

// Optional override for the OpenAI base endpoint. Lets integration tests redirect
// every `new ChatClient(...)` to a faked HTTP server so we cover the analyze /
// ask-helper / verify-step / diagnose / clarify / house-advice / shrubbery-advice
// branches deterministically. Empty / unset = real api.openai.com.
Uri? openAiEndpoint = null;
{
    var raw = Environment.GetEnvironmentVariable("OPENAI_BASE_URL");
    if (!string.IsNullOrWhiteSpace(raw) && Uri.TryCreate(raw, UriKind.Absolute, out var parsed))
        openAiEndpoint = parsed;
}
OpenAIClientOptions BuildOpenAiOptions(TimeSpan? networkTimeout = null)
{
    var opts = new OpenAIClientOptions();
    if (networkTimeout.HasValue) opts.NetworkTimeout = networkTimeout.Value;
    if (openAiEndpoint != null) opts.Endpoint = openAiEndpoint;
    return opts;
}

// Affiliate program configuration
// Replace these placeholder values with your actual affiliate IDs once approved
string amazonAssociateTag = Environment.GetEnvironmentVariable("AMAZON_ASSOCIATE_TAG") ?? "landscapehelper-20";
string homeDepotImpactId = Environment.GetEnvironmentVariable("HOMEDEPOT_IMPACT_ID") ?? "YOUR_IMPACT_ID";

// Google Cloud API key (shared across Google services like Translate, YouTube, etc.).
// Stored in the same AWS Secrets Manager secret under the key "GOOGLE_API_KEY".
// Falls back to GOOGLE_API_KEY env var, then GOOGLE_TRANSLATE_API_KEY for back-compat.
string? googleApiKey = ReadSecretKey("GOOGLE_API_KEY")
                       ?? ReadSecretKey("GOOGLE_TRANSLATE_API_KEY")
                       ?? Environment.GetEnvironmentVariable("GOOGLE_API_KEY")
                       ?? Environment.GetEnvironmentVariable("GOOGLE_TRANSLATE_API_KEY");

// Simple in-memory cache for translations (key: "source|target|text" → translated)
var translationCache = new System.Collections.Concurrent.ConcurrentDictionary<string, string>();
var sharedHttpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };

// In-memory per-IP rate limit buckets for endpoints that accept unauthenticated
// PII (help-requests POST) and the deletion endpoint's per-email leg. Resets on
// process restart — good enough for tier-2 (a hostile actor would still need
// to sustain attacks across restarts; abuse logs in Sentry catch the pattern).
// Each entry: (windowStart, count). Keyed by "endpoint:identifier".
var rateLimitBuckets = new System.Collections.Concurrent.ConcurrentDictionary<string, (DateTime windowStart, int count)>();
bool RateLimitHit(string bucketKey, int max, TimeSpan window)
{
    var now = DateTime.UtcNow;
    var updated = rateLimitBuckets.AddOrUpdate(
        bucketKey,
        addValueFactory: _ => (now, 1),
        updateValueFactory: (_, cur) =>
            (now - cur.windowStart) > window ? (now, 1) : (cur.windowStart, cur.count + 1));
    return updated.count > max;
}

// Convert a JSON array element of shopping items (each either a plain string or
// a {item, ...} object) into a list of affiliate-link records the mobile app
// renders. Used by /api/analyze, /api/house-advice, /api/shrubbery-advice.
List<object> BuildAffiliateLinks(JsonElement shopEl)
{
    var links = new List<object>();
    if (shopEl.ValueKind != JsonValueKind.Array) return links;
    foreach (var item in shopEl.EnumerateArray())
    {
        string itemName = item.ValueKind == JsonValueKind.String
            ? item.GetString() ?? ""
            : item.TryGetProperty("item", out var ip) ? ip.GetString() ?? "" : "";
        if (string.IsNullOrWhiteSpace(itemName)) continue;
        var encoded = Uri.EscapeDataString(itemName);
        links.Add(new
        {
            item = itemName,
            amazon_url = $"https://www.amazon.com/s?k={encoded}&tag={amazonAssociateTag}",
            homedepot_url = $"https://www.homedepot.com/s/{encoded}?NCNI-5&irclickid={homeDepotImpactId}"
        });
    }
    return links;
}

// Ensure SQLite database is created. EnsureCreated only creates missing tables
// when the DB doesn't exist; for existing DBs we issue raw CREATE TABLE IF NOT EXISTS
// statements for the post-v1 tables since we aren't using EF migrations.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();

    // Idempotent additive schema for existing databases. Provider-specific
    // because we use SQLite locally and Postgres on the shared host, and the
    // two dialects disagree on AUTOINCREMENT vs SERIAL.
    if (dbProvider == "postgresql")
    {
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS ""Users"" (
                ""Id"" SERIAL PRIMARY KEY,
                ""Email"" TEXT NOT NULL,
                ""PasswordHash"" TEXT NOT NULL,
                ""DisplayName"" TEXT NULL,
                ""CreatedAt"" TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_Users_Email"" ON ""Users""(""Email"");

            CREATE TABLE IF NOT EXISTS ""HouseAdviceSessions"" (
                ""Id"" SERIAL PRIMARY KEY,
                ""UserId"" INTEGER NOT NULL,
                ""CreatedAt"" TEXT NOT NULL,
                ""Budget"" TEXT NULL,
                ""Ideas"" TEXT NULL,
                ""OverallNotes"" TEXT NULL,
                ""SuggestionsJson"" TEXT NOT NULL,
                FOREIGN KEY (""UserId"") REFERENCES ""Users""(""Id"") ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ""HouseAdvicePhotos"" (
                ""Id"" SERIAL PRIMARY KEY,
                ""SessionId"" INTEGER NOT NULL,
                ""Side"" TEXT NOT NULL,
                ""Base64"" TEXT NOT NULL,
                ""MimeType"" TEXT NOT NULL,
                FOREIGN KEY (""SessionId"") REFERENCES ""HouseAdviceSessions""(""Id"") ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS ""DataDeletionRequests"" (
                ""Id"" SERIAL PRIMARY KEY,
                ""RequestId"" TEXT NOT NULL,
                ""Name"" TEXT NULL,
                ""Email"" TEXT NULL,
                ""Phone"" TEXT NULL,
                ""UserId"" INTEGER NULL,
                ""Status"" TEXT NOT NULL DEFAULT 'pending_verification',
                ""CreatedAt"" TEXT NOT NULL,
                ""VerifiedAt"" TEXT NULL,
                ""CompletedAt"" TEXT NULL,
                ""Notes"" TEXT NULL,
                ""ClientIp"" TEXT NULL,
                ""CorrelationId"" TEXT NULL,
                ""AppVersion"" TEXT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_DataDeletionRequests_RequestId"" ON ""DataDeletionRequests""(""RequestId"");
            CREATE INDEX IF NOT EXISTS ""IX_DataDeletionRequests_Email"" ON ""DataDeletionRequests""(""Email"");
            CREATE INDEX IF NOT EXISTS ""IX_DataDeletionRequests_UserId"" ON ""DataDeletionRequests""(""UserId"");
        ");
    }
    else
    {
        db.Database.ExecuteSqlRaw(@"
            CREATE TABLE IF NOT EXISTS Users (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                Email TEXT NOT NULL,
                PasswordHash TEXT NOT NULL,
                DisplayName TEXT NULL,
                CreatedAt TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS IX_Users_Email ON Users(Email);

            CREATE TABLE IF NOT EXISTS HouseAdviceSessions (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                UserId INTEGER NOT NULL,
                CreatedAt TEXT NOT NULL,
                Budget TEXT NULL,
                Ideas TEXT NULL,
                OverallNotes TEXT NULL,
                SuggestionsJson TEXT NOT NULL,
                FOREIGN KEY (UserId) REFERENCES Users(Id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS HouseAdvicePhotos (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                SessionId INTEGER NOT NULL,
                Side TEXT NOT NULL,
                Base64 TEXT NOT NULL,
                MimeType TEXT NOT NULL,
                FOREIGN KEY (SessionId) REFERENCES HouseAdviceSessions(Id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS DataDeletionRequests (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                RequestId TEXT NOT NULL,
                Name TEXT NULL,
                Email TEXT NULL,
                Phone TEXT NULL,
                UserId INTEGER NULL,
                Status TEXT NOT NULL DEFAULT 'pending_verification',
                CreatedAt TEXT NOT NULL,
                VerifiedAt TEXT NULL,
                CompletedAt TEXT NULL,
                Notes TEXT NULL,
                ClientIp TEXT NULL,
                CorrelationId TEXT NULL,
                AppVersion TEXT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS IX_DataDeletionRequests_RequestId ON DataDeletionRequests(RequestId);
            CREATE INDEX IF NOT EXISTS IX_DataDeletionRequests_Email ON DataDeletionRequests(Email);
            CREATE INDEX IF NOT EXISTS IX_DataDeletionRequests_UserId ON DataDeletionRequests(UserId);
        ");
    }
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseDefaultFiles();
app.UseStaticFiles();

// ── Middleware trio (correlation id -> exception handler -> request log) ──
// Order matters: CorrelationId runs first so the ID is in scope for both the
// exception handler's log line and the request logger's structured fields.
// ExceptionHandler wraps RequestLogging so unhandled throws still produce
// a clean JSON response (the logger fires from `finally`, so it always runs).
app.UseMiddleware<CorrelationIdMiddleware>();
app.UseMiddleware<ExceptionHandlerMiddleware>();
app.UseMiddleware<RequestLoggingMiddleware>();
// Defense-in-depth security headers on every response. The shared Caddy
// reverse proxy may set the same headers (idempotent); this guarantees they
// land even if a request bypasses Caddy (e.g. direct EB hit during cutover).
app.UseMiddleware<SecurityHeadersMiddleware>();

app.UseCors("MobilePolicy");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Health check — used by Docker healthcheck + Caddy upstream probe.
app.MapGet("/healthz", () => Results.Ok());

// Feature flag snapshot, read at app-boot by the mobile client.
app.MapGet("/api/features", (FeatureFlags flags) => Results.Ok(flags.ToPublicJson()));

app.MapGet("/", () => "LandscapeHelper API is running on " + DateTime.Now);

// ── App-store / privacy-policy data deletion ─────────────────────────────────
// Required for App Store / Play Console compliance. The mobile app POSTs here
// when a user taps "Delete account" in Settings. We persist a row in
// DataDeletionRequests; the actual wipe (HelpRequests, HouseAdviceSessions,
// HouseAdvicePhotos, Users row, stored media, backups) is performed out-of-band
// after the contact on file confirms the request. See docs/backend-deletion-endpoint.md.
//
// The response is identical whether the email matched an account or not so this
// endpoint cannot be used as an existence oracle. We still enforce a per-IP cap
// to prevent abuse.
app.MapPost("/api/account/delete", async (
    [FromBody] DeleteAccountDto dto,
    HttpContext context,
    AppDbContext db,
    ILogger<Program> logger) =>
{
    var name = (dto?.Name ?? "").Trim();
    var email = (dto?.Email ?? "").Trim().ToLowerInvariant();
    var phone = (dto?.Phone ?? "").Trim();

    if (string.IsNullOrEmpty(email) && string.IsNullOrEmpty(phone))
        return Results.Json(new { error = "email or phone required" }, statusCode: 400);

    var correlationId = context.Items["CorrelationId"] as string ?? Guid.NewGuid().ToString("N").Substring(0, 12);
    var appVersion = context.Request.Headers["X-App-Version"].ToString();
    var clientIp = context.Request.Headers["X-Forwarded-For"].FirstOrDefault()?.Split(',').FirstOrDefault()?.Trim()
                   ?? context.Connection.RemoteIpAddress?.ToString();

    // If the request came from a signed-in user, capture the FK so the wipe
    // job can scope per-user data without relying on email matches alone.
    int? authedUserId = null;
    var sub = context.User?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
              ?? context.User?.FindFirst("sub")?.Value;
    if (int.TryParse(sub, out var parsedId)) authedUserId = parsedId;

    // Per-IP cap so a hostile actor cannot flood the table. We still respond
    // with a fake requestId to avoid turning this into an existence oracle.
    const int PerIpPerDay = 20;
    var since = DateTime.UtcNow.AddHours(-24);
    int ipCount = 0;
    if (!string.IsNullOrEmpty(clientIp))
        ipCount = await db.DataDeletionRequests.CountAsync(r => r.ClientIp == clientIp && r.CreatedAt >= since);

    var fakeRequestId = Guid.NewGuid().ToString();
    if (ipCount >= PerIpPerDay)
    {
        logger.LogWarning("account/delete: per-IP cap hit. ip={Ip} correlationId={CorrelationId}", clientIp, correlationId);
        return Results.Ok(new { status = "pending_verification", requestId = fakeRequestId });
    }

    // Per-email cap (DIYHelper2 canonical pattern). Prevents an attacker on
    // rotating IPs from grinding through the table targeting one address. We
    // intentionally do NOT reveal whether the email matches an account —
    // returning the same 200 + fake requestId shape as the IP-cap path.
    if (!string.IsNullOrEmpty(email))
    {
        int emailCount = await db.DataDeletionRequests
            .CountAsync(r => r.Email == email && r.CreatedAt >= since);
        if (emailCount >= 5)
        {
            logger.LogWarning("account/delete: per-email cap hit. emailHash={Hash} correlationId={CorrelationId}",
                HashEmail(email), correlationId);
            return Results.Ok(new { status = "pending_verification", requestId = fakeRequestId });
        }
    }

    var record = new DataDeletionRequest
    {
        RequestId = Guid.NewGuid().ToString(),
        Name = string.IsNullOrEmpty(name) ? null : name,
        Email = string.IsNullOrEmpty(email) ? null : email,
        Phone = string.IsNullOrEmpty(phone) ? null : phone,
        UserId = authedUserId,
        Status = "pending_verification",
        CreatedAt = DateTime.UtcNow,
        ClientIp = clientIp,
        CorrelationId = correlationId,
        AppVersion = string.IsNullOrEmpty(appVersion) ? null : appVersion,
    };
    db.DataDeletionRequests.Add(record);
    await db.SaveChangesAsync();

    logger.LogInformation(
        "account/delete: queued. requestId={RequestId} emailHash={EmailHash} userId={UserId} correlationId={CorrelationId}",
        record.RequestId, HashEmail(email), authedUserId, correlationId);

    return Results.Ok(new { status = "pending_verification", requestId = record.RequestId });

    static string HashEmail(string? s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        using var sha = System.Security.Cryptography.SHA256.Create();
        var bytes = sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(s));
        return Convert.ToHexString(bytes).Substring(0, 12).ToLowerInvariant();
    }
});

// In-memory community projects store (#18). Replace with DB once schema is settled.
var communityProjects = new List<CommunityProjectDto>();

app.MapPost("/api/analyze", async ([FromBody] AnalyzeProjectRequest request, [FromServices] FeatureFlags flags, ILogger<Program> logger) =>
{
    var gate = AiGate(flags);
    if (gate != null) return gate;

    try
    {
        string requestSizeStr = request.Media != null ? $"{request.Media.Length} media items, total base64 chars: {request.Media.Sum(m => (long)(m.Base64?.Length ?? 0))}" : "no media";
        logger.LogInformation("Analysis request received. Description: {DescLength} chars, {RequestSize}", request.Description?.Length ?? 0, requestSizeStr);

        if (string.IsNullOrEmpty(openAiKey))
        {
            logger.LogError("OPENAI_API_KEY is not configured.");
            return Results.Json(new { error = "OPENAI_API_KEY is not configured." }, statusCode: 500);
        }

        OpenAIClientOptions clientOptions = BuildOpenAiOptions(TimeSpan.FromMinutes(2)); // Wait up to 2 minutes for long uploads/analysis

        ChatClient client = new(model: "gpt-4o", new ApiKeyCredential(openAiKey), clientOptions);

        ChatCompletionOptions options = new()
        {
            EndUserId = "landscape-helper-app"
        };

        // Increase timeout for large image uploads
        // The SDK doesn't expose a direct timeout on ChatClient easily without custom Pipeline
        // but we can try to set it via OpenAIClient if we used that,
        // however ChatClient is what we have here.

        // Count images so GPT-4o can reference them by number
        int imageCount = 0;
        if (request.Media != null)
        {
            foreach (var m in request.Media)
            {
                if (m.Type != "video" && (!string.IsNullOrEmpty(m.Base64) || !string.IsNullOrEmpty(m.Url)))
                    imageCount++;
            }
        }

        string imageRef = imageCount > 0
            ? $"I have attached {imageCount} photo(s) numbered 1 through {imageCount}. Reference them by number in your annotations."
            : "No photos were provided.";

        // Personalization: skill level (#15), zip/permits (#14), owned tools (#5)
        string skillClause = !string.IsNullOrWhiteSpace(request.SkillLevel)
            ? $"\nThe user describes themselves as a {request.SkillLevel} DIYer. Tailor instructions, warnings, and assumed knowledge accordingly."
            : "";
        string zipClause = !string.IsNullOrWhiteSpace(request.Zip)
            ? $"\nThe user is in zip code {request.Zip}. Use this to determine whether a permit is likely required for this work in their jurisdiction (best guess)."
            : "";
        string ownedClause = (request.OwnedTools != null && request.OwnedTools.Length > 0)
            ? $"\nThe user already owns the following tools/materials, so you should NOT include them in shopping_links (but still mention them in tools_and_materials with a marker like '(owned)'): {string.Join(", ", request.OwnedTools)}."
            : "";

        string textContent = $@"I want to do a landscaping project. {(string.IsNullOrEmpty(request.Description) ? "Please analyze the media." : $"Description of my vision: \"{request.Description}\"")}

{imageRef}
{skillClause}{zipClause}{ownedClause}

Return a JSON object with exactly these fields:
{{
  ""title"": ""Landscape Design Title"",
  ""steps"": [
    {{
      ""text"": ""Step description (e.g. soil preparation, planting, mulching)"",
      ""image_annotations"": [
        {{
          ""photo_number"": 1,
          ""description"": ""Describe what to look at in the area photo for this step""
        }}
      ],
      ""reference_image_search"": ""A Google Images search query for a helpful reference landscape design or plant for this step""
    }}
  ],
  ""image_annotations"": [
    {{
      ""photo_number"": 1,
      ""overview"": ""Overall analysis of the outdoor area, soil condition, sunlight, and potential layout""
    }}
  ],
  ""tools_and_materials"": [""plant name"", ""soil type"", ""tools""],
  ""difficulty"": ""easy/medium/hard (complexity of the landscape work)"",
  ""estimated_time"": ""e.g. 1 weekend"",
  ""estimated_cost"": ""e.g. $200-$500"",
  ""youtube_links"": [""https://www.youtube.com/results?search_query=how+to+landscape+this+area""],
  ""shopping_links"": [""specific plant or material name 1"", ""specific tool 2""],
  ""safety_tips"": [""Call 811 before digging"", ""Sun protection"", ""Heavy lifting""],
  ""when_to_call_pro"": [""Large tree removal"", ""Complex drainage issues"", ""Major grading""],
  ""permit_required"": false,
  ""permit_notes"": ""Notes on local HOA or city permits for landscaping/fencing/walls"",
  ""pro_cost"": ""Rough cost if hiring a professional landscaper"",
  ""pro_time"": ""Rough time for a pro crew"",
  ""recommendation"": ""diy or pro — short justification based on area size and complexity"",
  ""diy_vs_pro_summary"": ""1-2 sentence comparison of doing it yourself vs hiring a landscaper""
}}

IMPORTANT for steps:
- Each step's image_annotations should reference user photos by photo_number (1-indexed) when the photo is relevant to that step.
- The top-level image_annotations should provide an overview analysis of the terrain, existing plants, and obstacles.

IMPORTANT for shopping_links:
- List specific plants, seeds, fertilizers, or materials (e.g. ""Kentucky Bluegrass seed"", ""Black cedar mulch"", ""Square point shovel"").
- Be specific so searches return relevant results.

IMPORTANT for youtube_links:
- ALWAYS include 2-4 YouTube search URLs relevant to the landscaping project.";

        bool isSpanish = string.Equals(request.Language, "es", StringComparison.OrdinalIgnoreCase);
        string languageInstruction = isSpanish
            ? " IMPORTANT: All text fields in the JSON response (title, steps, tools_and_materials, difficulty, estimated_time, estimated_cost, safety_tips, when_to_call_pro, image_annotations descriptions and overviews) MUST be written in Spanish. URLs, JSON keys, and search query parameters should remain in English."
            : "";

        var messages = new List<ChatMessage>
        {
            new SystemChatMessage("You are a helpful landscaping and garden design assistant. Analyze any provided photos of outdoor areas carefully. Provide a detailed step-by-step landscaping guide with image annotations referencing the user's photos and suggest reference image searches. Return valid JSON only." + languageInstruction)
        };

        var userMessageParts = new List<ChatMessageContentPart>
        {
            ChatMessageContentPart.CreateTextPart(textContent)
        };

        bool hasValidImages = false;
        if (request.Media != null)
        {
            foreach (var item in request.Media)
            {
                if (item.Type == "video")
                {
                    logger.LogInformation("Skipping video item as OpenAI Chat Completion SDK for images doesn't support direct video parts yet.");
                    continue;
                }

                if (!string.IsNullOrEmpty(item.Base64))
                {
                    if (!InputValidation.IsAcceptableImage(item.Base64, item.MimeType))
                    {
                        logger.LogWarning("analyze: rejected image (size {Size} chars, mime {Mime})",
                            item.Base64.Length, item.MimeType ?? "(none)");
                        continue;
                    }
                    if (imageCount > InputValidation.MaxImagesPerRequest) break;
                    try
                    {
                        byte[] data = Convert.FromBase64String(item.Base64);
                        logger.LogInformation("Processing image part. Size: {Size} bytes, Mime: {Mime}", data.Length, item.MimeType ?? "image/jpeg");
                        userMessageParts.Add(ChatMessageContentPart.CreateImagePart(BinaryData.FromBytes(data), item.MimeType ?? "image/jpeg"));
                        hasValidImages = true;
                    }
                    catch (Exception ex)
                    {
                        logger.LogWarning(ex, "Failed to decode base64 image.");
                    }
                }
                else if (!string.IsNullOrEmpty(item.Url))
                {
                    // Tighten to https-only and reject hostnames OpenAI's
                    // image-fetcher could be coerced into hitting on our
                    // network's behalf (loopback / link-local / RFC1918).
                    // The fetch happens server-to-server from OpenAI's side,
                    // but we still don't want to be the request originator
                    // for arbitrary internal targets.
                    if (Uri.TryCreate(item.Url, UriKind.Absolute, out var uri)
                        && uri.Scheme == "https"
                        && !string.IsNullOrEmpty(uri.Host)
                        && !uri.IsLoopback
                        && !uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
                        && !uri.Host.StartsWith("169.254.", StringComparison.Ordinal)        // link-local / EC2 IMDS
                        && !uri.Host.StartsWith("10.", StringComparison.Ordinal)             // RFC1918
                        && !uri.Host.StartsWith("192.168.", StringComparison.Ordinal)
                        && !(uri.Host.StartsWith("172.", StringComparison.Ordinal) &&
                             int.TryParse(uri.Host.Split('.')[1], out int oct) && oct >= 16 && oct <= 31))
                    {
                        userMessageParts.Add(ChatMessageContentPart.CreateImagePart(uri));
                        hasValidImages = true;
                    }
                    else
                    {
                        logger.LogWarning("Skipping rejected media URL: {Url}", item.Url);
                    }
                }
            }
        }

        if (!hasValidImages && string.IsNullOrEmpty(request.Description))
        {
            return Results.Json(new { error = "Please provide a project description or a valid image." }, statusCode: 400);
        }

        messages.Add(new UserChatMessage(userMessageParts));

        ChatCompletion completion = await client.CompleteChatAsync(messages, options);
        string rawContent = completion.Content[0].Text.Trim();
        logger.LogInformation("OpenAI raw response: {Response}", rawContent);

        string jsonContent = rawContent;
        // Robust JSON extraction
        int firstBrace = rawContent.IndexOf('{');
        int lastBrace = rawContent.LastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace)
        {
            jsonContent = rawContent.Substring(firstBrace, lastBrace - firstBrace + 1);
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<JsonElement>(jsonContent);

            // Post-process: convert shopping_links item names into affiliate links
            using var doc = JsonDocument.Parse(jsonContent);
            var root = doc.RootElement;
            var resultDict = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(jsonContent);

            if (root.TryGetProperty("shopping_links", out var shoppingEl))
            {
                resultDict!["shopping_links"] = JsonSerializer.SerializeToElement(BuildAffiliateLinks(shoppingEl));
            }

            return Results.Ok(resultDict);
        }
        catch (JsonException ex)
        {
            logger.LogError(ex, "Failed to parse OpenAI JSON response. Content: {Content}", jsonContent);
            return Results.Json(new { error = "AI returned invalid JSON", rawResponse = rawContent }, statusCode: 500);
        }
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Error during analysis.");

        if (ex.Message.Contains("400") || ex.Message.Contains("content_filter") || ex.Message.Contains("limit"))
            return Results.Json(new { error = $"OpenAI API Error: {ex.Message}" }, statusCode: 400);

        return Results.Json(new { error = ex.Message }, statusCode: 500);
    }
});

app.MapPost("/api/ask-helper", async ([FromBody] AskHelperRequest request, [FromServices] FeatureFlags flags, ILogger<Program> logger) =>
{
    var gate = AiGate(flags);
    if (gate != null) return gate;

    try
    {
        if (string.IsNullOrEmpty(openAiKey))
        {
            return Results.Json(new { error = "OPENAI_API_KEY is not configured." }, statusCode: 500);
        }

        OpenAIClientOptions clientOptions = BuildOpenAiOptions();
        ChatClient client = new(model: "gpt-4o", new ApiKeyCredential(openAiKey), clientOptions);

        string contextJson = JsonSerializer.Serialize(request.ProjectContext);
        bool askIsSpanish = string.Equals(request.Language, "es", StringComparison.OrdinalIgnoreCase);
        string langClause = askIsSpanish ? " Respond in Spanish." : "";
        string systemPrompt = $"You are a helpful landscaping and garden design assistant. The user is currently working on an outdoor project with the following details: {contextJson}. Answer the user's question clearly and concisely within the context of this landscaping project.{langClause}";

        var messages = new List<ChatMessage>
        {
            new SystemChatMessage(systemPrompt),
            new UserChatMessage(request.Question)
        };

        ChatCompletion completion = await client.CompleteChatAsync(messages);
        string answer = completion.Content[0].Text.Trim();

        return Results.Ok(new { answer });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Error in Ask Helper endpoint.");
        return Results.Json(new { error = ex.Message }, statusCode: 500);
    }
});

// ── Help Request endpoints ──────────────────────────────────────────

// Public, unauthenticated PII intake — the mobile app calls this when the
// user requests a contractor quote. Hardened with:
//   1. Per-IP rate limit (CarHelper had an identical endpoint with no cap and
//      it was the headline finding of its tier-2 review).
//   2. Shape checks + length caps on every field so a hostile actor can't
//      stuff multi-MB strings into the DB row-by-row.
//   3. Single attached photo capped at MaxBase64ImageChars and MIME-validated
//      so a giant base64 blob doesn't bypass the 50 MB request limit by
//      slipping in just under the cap on a flood of small requests.
app.MapPost("/api/help-requests", async (
    [FromBody] CreateHelpRequestDto dto,
    HttpContext context,
    AppDbContext db,
    ILogger<Program> logger) =>
{
    // Basic shape + length validation. Rejected requests get 400 with a stable
    // error code so the mobile UI can surface "please re-enter" without
    // leaking which specific field tripped the regex.
    if (dto == null)
        return Results.Json(new { error = "Missing request body." }, statusCode: 400);
    if (string.IsNullOrWhiteSpace(dto.CustomerName) || dto.CustomerName.Length > InputValidation.MaxShortStringChars)
        return Results.Json(new { error = "customerName is required." }, statusCode: 400);
    if (!InputValidation.LooksLikeEmail(dto.CustomerEmail))
        return Results.Json(new { error = "customerEmail is required." }, statusCode: 400);
    if (string.IsNullOrWhiteSpace(dto.CustomerPhone) || dto.CustomerPhone.Length > InputValidation.MaxShortStringChars)
        return Results.Json(new { error = "customerPhone is required." }, statusCode: 400);
    if (string.IsNullOrWhiteSpace(dto.ProjectTitle) || dto.ProjectTitle.Length > InputValidation.MaxShortStringChars)
        return Results.Json(new { error = "projectTitle is required." }, statusCode: 400);
    if (dto.UserDescription != null && dto.UserDescription.Length > InputValidation.MaxDescriptionChars)
        return Results.Json(new { error = "userDescription is too long." }, statusCode: 400);
    if (dto.ProjectData != null && dto.ProjectData.Length > InputValidation.MaxNotesChars * 4)
        return Results.Json(new { error = "projectData is too long." }, statusCode: 400);
    if (!string.IsNullOrEmpty(dto.ImageBase64) && dto.ImageBase64.Length > InputValidation.MaxBase64ImageChars)
        return Results.Json(new { error = "image is too large." }, statusCode: 400);

    // Per-IP rate limit (PII intake endpoint). CarHelper's tier-2 review
    // flagged the same endpoint shape as a flood vector — 20/hour per IP is
    // ample for a legitimate user and stops drive-by abuse from filling the
    // contractor's queue with junk.
    var clientIp = context.Request.Headers["X-Forwarded-For"].FirstOrDefault()?.Split(',').FirstOrDefault()?.Trim()
                   ?? context.Connection.RemoteIpAddress?.ToString();
    if (!string.IsNullOrEmpty(clientIp)
        && RateLimitHit($"help:ip:{clientIp}", max: 20, window: TimeSpan.FromHours(1)))
    {
        logger.LogWarning("help-requests: per-IP rate limit hit. ip={Ip}", clientIp);
        return Results.Json(
            new { error = "Too many quote requests. Please try again later." },
            statusCode: 429);
    }

    var helpRequest = new HelpRequest
    {
        CustomerName    = InputValidation.Trunc(dto.CustomerName.Trim(),    InputValidation.MaxShortStringChars)!,
        CustomerEmail   = InputValidation.Trunc(dto.CustomerEmail.Trim(),   InputValidation.MaxShortStringChars)!,
        CustomerPhone   = InputValidation.Trunc(dto.CustomerPhone.Trim(),   InputValidation.MaxShortStringChars)!,
        ProjectTitle    = InputValidation.Trunc(dto.ProjectTitle.Trim(),    InputValidation.MaxShortStringChars)!,
        UserDescription = InputValidation.Trunc(dto.UserDescription ?? "",  InputValidation.MaxDescriptionChars)!,
        ProjectData     = InputValidation.Trunc(dto.ProjectData ?? "",      InputValidation.MaxNotesChars * 4)!,
        ImageBase64     = InputValidation.IsAcceptableImage(dto.ImageBase64, null) ? dto.ImageBase64 : null,
        Status          = "new",
        CreatedAt       = DateTime.UtcNow,
        UpdatedAt       = DateTime.UtcNow,
    };
    db.HelpRequests.Add(helpRequest);
    await db.SaveChangesAsync();
    return Results.Created($"/api/help-requests/{helpRequest.Id}", new { id = helpRequest.Id });
});

// Small helper to require admin on a minimal-API endpoint. Returns non-null
// IResult to short-circuit when the request is not from an admin.
IResult? RequireAdmin(HttpContext http)
{
    if (http.User.Identity?.IsAuthenticated != true) return Results.Unauthorized();
    if (http.User.FindFirst("isAdmin")?.Value != "true") return Results.Forbid();
    return null;
}

app.MapGet("/api/help-requests", async ([FromQuery] string? status, HttpContext http, AppDbContext db) =>
{
    var guard = RequireAdmin(http); if (guard != null) return guard;

    var query = db.HelpRequests.AsQueryable();
    if (!string.IsNullOrEmpty(status))
        query = query.Where(r => r.Status == status);

    var results = await query
        .OrderByDescending(r => r.CreatedAt)
        .Select(r => new
        {
            r.Id,
            r.CustomerName,
            r.CustomerEmail,
            r.CustomerPhone,
            r.ProjectTitle,
            r.UserDescription,
            r.Status,
            r.Notes,
            r.FollowUpDate,
            r.CreatedAt,
            r.UpdatedAt
        })
        .ToListAsync();
    return Results.Ok(results);
}).RequireAuthorization();

app.MapGet("/api/help-requests/{id:int}", async (int id, HttpContext http, AppDbContext db) =>
{
    var guard = RequireAdmin(http); if (guard != null) return guard;
    var request = await db.HelpRequests.FindAsync(id);
    return request is not null ? Results.Ok(request) : Results.NotFound();
}).RequireAuthorization();

app.MapPut("/api/help-requests/{id:int}", async (int id, [FromBody] UpdateHelpRequestDto dto, HttpContext http, AppDbContext db) =>
{
    var guard = RequireAdmin(http); if (guard != null) return guard;
    var request = await db.HelpRequests.FindAsync(id);
    if (request is null) return Results.NotFound();

    if (dto.Status is not null) request.Status = dto.Status;
    if (dto.Notes is not null) request.Notes = dto.Notes;
    if (dto.FollowUpDate.HasValue) request.FollowUpDate = dto.FollowUpDate;
    request.UpdatedAt = DateTime.UtcNow;

    await db.SaveChangesAsync();
    return Results.Ok(request);
}).RequireAuthorization();

app.MapDelete("/api/help-requests/{id:int}", async (int id, HttpContext http, AppDbContext db) =>
{
    var guard = RequireAdmin(http); if (guard != null) return guard;
    var request = await db.HelpRequests.FindAsync(id);
    if (request is null) return Results.NotFound();

    db.HelpRequests.Remove(request);
    await db.SaveChangesAsync();
    return Results.NoContent();
}).RequireAuthorization();

// ── #9 verify-step ─────────────────────────────────────────────────
app.MapPost("/api/verify-step", async ([FromBody] VerifyStepRequest req, [FromServices] FeatureFlags flags, ILogger<Program> logger) =>
{
    var gate = AiGate(flags);
    if (gate != null) return gate;

    try
    {
        if (string.IsNullOrEmpty(openAiKey))
            return Results.Json(new { error = "OPENAI_API_KEY is not configured." }, statusCode: 500);

        var clientOptions = BuildOpenAiOptions(TimeSpan.FromMinutes(2));
        ChatClient client = new(model: "gpt-4o", new ApiKeyCredential(openAiKey), clientOptions);

        bool isEs = string.Equals(req.Language, "es", StringComparison.OrdinalIgnoreCase);
        string lang = isEs ? " Respond entirely in Spanish." : "";

        string prompt = $@"You are inspecting a user's photo of completed DIY work to verify quality.
Project: ""{req.ProjectTitle}""
Step they just completed: ""{req.StepText}""

Return JSON only:
{{
  ""rating"": ""good|needs_work|wrong"",
  ""score"": 1-10,
  ""issues"": [""..""],
  ""fixes"": [""..""],
  ""summary"": ""1-2 sentences""
}}{lang}";

        var parts = new List<ChatMessageContentPart> { ChatMessageContentPart.CreateTextPart(prompt) };
        if (!string.IsNullOrEmpty(req.Base64Image))
        {
            if (!InputValidation.IsAcceptableImage(req.Base64Image, req.MimeType))
            {
                logger.LogWarning("verify-step: rejected image (size {Size} chars, mime {Mime})",
                    req.Base64Image.Length, req.MimeType ?? "(none)");
            }
            else
            {
                try
                {
                    byte[] data = Convert.FromBase64String(req.Base64Image);
                    parts.Add(ChatMessageContentPart.CreateImagePart(BinaryData.FromBytes(data), req.MimeType ?? "image/jpeg"));
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "verify-step: failed to decode image");
                }
            }
        }

        var messages = new List<ChatMessage>
        {
            new SystemChatMessage("You are a DIY project quality inspector. Return valid JSON only."),
            new UserChatMessage(parts),
        };
        ChatCompletion completion = await client.CompleteChatAsync(messages);
        string raw = completion.Content[0].Text.Trim();
        int a = raw.IndexOf('{'); int b = raw.LastIndexOf('}');
        if (a >= 0 && b > a) raw = raw.Substring(a, b - a + 1);
        return Results.Content(raw, "application/json");
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "verify-step error");
        return Results.Json(new { error = ex.Message }, statusCode: 500);
    }
});

// ── #10 diagnose ───────────────────────────────────────────────────
app.MapPost("/api/diagnose", async ([FromBody] AnalyzeProjectRequest req, [FromServices] FeatureFlags flags, ILogger<Program> logger) =>
{
    var gate = AiGate(flags);
    if (gate != null) return gate;

    try
    {
        if (string.IsNullOrEmpty(openAiKey))
            return Results.Json(new { error = "OPENAI_API_KEY is not configured." }, statusCode: 500);

        var clientOptions = BuildOpenAiOptions(TimeSpan.FromMinutes(2));
        ChatClient client = new(model: "gpt-4o", new ApiKeyCredential(openAiKey), clientOptions);

        bool isEs = string.Equals(req.Language, "es", StringComparison.OrdinalIgnoreCase);
        string lang = isEs ? " Respond entirely in Spanish." : "";

        string prompt = $@"You are diagnosing a possible home issue. The user has not yet decided what's wrong — they want a ranked list of likely causes and what to check next.

Description: {req.Description ?? "(none)"}

Return JSON only:
{{
  ""possible_causes"": [
    {{ ""issue"": ""…"", ""likelihood"": ""high|medium|low"", ""why"": ""…"", ""next_check"": ""what the user should look for or test next"" }}
  ],
  ""urgency"": ""low|medium|high|emergency"",
  ""call_pro_immediately"": false,
  ""summary"": ""1-2 sentences""
}}{lang}";

        var parts = new List<ChatMessageContentPart> { ChatMessageContentPart.CreateTextPart(prompt) };
        if (req.Media != null)
        {
            int accepted = 0;
            foreach (var m in req.Media)
            {
                if (m.Type == "video") continue;
                if (!InputValidation.IsAcceptableImage(m.Base64, m.MimeType)) continue;
                if (++accepted > InputValidation.MaxImagesPerRequest) break;
                try
                {
                    byte[] data = Convert.FromBase64String(m.Base64!);
                    parts.Add(ChatMessageContentPart.CreateImagePart(BinaryData.FromBytes(data), m.MimeType ?? "image/jpeg"));
                }
                catch { }
            }
        }
        var messages = new List<ChatMessage>
        {
            new SystemChatMessage("You are a home repair diagnostician. Return valid JSON only."),
            new UserChatMessage(parts),
        };
        ChatCompletion completion = await client.CompleteChatAsync(messages);
        string raw = completion.Content[0].Text.Trim();
        int a = raw.IndexOf('{'); int b = raw.LastIndexOf('}');
        if (a >= 0 && b > a) raw = raw.Substring(a, b - a + 1);
        return Results.Content(raw, "application/json");
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "diagnose error");
        return Results.Json(new { error = ex.Message }, statusCode: 500);
    }
});

// ── #11 clarifying questions ───────────────────────────────────────
app.MapPost("/api/clarify", async ([FromBody] AnalyzeProjectRequest req, [FromServices] FeatureFlags flags, ILogger<Program> logger) =>
{
    var gate = AiGate(flags);
    if (gate != null) return gate;

    try
    {
        if (string.IsNullOrEmpty(openAiKey))
            return Results.Json(new { error = "OPENAI_API_KEY is not configured." }, statusCode: 500);

        ChatClient client = new(model: "gpt-4o", new ApiKeyCredential(openAiKey), BuildOpenAiOptions());

        bool isEs = string.Equals(req.Language, "es", StringComparison.OrdinalIgnoreCase);
        string lang = isEs ? " Respond in Spanish." : "";

        string prompt = $@"Before generating a full DIY guide, you may want to ask 2-3 short clarifying questions. The user described: ""{req.Description ?? ""}"".

Return JSON only:
{{
  ""questions"": [
    {{ ""q"": ""short question"", ""why"": ""why this matters"", ""options"": [""option1"", ""option2""] }}
  ]
}}
If the description is already complete and unambiguous, return {{""questions"": []}}.{lang}";

        var parts = new List<ChatMessageContentPart> { ChatMessageContentPart.CreateTextPart(prompt) };
        if (req.Media != null)
        {
            int accepted = 0;
            foreach (var m in req.Media)
            {
                if (m.Type == "video") continue;
                if (!InputValidation.IsAcceptableImage(m.Base64, m.MimeType)) continue;
                if (++accepted > InputValidation.MaxImagesPerRequest) break;
                try
                {
                    byte[] data = Convert.FromBase64String(m.Base64!);
                    parts.Add(ChatMessageContentPart.CreateImagePart(BinaryData.FromBytes(data), m.MimeType ?? "image/jpeg"));
                }
                catch { }
            }
        }
        var messages = new List<ChatMessage>
        {
            new SystemChatMessage("You ask short, useful clarifying questions for DIY projects. Return valid JSON only."),
            new UserChatMessage(parts),
        };
        ChatCompletion completion = await client.CompleteChatAsync(messages);
        string raw = completion.Content[0].Text.Trim();
        int a = raw.IndexOf('{'); int b = raw.LastIndexOf('}');
        if (a >= 0 && b > a) raw = raw.Substring(a, b - a + 1);
        return Results.Content(raw, "application/json");
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "clarify error");
        return Results.Json(new { error = ex.Message }, statusCode: 500);
    }
});

// ── #18 community projects (in-memory; replace with DB if persistent) ──
app.MapPost("/api/community-projects", ([FromBody] CommunityProjectDto dto) =>
{
    var entry = dto with { Id = Guid.NewGuid().ToString(), CreatedAt = DateTime.UtcNow };
    communityProjects.Insert(0, entry);
    return Results.Created($"/api/community-projects/{entry.Id}", entry);
});

app.MapGet("/api/community-projects", ([FromQuery] string? q) =>
{
    var results = communityProjects.AsEnumerable();
    if (!string.IsNullOrWhiteSpace(q))
    {
        var ql = q.ToLowerInvariant();
        results = results.Where(p =>
            (p.Title ?? "").ToLowerInvariant().Contains(ql) ||
            (p.Description ?? "").ToLowerInvariant().Contains(ql));
    }
    return Results.Ok(results.Take(50));
});

// ── #16 emergency directory (static for now) ───────────────────────
app.MapGet("/api/emergency", () =>
{
    return Results.Ok(new
    {
        categories = new[]
        {
            new { id = "water", label = "Active leak / burst pipe", instructions = new[] { "Shut off your home's main water valve.", "Open a faucet to release pressure.", "Move valuables away from the leak." }, callType = "plumber" },
            new { id = "electric", label = "Sparking outlet / shock", instructions = new[] { "Do NOT touch the affected outlet.", "Trip the breaker for that circuit at your panel.", "Unplug nearby devices once safe." }, callType = "electrician" },
            new { id = "gas", label = "Gas smell", instructions = new[] { "Leave the building immediately.", "Do not flip light switches or use phones inside.", "Call your gas utility and 911 from outside." }, callType = "gas-utility" },
            new { id = "fire", label = "Active fire", instructions = new[] { "Get out, stay out, call 911." }, callType = "911" },
        }
    });
});

// ── Whole-house advice ────────────────────────────────────────────
app.MapPost("/api/house-advice", async ([FromBody] WholeHouseRequest req, HttpContext http, AppDbContext db, [FromServices] FeatureFlags flags, ILogger<Program> logger) =>
{
    var gate = AiGate(flags);
    if (gate != null) return gate;

    try
    {
        if (string.IsNullOrEmpty(openAiKey))
            return Results.Json(new { error = "OPENAI_API_KEY is not configured." }, statusCode: 500);

        // Optional auth — manually parse the bearer token so the endpoint stays
        // accessible to anonymous callers, but persists results when a valid
        // token is supplied.
        int? authedUserId = null;
        var authHeader = http.Request.Headers["Authorization"].ToString();
        if (!string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer "))
        {
            try
            {
                var tokenStr = authHeader.Substring("Bearer ".Length).Trim();
                var handler = new JwtSecurityTokenHandler();
                var principal = handler.ValidateToken(tokenStr, new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = JWT_ISSUER,
                    ValidAudience = JWT_AUDIENCE,
                    IssuerSigningKey = new SymmetricSecurityKey(jwtKeyBytes),
                }, out _);
                var idClaim = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (idClaim != null && int.TryParse(idClaim, out int parsed)) authedUserId = parsed;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "house-advice: bearer token validation failed");
            }
        }

        var clientOptions = BuildOpenAiOptions(TimeSpan.FromMinutes(3));
        ChatClient client = new(model: "gpt-4o", new ApiKeyCredential(openAiKey), clientOptions);

        // Build image content parts, labelled by side
        var userParts = new List<ChatMessageContentPart>();
        int imageCount = 0;
        string[] sideNames = { "front", "left", "back", "right" };
        foreach (var side in sideNames)
        {
            var sidePhotos = side switch
            {
                "front" => req.Front,
                "left"  => req.Left,
                "back"  => req.Back,
                "right" => req.Right,
                _ => null
            };
            if (sidePhotos == null) continue;
            foreach (var photo in sidePhotos)
            {
                if (!InputValidation.IsAcceptableImage(photo.Base64, photo.MimeType))
                {
                    logger.LogWarning("house-advice: rejected image for side {Side} (size {Size} chars, mime {Mime})",
                        side, photo.Base64?.Length ?? 0, photo.MimeType ?? "(none)");
                    continue;
                }
                if (imageCount >= InputValidation.MaxImagesPerRequest) break;
                try
                {
                    imageCount++;
                    byte[] data = Convert.FromBase64String(photo.Base64!);
                    userParts.Add(ChatMessageContentPart.CreateTextPart($"[Photo {imageCount}: {side} side of house]"));
                    userParts.Add(ChatMessageContentPart.CreateImagePart(BinaryData.FromBytes(data), photo.MimeType ?? "image/jpeg"));
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "house-advice: failed to decode image for {Side}", side);
                }
            }
        }

        if (imageCount == 0)
            return Results.Json(new { error = "Please provide at least one photo." }, statusCode: 400);

        string budgetClause = !string.IsNullOrWhiteSpace(req.Budget)
            ? $"\nThe homeowner's budget is: {req.Budget}. Prioritize suggestions that fit within this budget, but also include aspirational options clearly marked as over-budget."
            : "";
        string ideasClause = !string.IsNullOrWhiteSpace(req.Ideas)
            ? $"\nThe homeowner mentioned these ideas/preferences: \"{req.Ideas}\". Factor these into your suggestions."
            : "";

        bool isEs = string.Equals(req.Language, "es", StringComparison.OrdinalIgnoreCase);
        string lang = isEs ? " All text fields in the JSON response MUST be written in Spanish." : "";

        string prompt = $@"I've attached {imageCount} photos of a house from all four sides (front, left, back, right). I want landscaping and outdoor improvement suggestions for the entire property.
{budgetClause}{ideasClause}

Analyze the photos and return a JSON object with exactly this structure:
{{
  ""overall_notes"": ""1-2 sentence overview of the property's current state and potential"",
  ""suggestions"": [
    {{
      ""title"": ""Short descriptive title"",
      ""area"": ""Which side(s) of the house this applies to (e.g. Front, Back, Left & Right, All sides)"",
      ""description"": ""2-3 sentence description of what to do and why"",
      ""complexity"": ""easy|medium|hard"",
      ""estimated_cost"": ""e.g. $200-$500"",
      ""estimated_time"": ""e.g. 1 weekend"",
      ""diy_friendly"": true,
      ""materials"": [""specific plant or material""],
      ""steps"": [""Brief step 1"", ""Brief step 2"", ""Brief step 3""],
      ""pro_tip"": ""One helpful tip for this suggestion"",
      ""shopping_links"": [""specific item name 1"", ""specific item name 2""]
    }}
  ]
}}

IMPORTANT:
- Provide 6-12 suggestions covering different areas and price points.
- Sort suggestions from lowest to highest estimated cost.
- Include a mix of easy/medium/hard complexity levels.
- Be specific about plant species, materials, and products.
- For shopping_links, list specific product names (they'll be converted to store links).
- Consider the climate, sun exposure, and existing landscaping visible in the photos.{lang}";

        userParts.Insert(0, ChatMessageContentPart.CreateTextPart(prompt));

        var messages = new List<ChatMessage>
        {
            new SystemChatMessage("You are an expert landscape architect who analyzes property photos and provides actionable, budget-conscious landscaping improvement suggestions. Return valid JSON only."),
            new UserChatMessage(userParts),
        };

        ChatCompletion completion = await client.CompleteChatAsync(messages);
        string raw = completion.Content[0].Text.Trim();
        logger.LogInformation("house-advice raw response length: {Len}", raw.Length);

        int a = raw.IndexOf('{'); int b = raw.LastIndexOf('}');
        if (a >= 0 && b > a) raw = raw.Substring(a, b - a + 1);

        try
        {
            var parsed = JsonSerializer.Deserialize<JsonElement>(raw);

            // Post-process shopping_links into affiliate URLs
            var resultDict = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(raw);
            if (resultDict!.TryGetValue("suggestions", out var suggestionsEl) && suggestionsEl.ValueKind == JsonValueKind.Array)
            {
                var updatedSuggestions = new List<Dictionary<string, object>>();
                foreach (var suggestion in suggestionsEl.EnumerateArray())
                {
                    var sDict = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(suggestion.GetRawText())!;
                    if (sDict.TryGetValue("shopping_links", out var shopEl))
                    {
                        sDict["shopping_links"] = JsonSerializer.SerializeToElement(BuildAffiliateLinks(shopEl));
                    }
                    var converted = new Dictionary<string, object>();
                    foreach (var kv in sDict) converted[kv.Key] = kv.Value;
                    updatedSuggestions.Add(converted);
                }
                resultDict["suggestions"] = JsonSerializer.SerializeToElement(updatedSuggestions);
            }

            // Persist the session if the caller is authenticated. We attach the
            // saved session id back into the response so the app can deep-link
            // into it on the website.
            int? savedSessionId = null;
            if (authedUserId.HasValue)
            {
                try
                {
                    string overallNotes = "";
                    if (resultDict.TryGetValue("overall_notes", out var notesEl) && notesEl.ValueKind == JsonValueKind.String)
                        overallNotes = notesEl.GetString() ?? "";

                    var session = new HouseAdviceSession
                    {
                        UserId = authedUserId.Value,
                        CreatedAt = DateTime.UtcNow,
                        Budget = req.Budget,
                        Ideas = req.Ideas,
                        OverallNotes = overallNotes,
                        SuggestionsJson = JsonSerializer.Serialize(resultDict),
                    };

                    void AddPhotosFromSide(string sideName, WholeHousePhotoItem[]? items)
                    {
                        if (items == null) return;
                        foreach (var p in items)
                        {
                            if (string.IsNullOrEmpty(p.Base64)) continue;
                            session.Photos.Add(new HouseAdvicePhoto
                            {
                                Side = sideName,
                                Base64 = p.Base64,
                                MimeType = p.MimeType ?? "image/jpeg",
                            });
                        }
                    }
                    AddPhotosFromSide("front", req.Front);
                    AddPhotosFromSide("left", req.Left);
                    AddPhotosFromSide("back", req.Back);
                    AddPhotosFromSide("right", req.Right);

                    db.HouseAdviceSessions.Add(session);
                    await db.SaveChangesAsync();
                    savedSessionId = session.Id;
                    resultDict["session_id"] = JsonSerializer.SerializeToElement(savedSessionId);
                    logger.LogInformation("house-advice: saved session {Id} for user {UserId} with {PhotoCount} photos",
                        savedSessionId, authedUserId, session.Photos.Count);
                }
                catch (Exception saveEx)
                {
                    // Don't fail the request if persistence fails — user still gets advice.
                    logger.LogError(saveEx, "house-advice: failed to persist session for user {UserId}", authedUserId);
                }
            }

            return Results.Ok(resultDict);
        }
        catch (JsonException ex)
        {
            logger.LogError(ex, "house-advice: failed to parse JSON. Raw: {Raw}", raw);
            return Results.Json(new { error = "AI returned invalid JSON", rawResponse = raw }, statusCode: 500);
        }
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "house-advice error");
        return Results.Json(new { error = ex.Message }, statusCode: 500);
    }
});

// ── Weather fetch (Zippopotam.us + Open-Meteo, both keyless) ──────
// Returns a tuple of (placeName, humanSummary, dailyForecast[]) or null on failure.
// Caller decides whether to fail the request or proceed without weather.
async Task<WeatherInfo?> FetchWeatherAsync(string zip, ILogger logger, CancellationToken ct)
{
    // Hard-validate the ZIP shape before composing the URL. The base URL is
    // hardcoded so this isn't a true SSRF sink, but rejecting non-numeric input
    // here keeps us from making junk outbound calls and limits what the
    // zippopotam side sees from us.
    if (!InputValidation.LooksLikeZip(zip))
    {
        logger.LogInformation("weather: rejecting non-US-ZIP input shape");
        return null;
    }
    try
    {
        // Step 1: zip → lat/lon/place via Zippopotam.us (US-only; free, no key)
        var geoUrl = $"https://api.zippopotam.us/us/{Uri.EscapeDataString(zip)}";
        using var geoResp = await sharedHttpClient.GetAsync(geoUrl, ct);
        if (!geoResp.IsSuccessStatusCode)
        {
            logger.LogWarning("weather: zippopotam returned {Status} for zip {Zip}", geoResp.StatusCode, zip);
            return null;
        }
        using var geoStream = await geoResp.Content.ReadAsStreamAsync(ct);
        using var geoDoc = await JsonDocument.ParseAsync(geoStream, cancellationToken: ct);
        if (!geoDoc.RootElement.TryGetProperty("places", out var placesEl) ||
            placesEl.ValueKind != JsonValueKind.Array || placesEl.GetArrayLength() == 0)
        {
            return null;
        }
        var place = placesEl[0];
        string placeName = place.TryGetProperty("place name", out var pn) ? pn.GetString() ?? "" : "";
        string stateAbbr = place.TryGetProperty("state abbreviation", out var sa) ? sa.GetString() ?? "" : "";
        if (!double.TryParse(place.GetProperty("latitude").GetString(),
                System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double lat))
            return null;
        if (!double.TryParse(place.GetProperty("longitude").GetString(),
                System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double lon))
            return null;
        // Defensive range check before composing the Open-Meteo URL. The lat/lon
        // come from zippopotam's response, not the user directly, but a
        // compromised or hostile upstream could still try to slip ASCII-only
        // garbage through (URL-injection via the query string). Numeric range
        // bounds make the value harmless regardless.
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180)
        {
            logger.LogWarning("weather: zippopotam returned out-of-range lat/lon for zip {Zip}", zip);
            return null;
        }

        // Step 2: lat/lon → 14-day forecast via Open-Meteo (free, no key)
        var forecastUrl =
            $"https://api.open-meteo.com/v1/forecast?latitude={lat.ToString(System.Globalization.CultureInfo.InvariantCulture)}" +
            $"&longitude={lon.ToString(System.Globalization.CultureInfo.InvariantCulture)}" +
            "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code,wind_speed_10m_max" +
            "&current=temperature_2m,weather_code,wind_speed_10m" +
            "&temperature_unit=fahrenheit&precipitation_unit=inch&wind_speed_unit=mph" +
            "&forecast_days=14&timezone=auto";

        using var fcResp = await sharedHttpClient.GetAsync(forecastUrl, ct);
        if (!fcResp.IsSuccessStatusCode)
        {
            logger.LogWarning("weather: open-meteo returned {Status}", fcResp.StatusCode);
            return null;
        }
        using var fcStream = await fcResp.Content.ReadAsStreamAsync(ct);
        using var fcDoc = await JsonDocument.ParseAsync(fcStream, cancellationToken: ct);
        var daily = fcDoc.RootElement.GetProperty("daily");
        var times = daily.GetProperty("time");
        var maxT = daily.GetProperty("temperature_2m_max");
        var minT = daily.GetProperty("temperature_2m_min");
        var precip = daily.GetProperty("precipitation_sum");
        var precipProb = daily.TryGetProperty("precipitation_probability_max", out var pp) ? pp : default;
        var wcode = daily.GetProperty("weather_code");
        var wind = daily.GetProperty("wind_speed_10m_max");

        var days = new List<DailyForecast>();
        int count = times.GetArrayLength();
        for (int i = 0; i < count; i++)
        {
            days.Add(new DailyForecast(
                times[i].GetString() ?? "",
                maxT[i].ValueKind == JsonValueKind.Number ? maxT[i].GetDouble() : (double?)null,
                minT[i].ValueKind == JsonValueKind.Number ? minT[i].GetDouble() : (double?)null,
                precip[i].ValueKind == JsonValueKind.Number ? precip[i].GetDouble() : (double?)null,
                (precipProb.ValueKind == JsonValueKind.Array && i < precipProb.GetArrayLength() && precipProb[i].ValueKind == JsonValueKind.Number)
                    ? precipProb[i].GetInt32() : (int?)null,
                wcode[i].ValueKind == JsonValueKind.Number ? wcode[i].GetInt32() : (int?)null,
                wind[i].ValueKind == JsonValueKind.Number ? wind[i].GetDouble() : (double?)null,
                WeatherCodeToDescription(wcode[i].ValueKind == JsonValueKind.Number ? wcode[i].GetInt32() : -1)
            ));
        }

        // Build a concise human summary for the prompt
        double totalPrecip = 0; int rainyDays = 0; int freezeDays = 0;
        double? hottest = null, coldest = null;
        foreach (var d in days)
        {
            if (d.PrecipitationInches is double p) { totalPrecip += p; if (p >= 0.1) rainyDays++; }
            if (d.MinF is double mn) { if (mn <= 32) freezeDays++; if (coldest == null || mn < coldest) coldest = mn; }
            if (d.MaxF is double mx) { if (hottest == null || mx > hottest) hottest = mx; }
        }
        string fullPlace = string.IsNullOrEmpty(stateAbbr) ? placeName : $"{placeName}, {stateAbbr}";
        string summary = $"Forecast for {fullPlace} (next {days.Count} days): highs reaching {hottest:F0}°F, lows down to {coldest:F0}°F, " +
                         $"{totalPrecip:F1}\" total precipitation expected across {rainyDays} rainy day(s)" +
                         (freezeDays > 0 ? $", {freezeDays} day(s) at or below freezing." : ".");

        return new WeatherInfo(fullPlace, lat, lon, summary, days);
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "weather: failed to fetch for zip {Zip}", zip);
        return null;
    }
}

// WMO weather codes → human description. See https://open-meteo.com/en/docs.
static string WeatherCodeToDescription(int code) => code switch
{
    0 => "Clear",
    1 => "Mostly clear",
    2 => "Partly cloudy",
    3 => "Overcast",
    45 or 48 => "Fog",
    51 or 53 or 55 => "Drizzle",
    56 or 57 => "Freezing drizzle",
    61 => "Light rain",
    63 => "Rain",
    65 => "Heavy rain",
    66 or 67 => "Freezing rain",
    71 => "Light snow",
    73 => "Snow",
    75 => "Heavy snow",
    77 => "Snow grains",
    80 => "Light showers",
    81 => "Showers",
    82 => "Violent showers",
    85 or 86 => "Snow showers",
    95 => "Thunderstorm",
    96 or 99 => "Thunderstorm with hail",
    _ => "Unknown"
};

// ── Shrubbery advice ──────────────────────────────────────────────
app.MapPost("/api/shrubbery-advice", async ([FromBody] ShrubberyRequest req, HttpContext http, [FromServices] FeatureFlags flags, ILogger<Program> logger) =>
{
    var gate = AiGate(flags);
    if (gate != null) return gate;

    try
    {
        if (string.IsNullOrEmpty(openAiKey))
            return Results.Json(new { error = "OPENAI_API_KEY is not configured." }, statusCode: 500);

        // Fetch real weather data if a zip is provided. Non-fatal on failure —
        // the AI falls back to generic regional reasoning if the forecast is unavailable.
        WeatherInfo? weather = null;
        if (!string.IsNullOrWhiteSpace(req.Zip))
        {
            weather = await FetchWeatherAsync(req.Zip.Trim(), logger, http.RequestAborted);
        }

        var clientOptions = BuildOpenAiOptions(TimeSpan.FromMinutes(3));
        ChatClient client = new(model: "gpt-4o", new ApiKeyCredential(openAiKey), clientOptions);

        var userParts = new List<ChatMessageContentPart>();
        int imageCount = 0;
        if (req.Photos != null)
        {
            foreach (var photo in req.Photos)
            {
                if (!InputValidation.IsAcceptableImage(photo.Base64, photo.MimeType))
                {
                    logger.LogWarning("shrubbery-advice: rejected image (size {Size} chars, mime {Mime})",
                        photo.Base64?.Length ?? 0, photo.MimeType ?? "(none)");
                    continue;
                }
                if (imageCount >= InputValidation.MaxImagesPerRequest) break;
                try
                {
                    imageCount++;
                    byte[] data = Convert.FromBase64String(photo.Base64!);
                    userParts.Add(ChatMessageContentPart.CreateTextPart($"[Photo {imageCount}]"));
                    userParts.Add(ChatMessageContentPart.CreateImagePart(BinaryData.FromBytes(data), photo.MimeType ?? "image/jpeg"));
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "shrubbery-advice: failed to decode image {Index}", imageCount);
                }
            }
        }

        if (imageCount == 0)
            return Results.Json(new { error = "Please provide at least one photo." }, statusCode: 400);

        string zipClause;
        if (weather != null)
        {
            // Real forecast available — give the model the actual data instead of letting it guess.
            var sb = new StringBuilder();
            sb.Append($"\nThe homeowner is located in {weather.Place} (ZIP {req.Zip}). Use this to determine the USDA hardiness zone and current growing season.");
            sb.Append($"\nREAL 14-DAY FORECAST (from Open-Meteo — not estimated): {weather.Summary}");
            sb.Append("\nDaily detail:");
            int shown = 0;
            foreach (var d in weather.Daily)
            {
                if (shown++ >= 10) break;
                sb.Append($"\n  {d.Date}: high {d.MaxF:F0}°F, low {d.MinF:F0}°F, {d.PrecipitationInches:F2}\" precip");
                if (d.PrecipitationProbability.HasValue) sb.Append($" ({d.PrecipitationProbability}% chance)");
                sb.Append($", {d.Description}");
            }
            sb.Append("\nBase your timing and urgency on this actual forecast — call out specific days where weather helps or hinders the work.");
            zipClause = sb.ToString();
        }
        else if (!string.IsNullOrWhiteSpace(req.Zip))
        {
            zipClause = $"\nThe homeowner's ZIP code is {req.Zip}, but a forecast could not be retrieved. Use the ZIP to infer the USDA hardiness zone, typical regional climate, and likely weather for this time of year.";
        }
        else
        {
            zipClause = "\nNo ZIP code was provided — make reasonable assumptions about a temperate climate and note that timing may shift by region.";
        }
        string notesClause = !string.IsNullOrWhiteSpace(req.Notes)
            ? $"\nHomeowner notes: \"{req.Notes}\"."
            : "";
        string today = DateTime.UtcNow.ToString("yyyy-MM-dd");

        bool isEs = string.Equals(req.Language, "es", StringComparison.OrdinalIgnoreCase);
        string lang = isEs ? " All text fields in the JSON response MUST be written in Spanish." : "";

        string prompt = $@"I've attached {imageCount} photo(s) of the homeowner's existing shrubs/bushes/hedges. Today's date is {today}.{zipClause}{notesClause}

Evaluate each distinct shrub (or grouping of the same species) visible in the photos. For each one, identify the species if possible, assess its current health/shape, and recommend what the homeowner should do RIGHT NOW — taking into account the current season, today's date, and the upcoming weather typical for this region and time of year.

Return a JSON object with exactly this structure:
{{
  ""season"": ""current season in this region (e.g. 'Late Spring')"",
  ""hardiness_zone"": ""best-guess USDA zone (e.g. '7a') or null if ZIP not provided"",
  ""overall_notes"": ""1-2 sentence overview of the overall state of the shrubs"",
  ""shrubs"": [
    {{
      ""name"": ""Common name of the shrub, or a descriptor like 'Shrub near front door'"",
      ""species_guess"": ""Best-guess species/cultivar, or 'Unknown'"",
      ""current_condition"": ""1-2 sentences on what you see (overgrown, healthy, diseased, leggy, dead branches, etc.)"",
      ""recommended_action"": ""prune|cut back hard|light trim|shape|replace|remove|fertilize|mulch|water more|leave alone|treat pest/disease"",
      ""action_summary"": ""1 sentence plain-language description of what to do"",
      ""timing"": ""When exactly to do this — e.g. 'Now, before new growth hardens' or 'Wait until after bloom in 3 weeks'"",
      ""urgency"": ""low|medium|high"",
      ""difficulty"": ""easy|medium|hard"",
      ""estimated_time"": ""e.g. '30 min' or '1 afternoon'"",
      ""estimated_cost"": ""e.g. '$0' or '$25-$60'"",
      ""tools_needed"": [""hand pruners"", ""loppers""],
      ""steps"": [""Step 1"", ""Step 2"", ""Step 3""],
      ""pro_tip"": ""One helpful tip specific to this shrub and this season"",
      ""warnings"": [""Any warnings — e.g. 'Do not prune now or you'll remove next year's buds'""],
      ""shopping_links"": [""specific product name 1"", ""specific product name 2""]
    }}
  ]
}}

IMPORTANT:
- Base your timing and urgency on today's date ({today}) and the typical weather for this region over the next few weeks.
- If a shrub should NOT be pruned right now (e.g. spring-flowering shrubs after bud set), say so clearly in warnings and set recommended_action accordingly.
- If a shrub looks dead, diseased, or badly overgrown beyond recovery, recommend replacement and suggest 1-2 climate-appropriate alternatives in steps/pro_tip.
- Be specific about species when possible — homeowners want to know what they have.
- For shopping_links list specific product names (they'll be converted to store links).{lang}";

        userParts.Insert(0, ChatMessageContentPart.CreateTextPart(prompt));

        var messages = new List<ChatMessage>
        {
            new SystemChatMessage("You are a professional arborist and horticulturist who evaluates shrubs from photos and gives timing-aware, region-aware pruning and care advice. Return valid JSON only."),
            new UserChatMessage(userParts),
        };

        ChatCompletion completion = await client.CompleteChatAsync(messages);
        string raw = completion.Content[0].Text.Trim();
        logger.LogInformation("shrubbery-advice raw response length: {Len}", raw.Length);

        int a = raw.IndexOf('{'); int b = raw.LastIndexOf('}');
        if (a >= 0 && b > a) raw = raw.Substring(a, b - a + 1);

        try
        {
            var resultDict = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(raw);
            if (resultDict!.TryGetValue("shrubs", out var shrubsEl) && shrubsEl.ValueKind == JsonValueKind.Array)
            {
                var updated = new List<Dictionary<string, object>>();
                foreach (var shrub in shrubsEl.EnumerateArray())
                {
                    var sDict = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(shrub.GetRawText())!;
                    if (sDict.TryGetValue("shopping_links", out var shopEl))
                    {
                        sDict["shopping_links"] = JsonSerializer.SerializeToElement(BuildAffiliateLinks(shopEl));
                    }
                    var converted = new Dictionary<string, object>();
                    foreach (var kv in sDict) converted[kv.Key] = kv.Value;
                    updated.Add(converted);
                }
                resultDict["shrubs"] = JsonSerializer.SerializeToElement(updated);
            }

            // Attach the real forecast (if we have it) so the UI can render it.
            // This overrides whatever the AI might have said about the weather.
            if (weather != null)
            {
                resultDict["weather_outlook"] = JsonSerializer.SerializeToElement(weather.Summary);
                resultDict["forecast"] = JsonSerializer.SerializeToElement(weather);
            }

            return Results.Ok(resultDict);
        }
        catch (JsonException ex)
        {
            logger.LogError(ex, "shrubbery-advice: failed to parse JSON. Raw: {Raw}", raw);
            return Results.Json(new { error = "AI returned invalid JSON", rawResponse = raw }, statusCode: 500);
        }
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "shrubbery-advice error");
        return Results.Json(new { error = ex.Message }, statusCode: 500);
    }
});

// ── Authentication: register / login / me ─────────────────────────
string IssueJwt(User user)
{
    var handler = new JwtSecurityTokenHandler();
    var creds = new SigningCredentials(new SymmetricSecurityKey(jwtKeyBytes), SecurityAlgorithms.HmacSha256);
    var claims = new List<Claim>
    {
        new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
        new Claim(JwtRegisteredClaimNames.Email, user.Email),
        new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
    };
    if (IsAdminEmail(user.Email))
        claims.Add(new Claim("isAdmin", "true"));

    var token = new JwtSecurityToken(
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        claims: claims,
        expires: DateTime.UtcNow.AddDays(30),
        signingCredentials: creds
    );
    return handler.WriteToken(token);
}

app.MapPost("/api/auth/register", async ([FromBody] AuthRequest req, AppDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
        return Results.Json(new { error = "Email and password are required." }, statusCode: 400);
    if (req.Password.Length < 8)
        return Results.Json(new { error = "Password must be at least 8 characters." }, statusCode: 400);

    var email = req.Email.Trim().ToLowerInvariant();
    if (await db.Users.AnyAsync(u => u.Email == email))
        return Results.Json(new { error = "An account with that email already exists. Try logging in." }, statusCode: 409);

    var user = new User
    {
        Email = email,
        PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
        DisplayName = req.DisplayName,
        CreatedAt = DateTime.UtcNow,
    };
    db.Users.Add(user);
    await db.SaveChangesAsync();

    return Results.Ok(new { token = IssueJwt(user), user = new { user.Id, user.Email, user.DisplayName, isAdmin = IsAdminEmail(user.Email) } });
});

app.MapPost("/api/auth/login", async ([FromBody] AuthRequest req, AppDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
        return Results.Json(new { error = "Email and password are required." }, statusCode: 400);

    var email = req.Email.Trim().ToLowerInvariant();
    var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);
    if (user == null || !BCrypt.Net.BCrypt.Verify(req.Password, user.PasswordHash))
        return Results.Json(new { error = "Invalid email or password." }, statusCode: 401);

    return Results.Ok(new { token = IssueJwt(user), user = new { user.Id, user.Email, user.DisplayName, isAdmin = IsAdminEmail(user.Email) } });
});

app.MapGet("/api/auth/me", (HttpContext http, AppDbContext db) =>
{
    var idClaim = http.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
    if (idClaim == null) return Results.Unauthorized();
    if (!int.TryParse(idClaim, out int userId)) return Results.Unauthorized();
    var user = db.Users.FirstOrDefault(u => u.Id == userId);
    if (user == null) return Results.Unauthorized();
    return Results.Ok(new { user.Id, user.Email, user.DisplayName, user.CreatedAt, isAdmin = IsAdminEmail(user.Email) });
}).RequireAuthorization();

// ── House-advice history: list & detail (authenticated) ───────────
app.MapGet("/api/house-advice/mine", async (HttpContext http, AppDbContext db) =>
{
    var idClaim = http.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
    if (idClaim == null || !int.TryParse(idClaim, out int userId)) return Results.Unauthorized();

    var sessions = await db.HouseAdviceSessions
        .Where(s => s.UserId == userId)
        .OrderByDescending(s => s.CreatedAt)
        .Select(s => new
        {
            s.Id,
            s.CreatedAt,
            s.Budget,
            s.Ideas,
            s.OverallNotes,
            PhotoCount = s.Photos.Count,
        })
        .ToListAsync();

    return Results.Ok(sessions);
}).RequireAuthorization();

app.MapGet("/api/house-advice/{id:int}", async (int id, HttpContext http, AppDbContext db) =>
{
    var idClaim = http.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
    if (idClaim == null || !int.TryParse(idClaim, out int userId)) return Results.Unauthorized();

    var session = await db.HouseAdviceSessions
        .Include(s => s.Photos)
        .FirstOrDefaultAsync(s => s.Id == id && s.UserId == userId);
    if (session == null) return Results.NotFound();

    return Results.Ok(new
    {
        session.Id,
        session.CreatedAt,
        session.Budget,
        session.Ideas,
        session.OverallNotes,
        Suggestions = JsonSerializer.Deserialize<JsonElement>(session.SuggestionsJson),
        Photos = session.Photos.Select(p => new
        {
            p.Id,
            p.Side,
            p.MimeType,
            DataUrl = $"data:{p.MimeType};base64,{p.Base64}",
        }),
    });
}).RequireAuthorization();

// ── OpenAI-backed translation for user-entered / AI-generated content ─
// Kept separate from /api/translate so Google is used for static UI labels
// and OpenAI is used for higher-quality translation of free-form user text.
var contentTranslationCache = new System.Collections.Concurrent.ConcurrentDictionary<string, string>();

app.MapPost("/api/translate-content", async ([FromBody] TranslateRequest req, [FromServices] FeatureFlags flags, ILogger<Program> logger) =>
{
    var gate = AiGate(flags);
    if (gate != null) return gate;

    try
    {
        if (req.Q == null || req.Q.Length == 0 || string.IsNullOrWhiteSpace(req.Target))
            return Results.Json(new { error = "Missing q[] or target." }, statusCode: 400);

        if (string.IsNullOrEmpty(openAiKey))
            return Results.Json(new { error = "OPENAI_API_KEY is not configured." }, statusCode: 500);

        string source = string.IsNullOrWhiteSpace(req.Source) ? "auto" : req.Source!;
        string target = req.Target!.ToLowerInvariant();

        var results = new string[req.Q.Length];
        var missingIndexes = new List<int>();
        var missingTexts = new List<string>();

        for (int i = 0; i < req.Q.Length; i++)
        {
            var key = $"{source}|{target}|{req.Q[i]}";
            if (contentTranslationCache.TryGetValue(key, out var cached))
                results[i] = cached;
            else
            {
                missingIndexes.Add(i);
                missingTexts.Add(req.Q[i] ?? "");
            }
        }

        if (missingTexts.Count == 0)
            return Results.Ok(new { translations = results });

        OpenAIClientOptions clientOptions = BuildOpenAiOptions(TimeSpan.FromMinutes(2));
        ChatClient client = new(model: "gpt-4o-mini", new ApiKeyCredential(openAiKey), clientOptions);

        // Build a numbered list so the model returns a JSON array of the same length
        var numbered = new System.Text.StringBuilder();
        for (int i = 0; i < missingTexts.Count; i++)
            numbered.AppendLine($"[{i}] {missingTexts[i]}");

        string sourceClause = source == "auto"
            ? "Detect the source language automatically."
            : $"The source language is \"{source}\".";

        string prompt = $@"Translate each of the following items to the target language {target}. {sourceClause}
Preserve numbers, proper nouns, URLs, and formatting.
Return ONLY a JSON array of strings in the same order. Do not add commentary.

Items:
{numbered}";

        var messages = new List<ChatMessage>
        {
            new SystemChatMessage("You are a professional translator. You return only a valid JSON array of translated strings, nothing else."),
            new UserChatMessage(prompt),
        };

        ChatCompletion completion = await client.CompleteChatAsync(messages);
        string raw = completion.Content[0].Text.Trim();
        int a = raw.IndexOf('['); int b = raw.LastIndexOf(']');
        if (a >= 0 && b > a) raw = raw.Substring(a, b - a + 1);

        string[] translated;
        try
        {
            translated = JsonSerializer.Deserialize<string[]>(raw) ?? Array.Empty<string>();
        }
        catch (JsonException ex)
        {
            logger.LogError(ex, "translate-content: model returned non-array JSON. Raw: {Raw}", raw);
            return Results.Json(new { error = "Translation response was not a JSON array", rawResponse = raw }, statusCode: 500);
        }

        if (translated.Length != missingTexts.Count)
        {
            logger.LogWarning("translate-content: expected {Expected} items, got {Actual}. Padding.", missingTexts.Count, translated.Length);
            var padded = new string[missingTexts.Count];
            for (int i = 0; i < missingTexts.Count; i++)
                padded[i] = i < translated.Length ? translated[i] : missingTexts[i];
            translated = padded;
        }

        for (int j = 0; j < missingTexts.Count; j++)
        {
            int origIdx = missingIndexes[j];
            results[origIdx] = translated[j];
            var cacheKey = $"{source}|{target}|{missingTexts[j]}";
            contentTranslationCache[cacheKey] = translated[j];
        }

        return Results.Ok(new { translations = results });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "translate-content error");
        return Results.Json(new { error = ex.Message }, statusCode: 500);
    }
});

// ── Google Translate proxy ────────────────────────────────────────
app.MapPost("/api/translate", async ([FromBody] TranslateRequest req, ILogger<Program> logger) =>
{
    try
    {
        if (req.Q == null || req.Q.Length == 0 || string.IsNullOrWhiteSpace(req.Target))
            return Results.Json(new { error = "Missing q[] or target." }, statusCode: 400);

        if (string.IsNullOrEmpty(googleApiKey))
            return Results.Json(new { error = "GOOGLE_API_KEY is not configured on the server." }, statusCode: 500);

        string source = string.IsNullOrWhiteSpace(req.Source) ? "en" : req.Source!;
        string target = req.Target!.ToLowerInvariant();

        // Fast-path: if target == source, return as-is
        if (target == source.ToLowerInvariant())
            return Results.Ok(new { translations = req.Q });

        var results = new string[req.Q.Length];
        var missingIndexes = new List<int>();
        var missingTexts = new List<string>();

        for (int i = 0; i < req.Q.Length; i++)
        {
            var key = $"{source}|{target}|{req.Q[i]}";
            if (translationCache.TryGetValue(key, out var cached))
                results[i] = cached;
            else
            {
                missingIndexes.Add(i);
                missingTexts.Add(req.Q[i]);
            }
        }

        if (missingTexts.Count == 0)
            return Results.Ok(new { translations = results });

        // Google Translate v2 allows up to ~128 strings per request and ~30k chars total.
        // Batch requests to keep payload small.
        const int BATCH_SIZE = 100;
        for (int batchStart = 0; batchStart < missingTexts.Count; batchStart += BATCH_SIZE)
        {
            var batch = missingTexts.Skip(batchStart).Take(BATCH_SIZE).ToList();
            var batchIndexes = missingIndexes.Skip(batchStart).Take(BATCH_SIZE).ToList();

            var payload = new Dictionary<string, object>
            {
                ["q"] = batch,
                ["source"] = source,
                ["target"] = target,
                ["format"] = "text"
            };

            using var request = new HttpRequestMessage(HttpMethod.Post,
                $"https://translation.googleapis.com/language/translate/v2?key={Uri.EscapeDataString(googleApiKey)}");
            request.Content = new StringContent(JsonSerializer.Serialize(payload), System.Text.Encoding.UTF8, "application/json");

            using var googleResponse = await sharedHttpClient.SendAsync(request);
            string body = await googleResponse.Content.ReadAsStringAsync();

            if (!googleResponse.IsSuccessStatusCode)
            {
                logger.LogError("Google Translate API error {Status}: {Body}", googleResponse.StatusCode, body);
                return Results.Json(new { error = "Translation service error", details = body }, statusCode: 502);
            }

            var parsed = JsonSerializer.Deserialize<JsonElement>(body);
            var translations = parsed.GetProperty("data").GetProperty("translations");
            for (int j = 0; j < batch.Count; j++)
            {
                string translated = translations[j].GetProperty("translatedText").GetString() ?? batch[j];
                int origIdx = batchIndexes[j];
                results[origIdx] = translated;
                var cacheKey = $"{source}|{target}|{batch[j]}";
                translationCache[cacheKey] = translated;
            }
        }

        return Results.Ok(new { translations = results });
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "translate error");
        return Results.Json(new { error = ex.Message }, statusCode: 500);
    }
});

app.Run();

// AI kill-switch gate — returns a structured 503 IResult when AI traffic
// should be stopped, otherwise null. Honors the AI_KILL_SWITCH env var
// (read at startup into FeatureFlags). Documented in
// ~/WebstormProjects/DIYHelper2/docs/SECURITY_PLAYBOOK.md as a P0
// incident lever — flip the env var on the shared host and the next
// request to any AI endpoint short-circuits without redeploy.
static IResult? AiGate(FeatureFlags flags)
{
    if (flags.AiKillSwitch)
        return Results.Json(
            new { error = "ai_disabled", code = "ai_kill_switch" },
            statusCode: 503);
    return null;
}

public record VerifyStepRequest(
    [property: JsonPropertyName("stepText")] string StepText,
    [property: JsonPropertyName("projectTitle")] string ProjectTitle,
    [property: JsonPropertyName("base64Image")] string? Base64Image,
    [property: JsonPropertyName("mimeType")] string? MimeType,
    [property: JsonPropertyName("language")] string? Language
);

public record CommunityProjectDto
{
    [JsonPropertyName("id")] public string? Id { get; init; }
    [JsonPropertyName("title")] public string? Title { get; init; }
    [JsonPropertyName("description")] public string? Description { get; init; }
    [JsonPropertyName("difficulty")] public string? Difficulty { get; init; }
    [JsonPropertyName("estimated_time")] public string? EstimatedTime { get; init; }
    [JsonPropertyName("estimated_cost")] public string? EstimatedCost { get; init; }
    [JsonPropertyName("steps")] public object? Steps { get; init; }
    [JsonPropertyName("tools_and_materials")] public object? ToolsAndMaterials { get; init; }
    [JsonPropertyName("photoUri")] public string? PhotoUri { get; init; }
    [JsonPropertyName("createdAt")] public DateTime CreatedAt { get; init; }
}

public record CreateHelpRequestDto(
    [property: JsonPropertyName("customerName")] string CustomerName,
    [property: JsonPropertyName("customerEmail")] string CustomerEmail,
    [property: JsonPropertyName("customerPhone")] string CustomerPhone,
    [property: JsonPropertyName("projectTitle")] string ProjectTitle,
    [property: JsonPropertyName("userDescription")] string UserDescription,
    [property: JsonPropertyName("projectData")] string ProjectData,
    [property: JsonPropertyName("imageBase64")] string? ImageBase64
);

public record UpdateHelpRequestDto(
    [property: JsonPropertyName("status")] string? Status,
    [property: JsonPropertyName("notes")] string? Notes,
    [property: JsonPropertyName("followUpDate")] DateTime? FollowUpDate
);

public record AskHelperRequest(
    [property: JsonPropertyName("question")] string Question,
    [property: JsonPropertyName("projectContext")] object ProjectContext,
    [property: JsonPropertyName("language")] string? Language
);

public record AnalyzeProjectRequest(
    [property: JsonPropertyName("description")] string? Description,
    [property: JsonPropertyName("media")] MediaItem[]? Media,
    [property: JsonPropertyName("language")] string? Language,
    [property: JsonPropertyName("skillLevel")] string? SkillLevel,
    [property: JsonPropertyName("zip")] string? Zip,
    [property: JsonPropertyName("ownedTools")] string[]? OwnedTools
);

public record MediaItem(
    [property: JsonPropertyName("uri")] string? Url,
    [property: JsonPropertyName("base64")] string? Base64,
    [property: JsonPropertyName("mimeType")] string? MimeType,
    [property: JsonPropertyName("type")] string? Type
);

public record AuthRequest(
    [property: JsonPropertyName("email")] string Email,
    [property: JsonPropertyName("password")] string Password,
    [property: JsonPropertyName("displayName")] string? DisplayName
);

public record DeleteAccountDto(
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("email")] string? Email,
    [property: JsonPropertyName("phone")] string? Phone
);

public record TranslateRequest(
    [property: JsonPropertyName("q")] string[]? Q,
    [property: JsonPropertyName("target")] string? Target,
    [property: JsonPropertyName("source")] string? Source
);

public record WholeHousePhotoItem(
    [property: JsonPropertyName("base64")] string? Base64,
    [property: JsonPropertyName("mimeType")] string? MimeType
);

public record WholeHouseRequest(
    [property: JsonPropertyName("front")] WholeHousePhotoItem[]? Front,
    [property: JsonPropertyName("left")] WholeHousePhotoItem[]? Left,
    [property: JsonPropertyName("back")] WholeHousePhotoItem[]? Back,
    [property: JsonPropertyName("right")] WholeHousePhotoItem[]? Right,
    [property: JsonPropertyName("budget")] string? Budget,
    [property: JsonPropertyName("ideas")] string? Ideas,
    [property: JsonPropertyName("language")] string? Language
);

public record ShrubberyRequest(
    [property: JsonPropertyName("photos")] WholeHousePhotoItem[]? Photos,
    [property: JsonPropertyName("zip")] string? Zip,
    [property: JsonPropertyName("notes")] string? Notes,
    [property: JsonPropertyName("language")] string? Language
);

public record DailyForecast(
    [property: JsonPropertyName("date")] string Date,
    [property: JsonPropertyName("high_f")] double? MaxF,
    [property: JsonPropertyName("low_f")] double? MinF,
    [property: JsonPropertyName("precip_in")] double? PrecipitationInches,
    [property: JsonPropertyName("precip_prob")] int? PrecipitationProbability,
    [property: JsonPropertyName("weather_code")] int? WeatherCode,
    [property: JsonPropertyName("wind_mph")] double? WindMph,
    [property: JsonPropertyName("description")] string Description
);

public record WeatherInfo(
    [property: JsonPropertyName("place")] string Place,
    [property: JsonPropertyName("latitude")] double Latitude,
    [property: JsonPropertyName("longitude")] double Longitude,
    [property: JsonPropertyName("summary")] string Summary,
    [property: JsonPropertyName("daily")] List<DailyForecast> Daily
);

