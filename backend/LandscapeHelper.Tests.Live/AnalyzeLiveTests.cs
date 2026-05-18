using System.ClientModel;
using System.Text.Json;
using OpenAI;
using OpenAI.Chat;

namespace LandscapeHelper.Tests.Live;

/// <summary>
/// Real-network contract tests. ONLY run on the weekly contract.yml schedule
/// (or via workflow_dispatch). NOT included in the standard solution test run.
///
/// Estimated cost per pass: a few cents — one gpt-4o vision call against a
/// 1x1 PNG. The job is opt-in (skips when <c>OPENAI_API_KEY</c> is unset) so
/// it costs zero if creds are pulled.
/// </summary>
public class AnalyzeLiveTests
{
    private const string SamplePngBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

    private static bool HasCreds =>
        !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("OPENAI_API_KEY"));

    [SkippableFact]
    public async Task OpenAi_ReturnsValidJson_ForCannedLandscapePrompt()
    {
        Skip.IfNot(HasCreds, "OPENAI_API_KEY not configured — skipping live test.");

        var key = Environment.GetEnvironmentVariable("OPENAI_API_KEY")!;
        var client = new ChatClient("gpt-4o", new ApiKeyCredential(key));
        var messages = new List<ChatMessage>
        {
            new SystemChatMessage("Return valid JSON only. No prose."),
            new UserChatMessage(new ChatMessageContentPart[]
            {
                ChatMessageContentPart.CreateTextPart(
                    "Describe this photo as a JSON object with only one key 'description' and one short sentence."),
                ChatMessageContentPart.CreateImagePart(
                    BinaryData.FromBytes(Convert.FromBase64String(SamplePngBase64)), "image/png")
            }),
        };

        var completion = await client.CompleteChatAsync(messages);
        var raw = completion.Value.Content[0].Text;

        // Pull out the JSON region the way our production handler does.
        var firstBrace = raw.IndexOf('{');
        var lastBrace = raw.LastIndexOf('}');
        Assert.True(firstBrace >= 0 && lastBrace > firstBrace, $"No JSON in response: {raw}");
        var json = raw.Substring(firstBrace, lastBrace - firstBrace + 1);
        var doc = JsonDocument.Parse(json);
        Assert.True(doc.RootElement.TryGetProperty("description", out _), $"Missing 'description' in: {json}");
    }
}
