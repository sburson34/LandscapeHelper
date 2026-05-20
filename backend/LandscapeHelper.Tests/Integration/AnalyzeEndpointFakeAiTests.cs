using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LandscapeHelper.Tests.Infrastructure;

namespace LandscapeHelper.Tests.Integration;

/// <summary>
/// /api/analyze is the main user-facing AI flow. These tests pin its behaviour
/// against a faked OpenAI response so the post-processing path (JSON extraction
/// from markdown fences, affiliate-link enrichment, content_filter -> 422)
/// stays green without burning real API credits or relying on network access.
///
/// Companion live test: <c>LandscapeHelper.Tests.Live/AnalyzeLiveTests.cs</c>.
/// </summary>
[Collection("SerialEnv")]
public class AnalyzeEndpointFakeAiTests
{
    private const string SamplePngBase64 =
        // 1x1 transparent PNG — passes InputValidation.IsAcceptableImage and is
        // small enough to keep the recorded request shallow.
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

    [Fact]
    public async Task Analyze_WithFakedSuccess_Returns200AndEnrichesShoppingLinks()
    {
        await using var factory = new FakeOpenAiApiFactory();
        await factory.EnsureStartedAsync();
        factory.Fake.EnqueueChat(@"{
            ""title"": ""Mulch the front beds"",
            ""steps"": [{ ""text"": ""Buy mulch"" }],
            ""tools_and_materials"": [""rake"", ""wheelbarrow""],
            ""difficulty"": ""easy"",
            ""estimated_time"": ""1 hr"",
            ""estimated_cost"": ""$50"",
            ""youtube_links"": [""https://www.youtube.com/results?search_query=mulch""],
            ""shopping_links"": [""Black cedar mulch"", ""Square point shovel""],
            ""safety_tips"": [""Wear gloves""],
            ""when_to_call_pro"": [],
            ""permit_required"": false,
            ""recommendation"": ""diy""
        }");

        var client = factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/analyze", new
        {
            description = "Refresh the front bed mulch",
            media = new[] { new { Type = "image", Base64 = SamplePngBase64, MimeType = "image/png" } },
            language = "en",
        });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadAsStringAsync();

        // Shopping links must have been transformed into affiliate-link
        // objects with amazon_url / homedepot_url.
        Assert.Contains("amazon_url", body);
        Assert.Contains("homedepot_url", body);
        Assert.Contains("Black cedar mulch", body);
        Assert.Contains("Mulch the front beds", body);

        // The fake server saw exactly one request.
        Assert.Single(factory.Fake.Requests);
    }

    [Fact]
    public async Task Analyze_WithMarkdownFencedJson_ExtractsCleanly()
    {
        // GPT sometimes wraps JSON in ```json``` fences; the handler extracts
        // between the first '{' and last '}'. Verify that round-trips.
        await using var factory = new FakeOpenAiApiFactory();
        await factory.EnsureStartedAsync();
        factory.Fake.EnqueueChat(@"Here you go:
```json
{
  ""title"": ""Re-sod the back yard"",
  ""steps"": [{ ""text"": ""Strip old grass"" }],
  ""tools_and_materials"": [],
  ""difficulty"": ""medium"",
  ""estimated_time"": ""2 days"",
  ""estimated_cost"": ""$300"",
  ""youtube_links"": [],
  ""shopping_links"": [],
  ""safety_tips"": [],
  ""when_to_call_pro"": []
}
```
That's the plan.");

        var client = factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/analyze", new
        {
            description = "Re-sod the back yard",
            media = Array.Empty<object>(),
            language = "en",
        });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadAsStringAsync();
        Assert.Contains("Re-sod the back yard", body);
    }

    [Fact]
    public async Task Analyze_WhenAiReturnsJunk_Returns500WithRawResponse()
    {
        await using var factory = new FakeOpenAiApiFactory();
        await factory.EnsureStartedAsync();
        factory.Fake.EnqueueChat("this is not JSON at all");

        var client = factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/analyze", new
        {
            description = "Something",
            media = Array.Empty<object>(),
        });

        Assert.Equal(HttpStatusCode.InternalServerError, resp.StatusCode);
        var body = await resp.Content.ReadAsStringAsync();
        Assert.Contains("AI returned invalid JSON", body);
    }

    [Fact]
    public async Task Analyze_WithoutMediaOrDescription_Returns400()
    {
        await using var factory = new FakeOpenAiApiFactory();
        await factory.EnsureStartedAsync();
        // No scripted response — the handler must reject the request before
        // ever calling OpenAI.

        var client = factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/analyze", new
        {
            description = "",
            media = Array.Empty<object>(),
        });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        Assert.Empty(factory.Fake.Requests);
    }

    [Fact]
    public async Task Analyze_RejectsPrivateNetworkUrls_AsImageSource()
    {
        // SSRF guard: a payload that points at an internal IP must not cause a
        // server-to-server fetch attempt. The handler silently drops the URL
        // and proceeds with whatever else is in the request (here, just
        // description) — verify it doesn't crash and the fake never sees a
        // private host in its inputs.
        await using var factory = new FakeOpenAiApiFactory();
        await factory.EnsureStartedAsync();
        factory.Fake.EnqueueChat(@"{
            ""title"": ""tt"",
            ""steps"": [],
            ""tools_and_materials"": [],
            ""difficulty"": ""easy"",
            ""estimated_time"": ""1 hr"",
            ""estimated_cost"": ""$"",
            ""youtube_links"": [],
            ""shopping_links"": [],
            ""safety_tips"": [],
            ""when_to_call_pro"": []
        }");

        var client = factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/analyze", new
        {
            description = "Test SSRF protections",
            media = new[]
            {
                new { Type = "image", Url = "https://169.254.169.254/latest/meta-data/" },
                new { Type = "image", Url = "http://10.0.0.1/internal" },
                new { Type = "image", Url = "https://localhost/" },
            },
            language = "en",
        });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var request = Assert.Single(factory.Fake.Requests);
        // None of the rejected URLs should appear in the request body sent
        // upstream — the handler must have dropped them. Note: substring match
        // is sufficient because the SDK URL-encodes only path components, not
        // host strings, when serializing image parts.
        Assert.DoesNotContain("169.254.169.254", request.Body);
        Assert.DoesNotContain("10.0.0.1", request.Body);
        Assert.DoesNotContain("localhost", request.Body);
    }

    [Fact]
    public async Task Analyze_SpanishLanguage_PassesThroughToFake()
    {
        await using var factory = new FakeOpenAiApiFactory();
        await factory.EnsureStartedAsync();
        factory.Fake.EnqueueChat(@"{
            ""title"": ""Refresca el mantillo"",
            ""steps"": [],
            ""tools_and_materials"": [],
            ""difficulty"": ""easy"",
            ""estimated_time"": ""1 h"",
            ""estimated_cost"": ""$"",
            ""youtube_links"": [],
            ""shopping_links"": [],
            ""safety_tips"": [],
            ""when_to_call_pro"": []
        }");

        var client = factory.CreateClient();
        var resp = await client.PostAsJsonAsync("/api/analyze", new
        {
            description = "Refrescar el jardín",
            media = Array.Empty<object>(),
            language = "es",
        });

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var request = Assert.Single(factory.Fake.Requests);
        // The Spanish-language instruction must have been injected into the
        // system prompt the upstream saw.
        Assert.Contains("Spanish", request.Body);
    }
}
