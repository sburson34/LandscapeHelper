using System.Net;
using System.Net.Http.Json;
using LandscapeHelper.Api.Integrations;
using LandscapeHelper.Tests.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace LandscapeHelper.Tests.Integration;

/// <summary>
/// Test factory that forces <see cref="FeatureFlags.AiKillSwitch"/> on by
/// swapping the singleton FeatureFlags registration with an instance built
/// from a temporarily-set env var. Done this way (rather than mutating
/// AI_KILL_SWITCH globally inside a [Fact]) so the kill-switch tests don't
/// race with other xunit collections that build their own ApiFactory at the
/// same time and bake the wrong flag value in.
/// </summary>
public class KillSwitchApiFactory : ApiFactory
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.ConfigureServices(services =>
        {
            // Strip the production FeatureFlags singleton (Program.cs at line
            // ~164) and replace with a flag-on instance. The replacement
            // must be a singleton too — endpoints inject it directly.
            var existing = services.Where(d => d.ServiceType == typeof(FeatureFlags)).ToList();
            foreach (var d in existing) services.Remove(d);

            Environment.SetEnvironmentVariable("AI_KILL_SWITCH", "true");
            try
            {
                var flags = new FeatureFlags();
                services.AddSingleton(flags);
            }
            finally
            {
                Environment.SetEnvironmentVariable("AI_KILL_SWITCH", null);
            }
        });
    }
}

/// <summary>
/// AI_KILL_SWITCH is the P0 incident lever from the security playbook —
/// flipping the env var must short-circuit every AI-backed endpoint with
/// a structured 503 before OpenAI is invoked. Without these tests the
/// flag is dead-on-arrival the next time it gets needed.
/// </summary>
public class AiKillSwitchEndpointsTests
{
    [Theory]
    [InlineData("/api/analyze")]
    [InlineData("/api/ask-helper")]
    [InlineData("/api/verify-step")]
    [InlineData("/api/diagnose")]
    [InlineData("/api/clarify")]
    [InlineData("/api/house-advice")]
    [InlineData("/api/shrubbery-advice")]
    [InlineData("/api/translate-content")]
    public async Task AiEndpoints_WhenKillSwitchOn_Return503(string path)
    {
        await using var factory = new KillSwitchApiFactory();
        await factory.InitializeAsync();
        var client = factory.CreateClient();

        var resp = await client.PostAsJsonAsync(path, new { });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, resp.StatusCode);

        var body = await resp.Content.ReadAsStringAsync();
        Assert.Contains("ai_kill_switch", body);
        Assert.Contains("ai_disabled", body);
    }

    [Fact]
    public async Task AiEndpoint_WithDefaultFactory_DoesNotReturn503()
    {
        // Vanilla factory: AI_KILL_SWITCH unset → FeatureFlags.AiKillSwitch=false.
        await using var factory = new ApiFactory();
        await factory.InitializeAsync();
        var client = factory.CreateClient();

        var resp = await client.PostAsJsonAsync("/api/analyze", new { });
        // Without the key configured we get 500 ("OPENAI_API_KEY is not
        // configured.") — not 503. The point: the gate is invisible when the
        // flag is off.
        Assert.NotEqual(HttpStatusCode.ServiceUnavailable, resp.StatusCode);
    }
}
