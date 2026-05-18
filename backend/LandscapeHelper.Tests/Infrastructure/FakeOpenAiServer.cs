using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace LandscapeHelper.Tests.Infrastructure;

/// <summary>
/// In-process HTTP listener that masquerades as api.openai.com for tests. The
/// production code talks to a real OpenAI client; we point its endpoint at this
/// server via the <c>OPENAI_BASE_URL</c> env var so the SDK serializes and
/// deserializes against a real socket — guaranteeing the wire-shape
/// compatibility check that a mocked <c>IChatClient</c> would skip.
///
/// Each scripted response is a JSON string that the analyze / ask-helper /
/// verify-step / diagnose / clarify / house-advice / shrubbery-advice handlers
/// expect to find inside the OpenAI chat-completion envelope.
/// </summary>
public sealed class FakeOpenAiServer : IAsyncDisposable
{
    private readonly IHost _host;
    private readonly Queue<(int Status, string Body)> _responses = new();
    private readonly List<RecordedRequest> _requests = new();
    private readonly object _lock = new();

    public string BaseUrl { get; }

    public IReadOnlyList<RecordedRequest> Requests
    {
        get { lock (_lock) return _requests.ToList(); }
    }

    private FakeOpenAiServer(IHost host, string baseUrl)
    {
        _host = host;
        BaseUrl = baseUrl;
    }

    public static async Task<FakeOpenAiServer> StartAsync()
    {
        FakeOpenAiServer? instance = null;
        var builder = Host.CreateDefaultBuilder()
            .ConfigureWebHostDefaults(web =>
            {
                web.UseUrls("http://127.0.0.1:0");
                web.Configure(app =>
                {
                    app.Run(async http =>
                    {
                        if (instance != null) await instance.HandleAsync(http);
                    });
                });
            });

        var host = builder.Build();
        await host.StartAsync();

        var address = host.Services
            .GetRequiredService<Microsoft.AspNetCore.Hosting.Server.IServer>()
            .Features
            .Get<Microsoft.AspNetCore.Hosting.Server.Features.IServerAddressesFeature>()!
            .Addresses.First();

        instance = new FakeOpenAiServer(host, address);
        return instance;
    }

    /// <summary>
    /// Script the next chat-completion response. The string is wrapped in the
    /// OpenAI envelope (id / object / model / choices) automatically.
    /// </summary>
    public void EnqueueChat(string content, int status = 200)
    {
        var envelope = JsonSerializer.Serialize(new
        {
            id = "chatcmpl-fake-" + Guid.NewGuid().ToString("N"),
            @object = "chat.completion",
            created = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            model = "gpt-4o",
            choices = new[]
            {
                new
                {
                    index = 0,
                    message = new { role = "assistant", content = content ?? "" },
                    finish_reason = "stop"
                }
            },
            usage = new { prompt_tokens = 1, completion_tokens = 1, total_tokens = 2 }
        });
        lock (_lock) _responses.Enqueue((status, envelope));
    }

    /// <summary>Script a raw response body without the chat envelope.</summary>
    public void EnqueueRaw(int status, string body)
    {
        lock (_lock) _responses.Enqueue((status, body));
    }

    private async Task HandleAsync(HttpContext http)
    {
        string body;
        using (var reader = new StreamReader(http.Request.Body, Encoding.UTF8))
            body = await reader.ReadToEndAsync();

        (int status, string responseBody) = (500, "{\"error\":\"no scripted response\"}");
        lock (_lock)
        {
            _requests.Add(new RecordedRequest(http.Request.Path, body));
            if (_responses.Count > 0) (status, responseBody) = _responses.Dequeue();
        }

        http.Response.StatusCode = status;
        http.Response.ContentType = "application/json";
        await http.Response.WriteAsync(responseBody, Encoding.UTF8);
    }

    public async ValueTask DisposeAsync()
    {
        try { await _host.StopAsync(TimeSpan.FromSeconds(2)); } catch { }
        _host.Dispose();
    }

    public sealed record RecordedRequest(string Path, string Body);
}
