namespace LandscapeHelper.Api.Observability;

/// <summary>
/// Wires Sentry into the ASP.NET Core host. Reads the DSN from the
/// <c>Sentry__Dsn</c> environment variable (the shared host's
/// <c>secrets/landscapehelper.env</c> already sets this).
/// </summary>
/// <remarks>
/// We deliberately use an env var instead of <c>appsettings.json</c> so the
/// DSN never ends up in the image / source tree. The Sentry DSN is a public
/// client key — not a true secret — but treating it like one lets us rotate
/// without redeploys and keeps deploy diffs clean.
/// </remarks>
public static class SentrySetup
{
    private const string DsnEnvVar = "Sentry__Dsn";

    /// <summary>
    /// Adds Sentry to the host. Safe to call unconditionally — when no DSN is
    /// configured the call is a no-op and the app behaves exactly as before.
    /// </summary>
    public static IWebHostBuilder UseLandscapeHelperSentry(this IWebHostBuilder builder)
    {
        var dsn = Environment.GetEnvironmentVariable(DsnEnvVar);
        if (string.IsNullOrWhiteSpace(dsn))
            return builder;

        return builder.UseSentry(options =>
        {
            options.Dsn = dsn;

            // ASPNETCORE_ENVIRONMENT drives the Sentry "environment" tag.
            options.Environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production";

            // Capture native exceptions and HTTP request context, but never
            // ship the body — bodies can contain base64 photo data, free-text
            // user descriptions, or JWTs.
            options.MaxRequestBodySize = Sentry.Extensibility.RequestSize.None;
            options.SendDefaultPii = false;

            // Beta-friendly sampling. Bumps to 0 in development so reloads
            // don't pollute the project; 5% in production until we know volume.
            options.TracesSampleRate = options.Environment.Equals("Development", StringComparison.OrdinalIgnoreCase)
                ? 0.0
                : 0.05;

            // Attach the structured stack trace to every event so unhandled
            // exceptions and warnings both surface with full context.
            options.AttachStacktrace = true;

            // Belt-and-suspenders: scrub Authorization / x-api-key headers in
            // case the SDK ever decides to include them on a future version.
            options.SetBeforeSend(evt =>
            {
                if (evt.Request?.Headers != null)
                {
                    foreach (var key in evt.Request.Headers.Keys.ToList())
                    {
                        if (key.Equals("Authorization", StringComparison.OrdinalIgnoreCase)
                            || key.Equals("Cookie", StringComparison.OrdinalIgnoreCase)
                            || key.Equals("x-api-key", StringComparison.OrdinalIgnoreCase))
                        {
                            evt.Request.Headers[key] = "[redacted]";
                        }
                    }
                }
                return evt;
            });
        });
    }
}
