using System.Net;
using System.Net.Http.Json;
using LandscapeHelper.Tests.Infrastructure;

namespace LandscapeHelper.Tests.Integration;

/// <summary>
/// Phase-2 hardening regressions for the public PII intake endpoint.
/// These were the gaps CarHelper's tier-2 review surfaced and we're
/// preventing the same regressions here.
/// </summary>
public class HelpRequestsValidationTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public HelpRequestsValidationTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task PostHelpRequest_MissingEmail_Returns400()
    {
        var client = _factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/help-requests", new
        {
            customerName = "Tester",
            customerEmail = "",
            customerPhone = "5550100",
            projectTitle = "Mulch",
            userDescription = "x",
            projectData = "{}",
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task PostHelpRequest_InvalidEmail_Returns400()
    {
        var client = _factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/help-requests", new
        {
            customerName = "Tester",
            customerEmail = "not-an-email",
            customerPhone = "5550100",
            projectTitle = "Mulch",
            userDescription = "x",
            projectData = "{}",
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task PostHelpRequest_OversizeImage_Returns400()
    {
        var client = _factory.CreateClient();
        // Forge a ~9 MB base64 string — over the 8 MB cap.
        var oversize = new string('A', 9 * 1024 * 1024);
        var resp = await client.PostAsJsonAsync("/api/help-requests", new
        {
            customerName = "Tester",
            customerEmail = "test@example.com",
            customerPhone = "5550100",
            projectTitle = "Mulch",
            userDescription = "x",
            projectData = "{}",
            imageBase64 = oversize,
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task PostHelpRequest_OversizeDescription_Returns400()
    {
        var client = _factory.CreateClient();
        var oversize = new string('x', 10_000);
        var resp = await client.PostAsJsonAsync("/api/help-requests", new
        {
            customerName = "Tester",
            customerEmail = "test@example.com",
            customerPhone = "5550100",
            projectTitle = "Mulch",
            userDescription = oversize,
            projectData = "{}",
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }
}

/// <summary>
/// Defense-in-depth HTTP headers must appear on every response, including
/// the unauthenticated health endpoint.
/// </summary>
public class SecurityHeadersTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public SecurityHeadersTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task HealthEndpoint_SetsSecurityHeaders()
    {
        var client = _factory.CreateClient();
        var resp = await client.GetAsync("/healthz");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        Assert.True(resp.Headers.Contains("X-Content-Type-Options"));
        Assert.True(resp.Headers.Contains("Referrer-Policy"));
        Assert.True(resp.Headers.Contains("X-Frame-Options"));
        Assert.True(resp.Headers.Contains("Permissions-Policy"));
    }
}
