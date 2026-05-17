using Microsoft.Extensions.Configuration;
using Sburson.Shared.FeatureFlags;

namespace LandscapeHelper.Api.Integrations;

/// <summary>
/// Reads feature flag env vars / IConfiguration at startup. The frontend
/// pulls these via <c>GET /api/features</c>. Subclass of
/// <see cref="FeatureFlagsBase"/> — picks up the shared
/// <c>IsEnabled(key)</c> / <c>EnabledWhenSet(envVar)</c> helpers; the typed
/// properties + ToPublicJson stay app-specific.
/// </summary>
public class FeatureFlags : FeatureFlagsBase
{
    public bool WeatherForecast { get; }
    public bool WholeHouseAdvice { get; }
    public bool ShrubberyAdvice { get; }
    public bool Diagnose { get; }
    public bool Community { get; }
    public bool QuoteRequests { get; }

    // Emergency kill-switch. When true, all AI-backed endpoints return 503.
    // Flip via the AI_KILL_SWITCH env var on the shared host for an
    // immediate rollback without a redeploy.
    public bool AiKillSwitch { get; }

    public FeatureFlags(IConfiguration config) : base(config)
    {
        WeatherForecast = IsEnabled("WeatherForecast", defaultValue: true);
        WholeHouseAdvice = IsEnabled("WholeHouseAdvice", defaultValue: true);
        ShrubberyAdvice = IsEnabled("ShrubberyAdvice", defaultValue: true);
        Diagnose = IsEnabled("Diagnose", defaultValue: true);
        Community = IsEnabled("Community");
        QuoteRequests = IsEnabled("QuoteRequests");
        // AI_KILL_SWITCH stays as a direct env-var read (no FEATURES_ prefix)
        // to preserve the runbook-documented name.
        var aiKillRaw = Environment.GetEnvironmentVariable("AI_KILL_SWITCH");
        AiKillSwitch = !string.IsNullOrEmpty(aiKillRaw)
            && (aiKillRaw.Equals("true", StringComparison.OrdinalIgnoreCase) || aiKillRaw == "1");
    }

    public object ToPublicJson() => new
    {
        weatherForecast = WeatherForecast,
        wholeHouseAdvice = WholeHouseAdvice,
        shrubberyAdvice = ShrubberyAdvice,
        diagnose = Diagnose,
        community = Community,
        quoteRequests = QuoteRequests,
        aiKillSwitch = AiKillSwitch,
    };
}
