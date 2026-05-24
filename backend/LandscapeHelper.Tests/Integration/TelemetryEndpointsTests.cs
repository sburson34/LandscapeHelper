using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LandscapeHelper.Api.Data;
using LandscapeHelper.Tests.Infrastructure;
using Microsoft.Extensions.DependencyInjection;

namespace LandscapeHelper.Tests.Integration;

/// <summary>
/// Anonymous telemetry ingest persists events; the usage-digest endpoint
/// returns an aggregated rollup (open in the Development/Testing host
/// environment via the shared UsageDigestGate). The ingest endpoint needs no
/// auth by design — events are keyed on a per-install AnonId, never a user.
/// </summary>
public class TelemetryEndpointsTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public TelemetryEndpointsTests(ApiFactory factory) => _factory = factory;

    private record EventDto(string Name, Guid AnonId, Guid SessionId, DateTime ClientTs,
        string? AppVersion, string? Platform, object? Props);
    private record BatchDto(List<EventDto> Events);

    [Fact]
    public async Task Ingest_IsAnonymous_AndPersists()
    {
        var client = _factory.CreateClient();
        var anon = Guid.NewGuid();
        var session = Guid.NewGuid();
        var batch = new BatchDto(new()
        {
            new("app_opened", anon, session, DateTime.UtcNow, "1.0.0", "android", null),
            new("screen_viewed", anon, session, DateTime.UtcNow, "1.0.0", "android", new { screen = "Home" }),
        });

        var resp = await client.PostAsJsonAsync("/api/telemetry/events", batch);
        Assert.Equal(HttpStatusCode.Accepted, resp.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(2, db.AnalyticsEvents.Count(e => e.AnonId == anon));
    }

    [Fact]
    public async Task Digest_ReturnsAggregatedRollup()
    {
        var client = _factory.CreateClient();
        var anon = Guid.NewGuid();
        var session = Guid.NewGuid();
        var batch = new BatchDto(new()
        {
            new("app_opened", anon, session, DateTime.UtcNow, "1.0.0", "android", null),
            new("screen_viewed", anon, session, DateTime.UtcNow, "1.0.0", "android", new { screen = "DigestHome" }),
        });
        await client.PostAsJsonAsync("/api/telemetry/events", batch);

        var digest = await client.GetFromJsonAsync<JsonElement>("/api/admin/usage-digest?days=30");

        Assert.True(digest.GetProperty("totalEvents").GetInt64() >= 2);
        var screens = digest.GetProperty("screens").EnumerateArray()
            .Select(s => s.GetProperty("screen").GetString()).ToList();
        Assert.Contains("DigestHome", screens);
    }
}
