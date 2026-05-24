using Microsoft.EntityFrameworkCore;
using LandscapeHelper.Api.Models;
using Sburson.Shared.Telemetry;

namespace LandscapeHelper.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<HelpRequest> HelpRequests => Set<HelpRequest>();
    public DbSet<User> Users => Set<User>();
    public DbSet<HouseAdviceSession> HouseAdviceSessions => Set<HouseAdviceSession>();
    public DbSet<HouseAdvicePhoto> HouseAdvicePhotos => Set<HouseAdvicePhoto>();
    public DbSet<DataDeletionRequest> DataDeletionRequests => Set<DataDeletionRequest>();

    // Anonymous product-usage events (shared schema). See Sburson.Shared.Telemetry.
    public DbSet<AnalyticsEvent> AnalyticsEvents => Set<AnalyticsEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyAnalyticsEvent();

        modelBuilder.Entity<User>().HasIndex(u => u.Email).IsUnique();

        modelBuilder.Entity<HouseAdviceSession>()
            .HasOne(s => s.User)
            .WithMany()
            .HasForeignKey(s => s.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<HouseAdvicePhoto>()
            .HasOne(p => p.Session)
            .WithMany(s => s.Photos)
            .HasForeignKey(p => p.SessionId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
