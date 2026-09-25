using Microsoft.EntityFrameworkCore;

namespace LandscapeHelper.Api.Data;

/// <summary>
/// Additive schema for the shared <c>AnalyticsEvent</c> entity on databases that
/// already exist. Sburson.Shared.Backend (0.19.0+) added a nullable <c>Brand</c>
/// column and a <c>(Brand, OccurredAt, AnonId)</c> index; <c>EnsureCreated()</c>
/// only builds tables on a brand-new database, so an existing AnalyticsEvents
/// table would otherwise make every telemetry insert fail with "column Brand
/// does not exist". Idempotent — safe on every boot.
/// </summary>
public static class AnalyticsEventSchemaUpgrade
{
    public static void EnsureBrandColumn(AppDbContext db)
    {
        if (db.Database.IsNpgsql())
        {
            db.Database.ExecuteSqlRaw(@"
                ALTER TABLE ""AnalyticsEvents"" ADD COLUMN IF NOT EXISTS ""Brand"" VARCHAR(64) NULL;
                CREATE INDEX IF NOT EXISTS ""IX_AnalyticsEvents_Brand_OccurredAt_AnonId""
                    ON ""AnalyticsEvents""(""Brand"", ""OccurredAt"", ""AnonId"");
            ");
            return;
        }

        if (db.Database.IsSqlite())
        {
            // SQLite has no ADD COLUMN IF NOT EXISTS — ask the table first.
            var hasBrand = db.Database
                .SqlQueryRaw<int>("SELECT COUNT(*) AS \"Value\" FROM pragma_table_info('AnalyticsEvents') WHERE name = 'Brand'")
                .AsEnumerable()
                .First() > 0;
            if (!hasBrand)
                db.Database.ExecuteSqlRaw("ALTER TABLE AnalyticsEvents ADD COLUMN Brand TEXT NULL;");
            db.Database.ExecuteSqlRaw(
                "CREATE INDEX IF NOT EXISTS IX_AnalyticsEvents_Brand_OccurredAt_AnonId ON AnalyticsEvents(Brand, OccurredAt, AnonId);");
        }
    }
}
