namespace LandscapeHelper.Tests.Infrastructure;

/// <summary>
/// xUnit collection marker for tests that mutate process-global state
/// (notably env vars read at Program startup — <c>OPENAI_API_KEY</c>,
/// <c>OPENAI_BASE_URL</c>, <c>AI_KILL_SWITCH</c>). xUnit only runs one test
/// at a time per collection, so applying this attribute to every env-touching
/// test class prevents the parallel-startup race that would otherwise let
/// one factory see another's env vars during its initial host build.
/// </summary>
[CollectionDefinition(nameof(EnvironmentMutatingCollection), DisableParallelization = true)]
public sealed class EnvironmentMutatingCollection { }
