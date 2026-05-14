using LandscapeHelper.Api.Integrations;

namespace LandscapeHelper.Tests;

public class FeatureFlagsTests : IDisposable
{
    private readonly List<string> _setVars = new();

    private void SetEnv(string name, string? value)
    {
        Environment.SetEnvironmentVariable(name, value);
        _setVars.Add(name);
    }

    public void Dispose()
    {
        foreach (var name in _setVars)
            Environment.SetEnvironmentVariable(name, null);
    }

    [Fact]
    public void Defaults_AreCorrect()
    {
        SetEnv("FEATURES_WEATHER_FORECAST", null);
        SetEnv("FEATURES_WHOLE_HOUSE_ADVICE", null);
        SetEnv("FEATURES_SHRUBBERY_ADVICE", null);
        SetEnv("FEATURES_DIAGNOSE", null);
        SetEnv("FEATURES_COMMUNITY", null);
        SetEnv("FEATURES_QUOTE_REQUESTS", null);
        SetEnv("AI_KILL_SWITCH", null);

        var flags = new FeatureFlags();

        Assert.True(flags.WeatherForecast);
        Assert.True(flags.WholeHouseAdvice);
        Assert.True(flags.ShrubberyAdvice);
        Assert.True(flags.Diagnose);
        Assert.False(flags.Community);
        Assert.False(flags.QuoteRequests);
        Assert.False(flags.AiKillSwitch);
    }

    [Fact]
    public void ReadsTrue_FromEnvVar()
    {
        SetEnv("FEATURES_COMMUNITY", "true");
        SetEnv("FEATURES_QUOTE_REQUESTS", "1");
        var flags = new FeatureFlags();
        Assert.True(flags.Community);
        Assert.True(flags.QuoteRequests);
    }

    [Fact]
    public void CoreFeatures_CanBeDisabled()
    {
        SetEnv("FEATURES_SHRUBBERY_ADVICE", "false");
        var flags = new FeatureFlags();
        Assert.False(flags.ShrubberyAdvice);
    }

    [Fact]
    public void KillSwitch_CanBeEnabled()
    {
        SetEnv("AI_KILL_SWITCH", "true");
        var flags = new FeatureFlags();
        Assert.True(flags.AiKillSwitch);
    }

    [Fact]
    public void ToPublicJson_ReturnsCamelCaseObject()
    {
        SetEnv("FEATURES_COMMUNITY", null);
        var flags = new FeatureFlags();
        var json = flags.ToPublicJson();
        var names = json.GetType().GetProperties().Select(p => p.Name).ToList();
        Assert.Contains("weatherForecast", names);
        Assert.Contains("shrubberyAdvice", names);
        Assert.Contains("aiKillSwitch", names);
    }
}
