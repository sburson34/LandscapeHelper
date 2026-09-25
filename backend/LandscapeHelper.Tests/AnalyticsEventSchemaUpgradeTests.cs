using LandscapeHelper.Api.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Sburson.Shared.Telemetry;

namespace LandscapeHelper.Tests;

/// <summary>
/// An AnalyticsEvents table created before Sburson.Shared.Backend added the
/// nullable Brand column must gain it on boot, or every telemetry insert fails
/// against a database EnsureCreated() will not touch again.
/// </summary>
public class AnalyticsEventSchemaUpgradeTests
{
    [Fact]
    public void EnsureBrandColumn_AddsBrandToAPreBrandTable_AndIsIdempotent()
    {
        using var conn = new SqliteConnection("DataSource=:memory:");
        conn.Open();
        using (var cmd = conn.CreateCommand())
        {
            // The shape Program.cs created before the shared entity grew Brand.
            cmd.CommandText = @"
                CREATE TABLE AnalyticsEvents (
                    Id INTEGER PRIMARY KEY AUTOINCREMENT,
                    EventName TEXT NOT NULL,
                    AnonId TEXT NOT NULL,
                    SessionId TEXT NOT NULL,
                    OccurredAt TEXT NOT NULL,
                    ClientTs TEXT NOT NULL,
                    PropsJson TEXT NULL,
                    AppVersion TEXT NULL,
                    Platform TEXT NULL
                );";
            cmd.ExecuteNonQuery();
        }

        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(conn).Options;
        using var db = new AppDbContext(options);

        AnalyticsEventSchemaUpgrade.EnsureBrandColumn(db);
        AnalyticsEventSchemaUpgrade.EnsureBrandColumn(db); // second boot is a no-op

        db.AnalyticsEvents.Add(new AnalyticsEvent
        {
            EventName = "screen_view",
            AnonId = Guid.NewGuid(),
            SessionId = Guid.NewGuid(),
            OccurredAt = DateTime.UtcNow,
            ClientTs = DateTime.UtcNow,
            Brand = "landscape",
        });
        db.SaveChanges();

        Assert.Equal("landscape", db.AnalyticsEvents.AsNoTracking().Single().Brand);
    }
}
