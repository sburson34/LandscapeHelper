using System.Net;
using System.Net.Http.Json;
using LandscapeHelper.Tests.Infrastructure;

namespace LandscapeHelper.Tests.Integration;

/// <summary>
/// Privacy deletion endpoint contract:
///   - 400 when neither email nor phone are provided
///   - 200 + pending_verification when contact info is present
///   - 200 (with a fake requestId) once the per-IP cap is hit — the endpoint
///     must not become an existence oracle or DoS amplifier
/// </summary>
public class AccountDeleteEndpointTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public AccountDeleteEndpointTests(ApiFactory factory) => _factory = factory;

    [Fact]
    public async Task MissingEmailAndPhone_Returns400()
    {
        var client = _factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/account/delete", new { name = "Bob" });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task WithEmail_QueuesRequest()
    {
        var client = _factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/account/delete", new
        {
            name = "Carol",
            email = $"carol-{Guid.NewGuid():N}@example.com",
        });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var body = await resp.Content.ReadAsStringAsync();
        Assert.Contains("\"status\":\"pending_verification\"", body);
        Assert.Contains("\"requestId\":", body);
    }

    [Fact]
    public async Task WithPhoneOnly_QueuesRequest()
    {
        var client = _factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/account/delete", new
        {
            phone = "5558675309",
        });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadAsStringAsync();
        Assert.Contains("\"status\":\"pending_verification\"", body);
    }

    [Fact]
    public async Task EmptyStringsTreatedAsMissing()
    {
        var client = _factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/account/delete", new
        {
            email = "",
            phone = "   ",
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }
}
