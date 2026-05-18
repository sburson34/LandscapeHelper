using Microsoft.AspNetCore.Hosting;

namespace LandscapeHelper.Tests.Infrastructure;

/// <summary>
/// Variant of <see cref="ApiFactory"/> that points the OpenAI SDK at an
/// in-process <see cref="FakeOpenAiServer"/> via the <c>OPENAI_BASE_URL</c>
/// + <c>OPENAI_API_KEY</c> env vars. Use one factory per test to keep the
/// scripted-response queue isolated; await <see cref="EnsureStartedAsync"/>
/// (or just call <c>CreateClient()</c>) to materialize the host.
///
/// Why env vars and not DI: Program.cs reads <c>OPENAI_API_KEY</c> at startup
/// and caches it in a closed-over local, so swapping a DI registration would
/// not reach the analyze / ask-helper / verify-step handlers. Setting the env
/// vars in <c>ConfigureWebHost</c> happens before <c>Program.Main</c> runs.
/// </summary>
public sealed class FakeOpenAiApiFactory : ApiFactory
{
    private FakeOpenAiServer? _fake;

    public FakeOpenAiServer Fake => _fake
        ?? throw new InvalidOperationException(
            "Call CreateClient() (or EnsureStartedAsync) before accessing the fake server.");

    public async Task EnsureStartedAsync()
    {
        if (_fake == null)
        {
            _fake = await FakeOpenAiServer.StartAsync();
            Environment.SetEnvironmentVariable("OPENAI_API_KEY", "sk-test-key-for-fake-server");
            Environment.SetEnvironmentVariable("OPENAI_BASE_URL", _fake.BaseUrl);
        }
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // CreateClient() implicitly triggers ConfigureWebHost. Start the fake
        // here (sync over async is fine — we're already on a thread-pool worker
        // and the host startup is itself sync over async further down the call
        // tree).
        if (_fake == null) EnsureStartedAsync().GetAwaiter().GetResult();
        base.ConfigureWebHost(builder);
    }

    public new async Task DisposeAsync()
    {
        await base.DisposeAsync();
        if (_fake is not null) await _fake.DisposeAsync();

        Environment.SetEnvironmentVariable("OPENAI_API_KEY", null);
        Environment.SetEnvironmentVariable("OPENAI_BASE_URL", null);
    }
}
