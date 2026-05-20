using Sburson.Shared.Testing;
using Sburson.Shared.Testing.Journey;

namespace LandscapeHelper.Tests.Integration;

/// <summary>
/// Cross-flow user-journey integration test. Exercises the
/// <see cref="JourneyTestBase{TProgram}"/> fluent builder against the always-on
/// portfolio surface (register → login → healthz). Deeper per-endpoint paths
/// are already covered by their own test classes; this file is the canary that
/// catches a regression in the auth → DI → middleware → route chain in one go.
///
/// <para>
/// Uses <c>[Collection("SerialEnv")]</c> from Sburson.Shared.Testing so the
/// journey runs serially against a single factory and asserts on a stable
/// HttpClient state (the auth token is set on a default header).
/// </para>
/// </summary>
[Collection("SerialEnv")]
public class JourneyTests : JourneyTestBase<Program>
{
    public JourneyTests(BaseApiFactory<Program> factory) : base(factory) { }

    [Fact]
    public async Task Register_Login_Healthy()
    {
        var email = $"journey-{Guid.NewGuid():N}@test.local";
        const string password = "correct-horse-battery-staple";

        await Start()
            .RegisterUser(email, password)
            .Login(email, password)
            .AssertHealthy()
            .RunAsync();
    }
}
