using System.Net;
using System.Net.Http.Json;
using LandscapeHelper.Tests.Infrastructure;

namespace LandscapeHelper.Tests.Integration;

/// <summary>
/// /api/auth/register + /api/auth/login. The endpoints rely on BCrypt for
/// password hashing and an ephemeral JWT signing key when SECRET_ARN /
/// JWT_SIGNING_KEY are absent (the test environment matches that path).
/// </summary>
public class AuthEndpointsTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public AuthEndpointsTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Register_WithValidPayload_Returns200AndJwt()
    {
        var client = _factory.CreateClient();
        var email = $"reg-{Guid.NewGuid():N}@example.com";
        var resp = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password = "correct-horse-battery-staple",
            displayName = "Greenthumb",
        });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadAsStringAsync();
        Assert.Contains("\"token\":", body);
        Assert.Contains(email, body);
    }

    [Fact]
    public async Task Register_TooShortPassword_Returns400()
    {
        var client = _factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = $"short-{Guid.NewGuid():N}@example.com",
            password = "short",
            displayName = (string?)null,
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Register_MissingEmail_Returns400()
    {
        var client = _factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "",
            password = "long-enough-password",
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Register_Duplicate_Returns409()
    {
        var client = _factory.CreateClient();
        var email = $"dup-{Guid.NewGuid():N}@example.com";
        var first = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password = "correct-horse-battery-staple",
        });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password = "correct-horse-battery-staple",
        });
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }

    /// <summary>
    /// Email addresses must be treated case-insensitively. Registering the same
    /// address with different casing must collide with the existing user — anything
    /// else allows two accounts at "the same" address and is a classic auth bug.
    /// Register normalizes via .Trim().ToLowerInvariant() before the uniqueness check.
    /// </summary>
    [Fact]
    public async Task Register_DuplicateDifferentCase_Returns409()
    {
        var client = _factory.CreateClient();
        var suffix = Guid.NewGuid().ToString("N");
        var lower = $"case-{suffix}@example.com";
        var upper = $"CASE-{suffix}@EXAMPLE.COM";

        var first = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = lower,
            password = "correct-horse-battery-staple",
        });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = upper,
            password = "correct-horse-battery-staple",
        });
        Assert.Equal(HttpStatusCode.Conflict, second.StatusCode);
    }

    /// <summary>
    /// Login must succeed regardless of how the email was cased at register-time
    /// or login-time. The service normalizes on both sides.
    /// </summary>
    [Fact]
    public async Task Login_DifferentCaseFromRegister_Returns200()
    {
        var client = _factory.CreateClient();
        var suffix = Guid.NewGuid().ToString("N");
        var lower = $"login-case-{suffix}@example.com";
        var upper = $"LOGIN-CASE-{suffix}@EXAMPLE.COM";
        const string password = "correct-horse-battery-staple";

        var reg = await client.PostAsJsonAsync("/api/auth/register", new { email = lower, password });
        Assert.Equal(HttpStatusCode.OK, reg.StatusCode);

        var login = await client.PostAsJsonAsync("/api/auth/login", new { email = upper, password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    }

    [Fact]
    public async Task Login_AfterRegister_Returns200()
    {
        var client = _factory.CreateClient();
        var email = $"login-{Guid.NewGuid():N}@example.com";
        const string password = "correct-horse-battery-staple";

        var reg = await client.PostAsJsonAsync("/api/auth/register", new { email, password });
        Assert.Equal(HttpStatusCode.OK, reg.StatusCode);

        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var body = await login.Content.ReadAsStringAsync();
        Assert.Contains("\"token\":", body);
    }

    [Fact]
    public async Task Login_WrongPassword_Returns401()
    {
        var client = _factory.CreateClient();
        var email = $"badpw-{Guid.NewGuid():N}@example.com";
        var reg = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password = "correct-horse-battery-staple",
        });
        Assert.Equal(HttpStatusCode.OK, reg.StatusCode);

        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email,
            password = "not-the-password",
        });
        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);
    }

    [Fact]
    public async Task Login_UnknownEmail_Returns401()
    {
        var client = _factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = $"ghost-{Guid.NewGuid():N}@example.com",
            password = "any-password-at-all",
        });
        Assert.Equal(HttpStatusCode.Unauthorized, login.StatusCode);
    }
}
