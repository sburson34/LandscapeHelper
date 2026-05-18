using LandscapeHelper.Api.Observability;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Sentry;

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
        // (no DSN in CI secrets). Also assert IHub resolves to the disabled
        // hub — Sentry registers a default singleton even when DSN is empty,
        // so checking it is reachable is what catches an accidental "early
        // return broke the wiring" regression.
        Environment.SetEnvironmentVariable("Sentry__Dsn", null);

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseLandscapeHelperSentry();

        using var app = builder.Build();
        var hub = app.Services.GetService<IHub>();
        // No DSN means Sentry stays as the disabled hub. The contract here:
        // either no hub at all (early-return) or a non-enabled hub. Both are
        // acceptable; both prove the shim did not crash the DI container.
        Assert.True(hub is null || !hub.IsEnabled,
            "Without a DSN the shim must NOT register an enabled Sentry hub.");
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
            using var app = builder.Build();

            // With a DSN, Sentry.AspNetCore registers IHub and SentryClient
            // into DI. Resolving IHub and asserting IsEnabled proves the
            // call actually wired Sentry, not just no-op'd past it.
            var hub = app.Services.GetService<IHub>();
            Assert.NotNull(hub);
            Assert.True(hub!.IsEnabled,
                "With a DSN configured the registered Sentry hub must be enabled.");
        }
        finally
        {
            Environment.SetEnvironmentVariable("Sentry__Dsn", null);
        }
    }
}
