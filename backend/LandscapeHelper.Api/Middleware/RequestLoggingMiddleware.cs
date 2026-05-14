using System.Diagnostics;

namespace LandscapeHelper.Api.Middleware;

/// <summary>
/// Logs every HTTP request with structured fields: method, path, status code,
/// duration, and correlation ID (already in scope from CorrelationIdMiddleware).
/// Sensitive paths/headers are never logged.
/// </summary>
public class RequestLoggingMiddleware
{
    private readonly RequestDelegate _next;

    public RequestLoggingMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context, ILogger<RequestLoggingMiddleware> logger)
    {
        var sw = Stopwatch.StartNew();

        try
        {
            await _next(context);
        }
        finally
        {
            sw.Stop();

            // Skip noisy static-file / favicon requests so log volume stays sane.
            // We still log the / health probe so the duration drift is visible.
            var path = context.Request.Path.Value ?? "/";
            if (path.StartsWith("/api/") || path == "/" || path == "/healthz")
            {
                var level = context.Response.StatusCode >= 500 ? LogLevel.Error
                          : context.Response.StatusCode >= 400 ? LogLevel.Warning
                          : LogLevel.Information;

                logger.Log(level,
                    "HTTP {Method} {Path} responded {StatusCode} in {DurationMs}ms",
                    context.Request.Method,
                    path,
                    context.Response.StatusCode,
                    sw.ElapsedMilliseconds);
            }
        }
    }
}
