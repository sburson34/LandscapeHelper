namespace LandscapeHelper.Api.Integrations;

/// <summary>
/// Reads feature flag env vars at startup. The frontend pulls these via
/// <c>GET /api/features</c>. Scaffolded APIs stay dark until their
/// credentials land and the flag is flipped on.
/// </summary>
public class FeatureFlags
{
    public bool WeatherForecast { get; }
    public bool WholeHouseAdvice { get; }
    public bool ShrubberyAdvice { get; }
    public bool Diagnose { get; }
    public bool Community { get; }
    public bool QuoteRequests { get; }

    // Emergency kill-switch. When true, all AI-backed endpoints
    // (/api/analyze, /api/ask-helper, /api/diagnose, /api/clarify,
    // /api/verify-step, /api/whole-house-advice, /api/shrubbery-advice)
    // return 503. Flip via the AI_KILL_SWITCH env var on the shared host
    // for an immediate rollback without a redeploy. Use when an abuse wave
    // or provider outage is draining the OpenAI budget.
    public bool AiKillSwitch { get; }

    public FeatureFlags()
    {
        // Default ON for the core landscaping features; clients can disable
        // them per-deploy if needed.
        WeatherForecast = ReadBool("FEATURES_WEATHER_FORECAST", defaultValue: true);
        WholeHouseAdvice = ReadBool("FEATURES_WHOLE_HOUSE_ADVICE", defaultValue: true);
        ShrubberyAdvice = ReadBool("FEATURES_SHRUBBERY_ADVICE", defaultValue: true);
        Diagnose = ReadBool("FEATURES_DIAGNOSE", defaultValue: true);
        // Community + Quote requests stay dark until the moderation / vendor
        // flows are live, so they default OFF.
        Community = ReadBool("FEATURES_COMMUNITY");
        QuoteRequests = ReadBool("FEATURES_QUOTE_REQUESTS");
        AiKillSwitch = ReadBool("AI_KILL_SWITCH");
    }

    private static bool ReadBool(string name, bool defaultValue = false)
    {
        var raw = Environment.GetEnvironmentVariable(name);
        if (string.IsNullOrEmpty(raw)) return defaultValue;
        return raw.Equals("true", StringComparison.OrdinalIgnoreCase) || raw == "1";
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
