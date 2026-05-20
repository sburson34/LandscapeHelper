using LandscapeHelper.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Sburson.Shared.Testing;

namespace LandscapeHelper.Tests.Infrastructure;

/// <summary>
/// Test host factory for LandscapeHelper.Api integration tests. Inherits the
/// heavy lifting from <see cref="BaseApiFactory{TProgram}"/> (Testcontainers
/// Postgres in CI, SQLite-in-memory fallback on dev machines, per-fixture
/// schema isolation, in-memory <c>ConfigOverrides</c>) and only adds the
/// LandscapeHelper-specific bits:
///
///   * Point ASP.NET content/web root at <c>LandscapeHelper.Api</c> so the
///     wwwroot compliance files (privacy-policy.html, terms-of-service.html,
///     .well-known/security.txt) resolve on Linux CI. Without this the
///     conditional <c>UseStaticFiles</c> branch in Program.cs falls back to a
///     missing path and SecurityTxt_Served_AtWellKnown fails.
///   * Force <c>Database:Provider</c> in config so Program.cs's raw
///     <c>CREATE TABLE IF NOT EXISTS</c> bootstrap picks the dialect that
///     matches whatever backend BaseApiFactory selected (Postgres vs SQLite).
///   * Replace the production <see cref="AppDbContext"/> registration with
///     one bound to BaseApiFactory's per-fixture <c>ConnectionString</c>.
/// </summary>
public class ApiFactory : BaseApiFactory<Program>
{
    public ApiFactory()
    {
        // Program.cs reads "Database:Provider" at host build to decide which
        // raw-SQL dialect to run for the post-v1 idempotent table create. The
        // base picks Postgres when Docker is reachable, else SQLite — match
        // that here so the bootstrap SQL is valid for the live backend.
        ConfigOverrides["Database:Provider"] = UseSqliteFallback ? "sqlite" : "postgresql";
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Point the test host at the API project's source dir so
        // app.Environment.WebRootPath resolves to its real wwwroot. Without
        // this the conditional StaticFiles mount in Program.cs is skipped on
        // Linux CI and the compliance/security-txt tests fail. Not using
        // UseSolutionRelativeContentRoot because this repo uses a .slnx
        // solution file, which that helper doesn't discover.
        //
        // Also UseWebRoot explicitly — on Linux CI the implicit resolution of
        // WebRootPath from ContentRootPath was still returning null in some
        // setups (likely because the test bin's output layout diverges from
        // the dev box). Setting it explicitly is belt-and-braces.
        var testBin = Path.GetDirectoryName(typeof(ApiFactory).Assembly.Location)!;
        var apiContentRoot = Path.GetFullPath(
            Path.Combine(testBin, "..", "..", "..", "..", "LandscapeHelper.Api"));
        builder.UseContentRoot(apiContentRoot);
        var apiWebRoot = Path.Combine(apiContentRoot, "wwwroot");
        if (Directory.Exists(apiWebRoot))
        {
            builder.UseWebRoot(apiWebRoot);
        }

        // Let BaseApiFactory layer ConfigOverrides (incl. Database:Provider +
        // ConnectionStrings:Default) on top of appsettings.
        base.ConfigureWebHost(builder);

        builder.UseEnvironment(Environments.Development);

        builder.ConfigureServices(services =>
        {
            // Replace the production DbContext registration with one bound
            // to BaseApiFactory's per-fixture backend. UseSqliteFallback tells
            // us which provider is active (sqlite-in-memory dev fallback vs
            // Testcontainers Postgres).
            //
            // RemoveAllDatabaseProviders (Sburson.Shared.Testing 0.1.2)
            // strips every EF Core + Npgsql service the production
            // AddDbContext registered. Without it EF Core sees two
            // providers on the SQLite-fallback path and throws on first
            // request. Same fix that landed in ArgumentRef and the others.
            services.RemoveAllDatabaseProviders();
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.RemoveAll<AppDbContext>();

            services.AddDbContext<AppDbContext>(options =>
            {
                if (UseSqliteFallback)
                    options.UseSqlite(ConnectionString);
                else
                    options.UseNpgsql(ConnectionString);
            });

            // Domain Fake adapters (e.g. the FakeOpenAiServer seam used by
            // FakeOpenAiApiFactory) stay registered separately by their own
            // factory subclass — nothing else to do here.
        });
    }
}
