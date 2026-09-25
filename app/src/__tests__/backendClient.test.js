// The shared backend AI kill switch answers 503
// {error:"ai_disabled", code:"ai_kill_switch", message:"<sentence>"}; the
// user must see the sentence, never the machine token.

jest.mock('../config/api', () => ({ API_BASE_URL: 'https://api.landscape.test' }));
jest.mock('../utils/storage', () => ({
  getCachedAnalysis: jest.fn(() => Promise.resolve(null)),
  setCachedAnalysis: jest.fn(() => Promise.resolve()),
  getAppPrefs: jest.fn(() => Promise.resolve({})),
  getToolInventory: jest.fn(() => Promise.resolve([])),
  getAuthToken: jest.fn(() => Promise.resolve(null)),
}));

const { diagnoseProblem, getShrubberyAdvice, pickErrorMessage } = require('../api/backendClient');

const sentence = "The AI features are paused right now. Everything you've already added is safe.";
const killSwitch503 = () => jest.fn(() => Promise.resolve({
  ok: false,
  status: 503,
  json: () => Promise.resolve({ error: 'ai_disabled', code: 'ai_kill_switch', message: sentence }),
}));

describe('pickErrorMessage', () => {
  it('prefers the sentence when error is a machine token', () => {
    expect(pickErrorMessage({ error: 'ai_disabled', code: 'ai_kill_switch', message: 'Paused.' })).toBe('Paused.');
  });

  it('keeps an app sentence in error as-is', () => {
    expect(pickErrorMessage({ error: 'OPENAI_API_KEY is not configured.' })).toBe('OPENAI_API_KEY is not configured.');
  });

  it('falls back to message, and tolerates a missing body', () => {
    expect(pickErrorMessage({ message: 'Only a message.' })).toBe('Only a message.');
    expect(pickErrorMessage(undefined)).toBeUndefined();
  });
});

describe('AI calls under the kill switch', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('jsonFetch callers show the shared sentence, not its machine error token', async () => {
    global.fetch = killSwitch503();
    const err = await diagnoseProblem({ description: 'x' }).catch((e) => e);
    expect(err.message).toBe(sentence);
    expect(err.status).toBe(503);
    expect(err.code).toBe('ai_kill_switch');
  });

  it('hand-rolled fetch callers (shrubbery advice) do too', async () => {
    global.fetch = killSwitch503();
    const err = await getShrubberyAdvice({ photos: [], zip: '55401' }).catch((e) => e);
    expect(err.message).toBe(sentence);
    expect(err.code).toBe('ai_kill_switch');
  });
});
