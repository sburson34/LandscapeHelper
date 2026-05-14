using System.Net;
using LandscapeHelper.Tests.Infrastructure;

namespace LandscapeHelper.Tests.Integration;

/// <summary>
/// Smoke tests for endpoints that power boot-time health + feature polling.
/// These are the canaries for startup wiring — CORS, DI, middleware,
/// FeatureFlags registration, and the controller / minimal-API map.
/// </summary>
public class HealthAndFeaturesEndpointsTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public HealthAndFeaturesEndpointsTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Root_ReturnsRunningMessage()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("LandscapeHelper API is running", body);
    }

    [Fact]
    public async Task Healthz_Returns200()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/healthz");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task HealthController_Returns200()
    {
        // The pre-existing controller at /api/health (distinct from /healthz)
        // returns plain "API Running" — verify it still works behind the
        // middleware trio.
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Healthz_ReturnsCorrelationIdHeader()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/healthz");
        Assert.True(
            response.Headers.Contains("X-Correlation-ID"),
            "Health responses must echo a correlation ID for trace linking."
        );
    }

    [Fact]
    public async Task Features_Returns200AndExpectedShape()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/features");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("\"shrubberyAdvice\"", body);
        Assert.Contains("\"wholeHouseAdvice\"", body);
        Assert.Contains("\"aiKillSwitch\"", body);
    }
}
