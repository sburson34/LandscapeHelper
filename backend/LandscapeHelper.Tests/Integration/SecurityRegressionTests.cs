using System.Net;
using System.Net.Http.Json;
using LandscapeHelper.Tests.Infrastructure;
using Sburson.Shared.Testing.Assertions;

namespace LandscapeHelper.Tests.Integration;

/// <summary>
/// Pins the security gains landed in the 2026-05 portfolio-wide audit so the
/// same bugs never re-open. Anything in this file SHOULD fail loud if production
/// drift opens the door again — read the comment block at the top of each test
/// for what's actually being protected.
///
/// <para>
/// The middleware-pipeline checks (correlation-id echo + generation, security
/// headers) and the compliance-file checks (privacy-policy.html,
/// terms-of-service.html, .well-known/security.txt) delegate to
/// <see cref="MiddlewareAssertions.AssertSburonMiddlewareWiredAsync"/> and
/// <see cref="ComplianceAssertions.AssertComplianceFilesServedAsync"/> in the
/// shared package, so any future tweak (e.g. a new audited header or RFC
/// surface) lands in one place instead of every per-app copy.
/// </para>
/// </summary>
public class SecurityRegressionTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public SecurityRegressionTests(ApiFactory factory) => _factory = factory;

    // ── Compliance files (shared assertion) ─────────────────────────────

    [Fact]
    public Task ComplianceFiles_AllServed_NonEmpty()
        => ComplianceAssertions.AssertComplianceFilesServedAsync(_factory);

    // ── Sburson.Shared.Backend middleware is actually wired (shared) ────

    [Fact]
    public Task SburonMiddleware_Pipeline_Wires_CorrelationId_And_SecurityHeaders()
        => MiddlewareAssertions.AssertSburonMiddlewareWiredAsync(_factory);

    // ── No stack-trace leakage in error responses ──────────────────────

    [Fact]
    public async Task UnhandledException_DoesNotLeakStackTrace()
    {
        // The shared ExceptionHandlerMiddleware lives in Sburson.Shared.Backend
        // and is unit-tested there. The hardening guarantee is that our
        // ASP.NET app must NOT switch on UseDeveloperExceptionPage in any path
        // that production code can hit. Hit an endpoint with a malformed body
        // and confirm the response is the structured "internal_error" JSON,
        // not an HTML stack trace.
        var client = _factory.CreateClient();
        var resp = await client.PostAsync("/api/help-requests",
            new StringContent("{ this is not JSON ::: ", System.Text.Encoding.UTF8, "application/json"));
        // Malformed JSON must be classified by ExceptionHandlerMiddleware as
        // a 400 bad_request — not a 404 (route mis-mapped) and not a 500
        // (handler swallowed the parse error). Either way the response must
        // be the structured shape, not an HTML stack trace.
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        var body = await resp.Content.ReadAsStringAsync();
        Assert.Contains("bad_request", body);
        Assert.DoesNotContain("at LandscapeHelper.Api", body);
        Assert.DoesNotContain("--- End of stack trace ---", body);
        Assert.DoesNotContain("System.NullReferenceException", body);
    }

    // ── RequireAdmin auth correctness ──────────────────────────────────

    [Fact]
    public async Task HelpRequestsList_WithoutAuth_Returns401()
    {
        // Unauthenticated request to an admin-only endpoint must be rejected.
        // The pre-audit bug was that RequireAdmin returned the wrong sentinel
        // and the middleware silently fell through.
        var client = _factory.CreateClient();
        var resp = await client.GetAsync("/api/help-requests");
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task HelpRequestsList_AsNonAdmin_Returns403()
    {
        var client = _factory.CreateClient();
        // Register a regular user (no admin email match), then attach their JWT.
        var email = $"non-admin-{Guid.NewGuid():N}@example.com";
        var reg = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email,
            password = "correct-horse-battery-staple",
        });
        Assert.Equal(HttpStatusCode.OK, reg.StatusCode);
        var doc = System.Text.Json.JsonDocument.Parse(await reg.Content.ReadAsStringAsync());
        var token = doc.RootElement.GetProperty("token").GetString();

        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

        var resp = await client.GetAsync("/api/help-requests");
        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);
    }

    // ── Input caps + abuse limits ──────────────────────────────────────

    [Fact]
    public async Task HelpRequests_RateLimit_Returns429_AfterThreshold()
    {
        // The /api/help-requests POST has a rate limit (20/hour per IP). We
        // saturate it and assert at least one 429 lands. The bucket is process-
        // global so we pick a unique X-Forwarded-For per test run to avoid
        // collisions with the rest of the suite poisoning the count.
        var client = _factory.CreateClient();
        var fakeIp = $"203.0.113.{Random.Shared.Next(1, 254)}";
        client.DefaultRequestHeaders.Add("X-Forwarded-For", fakeIp);

        bool sawRateLimited = false;
        for (int i = 0; i < 25; i++)
        {
            var resp = await client.PostAsJsonAsync("/api/help-requests", new
            {
                customerName = "Tester",
                customerEmail = $"rl-{i}@example.com",
                customerPhone = "5550100",
                projectTitle = "Rate test",
                userDescription = "x",
                projectData = "{}",
            });
            if (resp.StatusCode == HttpStatusCode.TooManyRequests)
            {
                sawRateLimited = true;
                break;
            }
        }

        // If the implementation has no per-IP rate limit yet, this surfaces it
        // as a hard test failure (the audit-shipped phase-2 hardening claims
        // both endpoint protection AND a 429 status code).
        Assert.True(sawRateLimited,
            "/api/help-requests must rate-limit unauthenticated callers. Returning 429 is the documented contract.");
    }

    // ── No placeholder API-key stubs remain ────────────────────────────

    [Fact]
    public async Task PlaceholderStubEndpoints_AreNotMapped()
    {
        // Pre-audit, a couple of endpoints existed that returned a placeholder
        // API key (or a hardcoded debug answer) to any caller. Audit yanked
        // them; this test stays as a tripwire if they ever sneak back.
        var client = _factory.CreateClient();
        foreach (var path in new[]
                 {
                     "/api/_debug/key",
                     "/api/_test/echo",
                     "/api/stub/openai-key",
                 })
        {
            var resp = await client.GetAsync(path);
            Assert.True(
                resp.StatusCode == HttpStatusCode.NotFound,
                $"{path} must not be mapped — was {(int)resp.StatusCode}.");
        }
    }
}
