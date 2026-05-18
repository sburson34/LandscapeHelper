using System.Data.Common;
using LandscapeHelper.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace LandscapeHelper.Tests.Infrastructure;

/// <summary>
/// Test host factory for API integration tests. Swaps the production DbContext
/// registration (sqlite-on-disk or Postgres) for a single open in-memory SQLite
/// connection that lives for the lifetime of the factory. Tests still exercise
/// the real EF Core + SQLite stack — important because Program.cs runs raw
/// <c>CREATE TABLE IF NOT EXISTS</c> statements that the EF InMemory provider
/// would reject.
/// </summary>
public class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private DbConnection? _connection;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(Environments.Development);

        // Point the test host at the API project's source dir so
        // app.Environment.WebRootPath resolves to its real wwwroot (containing
        // .well-known/security.txt). Without this the conditional StaticFiles
        // mount in Program.cs is skipped on Linux CI and the SecurityTxt test
        // fails. Not using UseSolutionRelativeContentRoot because this repo
        // uses a .slnx solution file, which that helper doesn't discover.
        //
        // Also UseWebRoot explicitly — on Linux CI the implicit resolution of
        // WebRootPath from ContentRootPath was still returning null in some
        // setups (likely because the test bin's output layout diverges from
        // the dev box). Setting it explicitly is belt-and-braces.
        var testBin = Path.GetDirectoryName(typeof(ApiFactory).Assembly.Location)!;
        var apiContentRoot = Path.GetFullPath(
            Path.Combine(testBin, "..", "..", "..", "..", "LandscapeHelper.Api"));
        var apiWebRoot = Path.Combine(apiContentRoot, "wwwroot");
        builder.UseContentRoot(apiContentRoot);
        if (Directory.Exists(apiWebRoot))
        {
            builder.UseWebRoot(apiWebRoot);
        }

        builder.ConfigureServices(services =>
        {
            // Remove the production DbContext registration (sqlite-on-disk
            // or Postgres depending on Database:Provider).
            var dbDescriptors = services
                .Where(d => d.ServiceType == typeof(DbContextOptions<AppDbContext>)
                         || d.ServiceType == typeof(AppDbContext))
                .ToList();
            foreach (var d in dbDescriptors) services.Remove(d);

            // Shared open SQLite connection so every scope reuses the same
            // in-memory database for the duration of the factory.
            _connection = new SqliteConnection("DataSource=:memory:");
            _connection.Open();

            services.AddDbContext<AppDbContext>(options =>
            {
                options.UseSqlite(_connection);
            });
        });
    }

    public Task InitializeAsync() => Task.CompletedTask;

    public new async Task DisposeAsync()
    {
        if (_connection is not null)
        {
            await _connection.DisposeAsync();
            _connection = null;
        }
        await base.DisposeAsync();
    }
}
