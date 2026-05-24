using LandscapeHelper.Api.Data;
using Sburson.Shared.Telemetry;

namespace LandscapeHelper.Api.Services.Telemetry;

/// <summary>App binding of the shared usage-digest service over AppDbContext.</summary>
public sealed class UsageDigestService : UsageDigestServiceBase<AppDbContext>
{
    public UsageDigestService(AppDbContext db) : base(db) { }
}
