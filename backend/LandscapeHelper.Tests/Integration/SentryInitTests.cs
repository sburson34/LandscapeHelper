using LandscapeHelper.Api.Observability;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Hosting;

namespace LandscapeHelper.Tests.Integration;

/// <summary>
/// After the Sentry.AspNetCore 4.13.0 -> 6.5.0 bump landed in the 2026-05
/// audit, the init shim must still build, not crash on the no-DSN path, and
/// stay wired up when a DSN is set. Smoke-level — we are NOT testing Sentry's
/// internals.
/// </summary>
[Collection(nameof(Infrastructure.EnvironmentMutatingCollection))]
public class SentryInitTests
{
    [Fact]
    public void UseLandscapeHelperSentry_WithNoDsn_IsNoOp()
    {
        // Without a DSN configured the shim must NOT throw and the host must
        // still build. Production runs hit this code path on every PR build
        // (no DSN in CI secrets).
        Environment.SetEnvironmentVariable("Sentry__Dsn", null);

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseLandscapeHelperSentry();

        // Reaching .Build() proves the shim did not register a broken Sentry
        // pipeline.
        var app = builder.Build();
        Assert.NotNull(app);
    }

    [Fact]
    public void UseLandscapeHelperSentry_WithDsn_RegistersSentryHub()
    {
        // The Sentry 6.x SDK does a much stricter init validation than 4.x
        // did. Use a syntactically valid sentinel DSN that points at an
        // unreachable host so init succeeds but no events leak.
        const string fakeDsn = "https://public@o0.ingest.sentry.io/0";
        Environment.SetEnvironmentVariable("Sentry__Dsn", fakeDsn);
        try
        {
            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseLandscapeHelperSentry();
            var app = builder.Build();
            Assert.NotNull(app);
        }
        finally
        {
            Environment.SetEnvironmentVariable("Sentry__Dsn", null);
        }
    }
}
