using System.Net;
using System.Net.Http.Json;
using LandscapeHelper.Tests.Infrastructure;

namespace LandscapeHelper.Tests.Integration;

/// <summary>
/// Sanity checks for the two AI-backed advice endpoints. Without an OpenAI
/// API key configured (the default in the test environment), both return 500
/// with a clear "OPENAI_API_KEY is not configured" message — which is the
/// safest possible behaviour and exactly what the prod ApiFactory should test
/// against once a stub AI client is wired in.
/// </summary>
[Collection("SerialEnv")]
public class HouseAdviceEndpointsTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public HouseAdviceEndpointsTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task WholeHouse_WithoutAiKey_Returns500_NotCrashes()
    {
        var client = _factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/house-advice", new
        {
            photos = new[]
            {
                new { side = "front", base64 = "iVBORw0KG", mimeType = "image/png" },
            },
            budget = "$500",
            ideas = "Front-yard refresh",
            language = "en",
        });
        // Without a key the handler short-circuits with a 500 JSON body —
        // important: it must not throw, must include a parseable error.
        Assert.Equal(HttpStatusCode.InternalServerError, resp.StatusCode);
        var body = await resp.Content.ReadAsStringAsync();
        Assert.Contains("OPENAI_API_KEY", body);
    }

    [Fact]
    public async Task Shrubbery_WithoutAiKey_Returns500()
    {
        var client = _factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/shrubbery-advice", new
        {
            photos = new[]
            {
                new { side = "spot", base64 = "iVBORw0KG", mimeType = "image/png" },
            },
            zip = "12345",
            notes = "Sunny corner",
            language = "en",
        });
        Assert.Equal(HttpStatusCode.InternalServerError, resp.StatusCode);
    }
}
