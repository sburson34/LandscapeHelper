using System.Net;
using System.Net.Http.Json;
using LandscapeHelper.Tests.Infrastructure;

namespace LandscapeHelper.Tests.Integration;

/// <summary>
/// Quote-request submission flow — the public-facing path the mobile app
/// hits when the user asks a contractor for a quote from inside the app.
/// </summary>
public class HelpRequestsEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public HelpRequestsEndpointTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task PostHelpRequest_Returns201WithId()
    {
        var client = _factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/help-requests", new
        {
            customerName = "Tester",
            customerEmail = "tester@example.com",
            customerPhone = "5550100",
            projectTitle = "Re-mulch front beds",
            userDescription = "Want fresh hardwood mulch in two beds, ~200 sq ft.",
            projectData = "{}",
            imageBase64 = (string?)null,
        });

        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);
        var body = await resp.Content.ReadAsStringAsync();
        Assert.Contains("\"id\":", body);
    }

    [Fact]
    public async Task PostHelpRequest_PersistsThroughTheDb()
    {
        var client = _factory.CreateClient();
        var title = $"Lawn aeration {Guid.NewGuid():N}";
        var resp = await client.PostAsJsonAsync("/api/help-requests", new
        {
            customerName = "Tester",
            customerEmail = "persist@example.com",
            customerPhone = "5550100",
            projectTitle = title,
            userDescription = "Quarter-acre lawn, hard-pan clay.",
            projectData = "{}",
            imageBase64 = (string?)null,
        });
        Assert.Equal(HttpStatusCode.Created, resp.StatusCode);

        // Submitting the same payload again should still succeed — there is
        // no per-email uniqueness; quote requests can be repeated.
        var resp2 = await client.PostAsJsonAsync("/api/help-requests", new
        {
            customerName = "Tester",
            customerEmail = "persist@example.com",
            customerPhone = "5550100",
            projectTitle = title,
            userDescription = "Second submission, same project.",
            projectData = "{}",
            imageBase64 = (string?)null,
        });
        Assert.Equal(HttpStatusCode.Created, resp2.StatusCode);
    }
}
