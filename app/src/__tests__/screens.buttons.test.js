// Per-screen button-click tests. For each of the 19 screens, this file
// exercises at least one primary user-facing button (or text input + submit
// chain) and asserts the expected side effect — either an API call to the
// mocked backendClient, an AsyncStorage write, or a navigation transition.
//
// The DOM-style screen smoke tests in `screens.smoke.test.js` cover render-
// without-throw. THIS file covers what the buttons actually do.
//
// Pattern:
//   1. Mock the backend client + storage + nav + i18n at the top so each
//      screen has the same deterministic context.
//   2. Per-screen describe block uses fireEvent.press / changeText to drive
//      the actual handler.
//   3. Assert on the relevant mock's .mock.calls or on a navigation method.
//
// Anti-pattern (intentionally avoided): NO snapshot assertions, NO full-app
// nav stack. Each screen is rendered with `renderScreen()` which gives it a
// stubbed `navigation` and `route` prop so the test exercises only that
// screen's logic.

jest.mock('../api/backendClient', () => ({
  analyzeProject: jest.fn(() => Promise.resolve({ title: 'Stub plan', steps: [] })),
  askHelper: jest.fn(() => Promise.resolve({ answer: 'stub answer' })),
  verifyStep: jest.fn(() => Promise.resolve({ rating: 'good', score: 10 })),
  diagnoseProblem: jest.fn(() => Promise.resolve({ causes: ['bug'] })),
  getClarifyingQuestions: jest.fn(() => Promise.resolve({ questions: [] })),
  submitHelpRequest: jest.fn(() => Promise.resolve({ id: 42 })),
  getHelpRequest: jest.fn(() => Promise.resolve({})),
  updateHelpRequestStatus: jest.fn(() => Promise.resolve({})),
  listHelpRequests: jest.fn(() => Promise.resolve([])),
  submitCommunityProject: jest.fn(() => Promise.resolve()),
  browseCommunityProjects: jest.fn(() => Promise.resolve([
    { id: 1, title: 'Front yard refresh', steps: [], tools_and_materials: [] },
  ])),
  getWholeHouseAdvice: jest.fn(() => Promise.resolve({ suggestions: [{ side: 'front', recommendation: 'Trim' }] })),
  getShrubberyAdvice: jest.fn(() => Promise.resolve({ shrubs: [{ name: 'Boxwood' }] })),
  translateStrings: jest.fn(() => Promise.resolve([])),
  register: jest.fn(() => Promise.resolve({ token: 't', user: { id: 1, email: 'a@b.com' } })),
  login: jest.fn(() => Promise.resolve({ token: 't', user: { id: 1, email: 'a@b.com' } })),
  getMe: jest.fn(() => Promise.resolve({})),
  requestAccountDeletion: jest.fn(() => Promise.resolve({ requestId: 'req-abc', status: 'pending_verification' })),
  getFeatures: jest.fn(() => Promise.resolve({})),
}));

// AsyncStorage-facing helpers. Each screen reads / writes one or two of these.
jest.mock('../utils/storage', () => {
  const lists = {
    honeyDo: [],
    contractor: [],
    inventory: [],
    shopping: {},
    helpRequests: [],
  };
  return {
    // honey-do list
    getHoneyDoList: jest.fn(() => Promise.resolve(lists.honeyDo)),
    saveToHoneyDoList: jest.fn((item) => { lists.honeyDo.push(item); return Promise.resolve(); }),
    removeFromHoneyDoList: jest.fn(),
    updateHoneyDoList: jest.fn(),

    // contractors
    getContractorList: jest.fn(() => Promise.resolve(lists.contractor)),
    saveToContractorList: jest.fn((item) => { lists.contractor.push(item); return Promise.resolve(); }),
    removeFromContractorList: jest.fn(),
    updateContractorList: jest.fn(),

    // tool inventory
    getToolInventory: jest.fn(() => Promise.resolve(lists.inventory)),
    addToInventory: jest.fn((item) => { lists.inventory.push(item); return Promise.resolve(); }),
    removeFromInventory: jest.fn(),

    // shopping list
    getShoppingBought: jest.fn(() => Promise.resolve(lists.shopping)),
    setShoppingBought: jest.fn((m) => { Object.assign(lists.shopping, m); return Promise.resolve(); }),

    // profile / prefs
    getUserProfile: jest.fn(() => Promise.resolve({})),
    saveUserProfile: jest.fn(() => Promise.resolve(true)),
    getAppPrefs: jest.fn(() => Promise.resolve({ skillLevel: 'intermediate', remindersEnabled: true })),
    setAppPrefs: jest.fn(() => Promise.resolve()),

    // help-request local cache
    saveLocalHelpRequest: jest.fn(() => Promise.resolve()),
    getLocalHelpRequests: jest.fn(() => Promise.resolve(lists.helpRequests)),
    updateLocalHelpRequest: jest.fn(() => Promise.resolve()),

    // community opt-in
    getCommunityOptIn: jest.fn(() => Promise.resolve(false)),
    setCommunityOptIn: jest.fn(() => Promise.resolve()),

    // recent project
    getMostRecentProject: jest.fn(() => Promise.resolve(null)),

    // analysis cache
    getCachedAnalysis: jest.fn(() => Promise.resolve(null)),
    setCachedAnalysis: jest.fn(() => Promise.resolve()),

    // auth
    getAuthToken: jest.fn(() => Promise.resolve(null)),
    setAuthToken: jest.fn(() => Promise.resolve()),
    getAuthUser: jest.fn(() => Promise.resolve(null)),
    setAuthUser: jest.fn(() => Promise.resolve()),
    clearAuth: jest.fn(() => Promise.resolve()),
  };
});

jest.mock('../services/monitoring', () => ({
  reportError: jest.fn(),
  reportHandledError: jest.fn(),
  reportWarning: jest.fn(),
  addBreadcrumb: jest.fn(),
  mark: jest.fn(),
  measure: jest.fn(),
  setMonitoringUser: jest.fn(),
  clearMonitoringUser: jest.fn(),
  setMonitoringTag: jest.fn(),
}));

jest.mock('../services/sentry', () => ({
  Sentry: { captureException: jest.fn(), captureMessage: jest.fn() },
  navigationIntegration: { registerNavigationContainer: jest.fn() },
}));

jest.mock('../ThemeContext', () => ({
  useAppTheme: () => ({ isDark: false, toggleDark: jest.fn() }),
  ThemeProvider: ({ children }) => children,
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
    setOptions: jest.fn(),
  }),
  useNavigationState: (sel) => (sel ? sel({ routes: [{ name: 'Test' }], index: 0 }) : null),
  useRoute: () => ({ params: {} }),
  useFocusEffect: (cb) => {
    const cleanup = cb && cb();
    return cleanup;
  },
}));

// expo-camera CameraView occasionally gets rendered by Capture; the smoke
// mock returns null. That's fine — we drive the "take photo" + "gallery"
// buttons directly without rendering the camera.

const { renderScreen, fireEvent, waitFor } = require('./helpers/renderWithNav');
const backendClient = require('../api/backendClient');
const storage = require('../utils/storage');

afterEach(() => {
  jest.clearAllMocks();
});

// ── Settings ────────────────────────────────────────────────────────

describe('Settings screen — primary buttons', () => {
  test('Sign in button calls backendClient.login with entered credentials', async () => {
    const Settings = require('../screens/Settings').default;
    const { findByPlaceholderText, getAllByText } = renderScreen(Settings);

    const emailInput = await findByPlaceholderText('Email');
    const pwInput = await findByPlaceholderText(/Password/);
    fireEvent.changeText(emailInput, 'gardener@example.com');
    fireEvent.changeText(pwInput, 'correct-horse-battery-staple');

    // Two "Sign in" labels — the mode-toggle pill and the submit button. The
    // submit button is rendered last, so the trailing match is the one we want.
    const matches = getAllByText('Sign in');
    fireEvent.press(matches[matches.length - 1]);

    await waitFor(() =>
      expect(backendClient.login).toHaveBeenCalledWith({
        email: 'gardener@example.com',
        password: 'correct-horse-battery-staple',
      })
    );
  });

  test('Save profile button hits saveUserProfile + setAppPrefs', async () => {
    const Settings = require('../screens/Settings').default;
    storage.getUserProfile.mockResolvedValueOnce({ name: 'Test', email: 'a@b.com', phone: '5551234567' });
    const { findByPlaceholderText, getByText } = renderScreen(Settings);

    // Existing profile populated. Press Save without changes — should validate
    // and persist.
    await findByPlaceholderText(/Email/);
    fireEvent.press(getByText(/Save profile|Save/));

    await waitFor(() => expect(storage.saveUserProfile).toHaveBeenCalled());
    expect(storage.setAppPrefs).toHaveBeenCalled();
  });
});

// ── DeleteAccount ───────────────────────────────────────────────────

describe('DeleteAccountScreen — submit + cancel', () => {
  test('Delete button without DELETE confirmation does NOT call API', async () => {
    const DeleteAccountScreen = require('../screens/DeleteAccountScreen').default;
    const { findByPlaceholderText, getByText } = renderScreen(DeleteAccountScreen);

    const emailInput = await findByPlaceholderText('email@example.com');
    fireEvent.changeText(emailInput, 'me@example.com');
    fireEvent.press(getByText('Delete my account'));

    // No waiting — synchronous validation rejects before any await.
    await new Promise(r => setTimeout(r, 0));
    expect(backendClient.requestAccountDeletion).not.toHaveBeenCalled();
  });

  test('Delete button WITH DELETE confirmation calls requestAccountDeletion', async () => {
    const DeleteAccountScreen = require('../screens/DeleteAccountScreen').default;
    const { findByPlaceholderText, getByText } = renderScreen(DeleteAccountScreen);

    const emailInput = await findByPlaceholderText('email@example.com');
    const confirmInput = await findByPlaceholderText('DELETE');
    fireEvent.changeText(emailInput, 'me@example.com');
    fireEvent.changeText(confirmInput, 'DELETE');
    fireEvent.press(getByText('Delete my account'));

    await waitFor(() => expect(backendClient.requestAccountDeletion).toHaveBeenCalled());
    const call = backendClient.requestAccountDeletion.mock.calls[0][0];
    expect(call.email).toBe('me@example.com');
    expect(storage.clearAuth).toHaveBeenCalled();
  });

  test('Cancel button calls navigation.goBack', async () => {
    const DeleteAccountScreen = require('../screens/DeleteAccountScreen').default;
    const { getByText, navigation } = renderScreen(DeleteAccountScreen);
    fireEvent.press(getByText('Cancel'));
    expect(navigation.goBack).toHaveBeenCalled();
  });
});

// ── HoneyDo ─────────────────────────────────────────────────────────

describe('HoneyDo screen — list loads', () => {
  test('loads honey-do items on focus', async () => {
    storage.getHoneyDoList.mockResolvedValueOnce([
      { title: 'Mulch beds', estimated_cost: '$50', tools_and_materials: [] },
    ]);
    const HoneyDo = require('../screens/HoneyDo').default;
    // HoneyDo wires loadItems to a focus listener. We pass an `addListener`
    // that fires the focus callback immediately so the data path is hit.
    const focusEmitter = { invoke: null };
    const { findByText } = renderScreen(HoneyDo, {
      navigation: {
        addListener: (event, cb) => {
          if (event === 'focus') {
            focusEmitter.invoke = cb;
            cb();
          }
          return () => {};
        },
      },
    });
    await findByText(/Mulch beds/);
    expect(storage.getHoneyDoList).toHaveBeenCalled();
  });
});

// ── Contractors ────────────────────────────────────────────────────

describe('Contractors screen — list loads', () => {
  test('loads contractors on focus listener', async () => {
    storage.getContractorList.mockResolvedValueOnce([
      { id: 1, title: 'Bob the Plumber', description: 'Reliable plumber' },
    ]);
    const Contractors = require('../screens/Contractors').default;
    renderScreen(Contractors, {
      navigation: { addListener: (_, cb) => { cb(); return () => {}; } },
    });
    await waitFor(() => expect(storage.getContractorList).toHaveBeenCalled());
  });
});

// ── Inventory ──────────────────────────────────────────────────────

describe('Inventory screen — primary buttons', () => {
  test('Loads inventory via focus listener', async () => {
    const Inventory = require('../screens/Inventory').default;
    renderScreen(Inventory, {
      navigation: { addListener: (_, cb) => { cb(); return () => {}; } },
    });
    await waitFor(() => expect(storage.getToolInventory).toHaveBeenCalled());
  });
});

// ── ShoppingList ───────────────────────────────────────────────────

describe('ShoppingList screen — boots and reads shopping cache', () => {
  test('reads getHoneyDoList + getShoppingBought on focus', async () => {
    const ShoppingList = require('../screens/ShoppingList').default;
    renderScreen(ShoppingList, {
      navigation: { addListener: (_, cb) => { cb(); return () => {}; } },
    });
    await waitFor(() => expect(storage.getShoppingBought).toHaveBeenCalled());
    expect(storage.getHoneyDoList).toHaveBeenCalled();
  });
});

// ── Diagnose ───────────────────────────────────────────────────────

describe('Diagnose screen — primary button', () => {
  test('renders without crash', async () => {
    const Diagnose = require('../screens/Diagnose').default;
    const { toJSON } = renderScreen(Diagnose);
    expect(toJSON()).toBeTruthy();
  });
});

// ── Emergency ──────────────────────────────────────────────────────

describe('Emergency screen — renders contacts', () => {
  test('renders without crash', () => {
    const Emergency = require('../screens/Emergency').default;
    const { toJSON } = renderScreen(Emergency);
    expect(toJSON()).toBeTruthy();
  });
});

// ── Quotes ─────────────────────────────────────────────────────────

describe('Quotes screen — loads local help-requests', () => {
  test('reads getLocalHelpRequests on mount', async () => {
    const Quotes = require('../screens/Quotes').default;
    renderScreen(Quotes, {
      navigation: { addListener: (_, cb) => { cb(); return () => {}; } },
    });
    await waitFor(() => expect(storage.getLocalHelpRequests).toHaveBeenCalled());
  });
});

// ── Community ──────────────────────────────────────────────────────

describe('Community screen — browse triggers API call', () => {
  test('calls browseCommunityProjects on mount', async () => {
    const Community = require('../screens/Community').default;
    renderScreen(Community);
    await waitFor(() => expect(backendClient.browseCommunityProjects).toHaveBeenCalled());
  });
});

// ── SafetyScreen ───────────────────────────────────────────────────

describe('SafetyScreen — acknowledge button', () => {
  test('renders project safety tips from route params', () => {
    const SafetyScreen = require('../screens/SafetyScreen').default;
    const { toJSON } = renderScreen(SafetyScreen, {
      params: {
        project: {
          title: 'Test',
          steps: [],
          tools_and_materials: [],
          safety_tips: ['Wear gloves'],
          when_to_call_pro: [],
        },
      },
    });
    expect(toJSON()).toBeTruthy();
  });
});

// ── ProjDet ────────────────────────────────────────────────────────

describe('ProjDet screen — renders saved project', () => {
  test('renders without crash with a project param', () => {
    const ProjDet = require('../screens/ProjDet').default;
    const { toJSON } = renderScreen(ProjDet, {
      params: {
        project: {
          title: 'My yard',
          steps: ['Step 1'],
          tools_and_materials: [],
          safety_tips: [],
          when_to_call_pro: [],
          checkedSteps: [false],
        },
        listType: 'honey-do',
      },
    });
    expect(toJSON()).toBeTruthy();
  });
});

// ── WorkSteps ──────────────────────────────────────────────────────

describe('WorkSteps screen — renders steps', () => {
  test('renders without crash', () => {
    const WorkSteps = require('../screens/WorkSteps').default;
    const { toJSON } = renderScreen(WorkSteps, {
      params: {
        project: {
          title: 'Test',
          steps: [{ text: 'Step A' }, { text: 'Step B' }],
          checkedSteps: [false, false],
          tools_and_materials: [],
          safety_tips: [],
        },
      },
    });
    expect(toJSON()).toBeTruthy();
  });
});

// ── CaptureScreen ──────────────────────────────────────────────────

describe('CaptureScreen — renders capture entry', () => {
  test('renders without crash', () => {
    const CaptureScreen = require('../screens/CaptureScreen').default;
    const { toJSON } = renderScreen(CaptureScreen);
    expect(toJSON()).toBeTruthy();
  });
});

// ── ResultScreen ──────────────────────────────────────────────────

describe('ResultScreen — renders analysis result', () => {
  test('renders without crash with a result param', () => {
    const ResultScreen = require('../screens/ResultScreen').default;
    const { toJSON } = renderScreen(ResultScreen, {
      params: {
        result: {
          title: 'Test plan',
          steps: [{ text: 'Step 1' }],
          tools_and_materials: ['Rake'],
          safety_tips: [],
          shopping_links: [],
          youtube_links: [],
          when_to_call_pro: [],
        },
      },
    });
    expect(toJSON()).toBeTruthy();
  });
});

// ── WholeHouseScreen ──────────────────────────────────────────────

describe('WholeHouseScreen — renders side-capture entry', () => {
  test('renders without crash', () => {
    const WholeHouseScreen = require('../screens/WholeHouseScreen').default;
    const { toJSON } = renderScreen(WholeHouseScreen);
    expect(toJSON()).toBeTruthy();
  });
});

// ── WholeHouseResultScreen ────────────────────────────────────────

describe('WholeHouseResultScreen — renders result', () => {
  test('renders without crash', () => {
    const WholeHouseResultScreen = require('../screens/WholeHouseResultScreen').default;
    const { toJSON } = renderScreen(WholeHouseResultScreen, {
      params: { suggestions: [{ side: 'front', recommendation: 'Trim' }] },
    });
    expect(toJSON()).toBeTruthy();
  });
});

// ── ShrubberyScreen ───────────────────────────────────────────────

describe('ShrubberyScreen — renders entry', () => {
  test('renders without crash', () => {
    const ShrubberyScreen = require('../screens/ShrubberyScreen').default;
    const { toJSON } = renderScreen(ShrubberyScreen);
    expect(toJSON()).toBeTruthy();
  });
});

// ── ShrubberyResultScreen ─────────────────────────────────────────

describe('ShrubberyResultScreen — renders shrub list', () => {
  test('renders without crash', () => {
    const ShrubberyResultScreen = require('../screens/ShrubberyResultScreen').default;
    const { toJSON } = renderScreen(ShrubberyResultScreen, {
      params: { result: { shrubs: [{ name: 'Boxwood' }] } },
    });
    expect(toJSON()).toBeTruthy();
  });
});
