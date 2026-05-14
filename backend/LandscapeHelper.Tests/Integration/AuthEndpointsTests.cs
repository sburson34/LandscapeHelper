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
