namespace LandscapeHelper.Api.Middleware;

/// <summary>
/// Adds defense-in-depth HTTP security headers on every response. The shared
/// Caddy reverse proxy in front of the API may also set some of these — that's
/// fine, header overwrites are idempotent and we want the API to behave safely
/// even if Caddy is bypassed (e.g. an EB direct hit during cutover or a local
/// dev test against the container directly).
/// </summary>
/// <remarks>
/// Deliberately conservative:
///   - X-Content-Type-Options: nosniff (always safe)
///   - Referrer-Policy: strict-origin-when-cross-origin (no leakage to OpenAI etc.)
///   - X-Frame-Options: DENY (this API never serves embeddable pages)
///   - Permissions-Policy: clamp camera/mic/geo (API doesn't need any)
///   - Cross-Origin-Resource-Policy: same-origin (API responses never embed cross-site)
/// HSTS is intentionally omitted here — Caddy owns TLS and emits HSTS already.
/// CSP is omitted because there is no rendered HTML (privacy/terms pages are
/// trivial static HTML; we add the headers anyway for the static files path).
/// </remarks>
public class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;

    public SecurityHeadersMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;
            // Use indexer with conditional check so we never overwrite values
            // a downstream handler explicitly set (e.g. a redirect path).
            if (!headers.ContainsKey("X-Content-Type-Options"))
                headers["X-Content-Type-Options"] = "nosniff";
            if (!headers.ContainsKey("Referrer-Policy"))
                headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
            if (!headers.ContainsKey("X-Frame-Options"))
                headers["X-Frame-Options"] = "DENY";
            if (!headers.ContainsKey("Permissions-Policy"))
                headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), interest-cohort=()";
            if (!headers.ContainsKey("Cross-Origin-Resource-Policy"))
                headers["Cross-Origin-Resource-Policy"] = "same-origin";
            return Task.CompletedTask;
        });

        return _next(context);
    }
}
