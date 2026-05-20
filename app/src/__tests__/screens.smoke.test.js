// Smoke tests: every screen renders without throwing when supplied with
// reasonable stub params. These do not assert any behaviour — they only
// catch regressions like missing imports, destructuring against undefined
// params, or bad hook setup.

jest.mock('../utils/storage', () => {
  const noop = () => Promise.resolve();
  const empty = () => Promise.resolve([]);
  return {
    getHoneyDoList: empty,
    getContractorList: empty,
    removeFromHoneyDoList: noop,
    removeFromContractorList: noop,
    updateHoneyDoList: noop,
    updateContractorList: noop,
    saveToHoneyDoList: noop,
    saveToContractorList: noop,
    getUserProfile: () => Promise.resolve({}),
    saveUserProfile: noop,
    saveLocalHelpRequest: noop,
    getLocalHelpRequests: empty,
    updateLocalHelpRequest: noop,
    getCommunityOptIn: () => Promise.resolve(false),
    setCommunityOptIn: noop,
    getAppPrefs: () => Promise.resolve({}),
    setAppPrefs: noop,
    getToolInventory: empty,
    addToInventory: noop,
    removeFromInventory: noop,
    getShoppingBought: () => Promise.resolve({}),
    setShoppingBought: noop,
    getMostRecentProject: () => Promise.resolve(null),
    getCachedAnalysis: () => Promise.resolve(null),
    setCachedAnalysis: noop,
    getAuthToken: () => Promise.resolve(null),
    setAuthToken: noop,
    getAuthUser: () => Promise.resolve(null),
    setAuthUser: noop,
    clearAuth: noop,
  };
});

jest.mock('../api/backendClient', () => ({
  analyzeProject: jest.fn(() => Promise.resolve({ title: 'Stub', steps: [] })),
  askHelper: jest.fn(() => Promise.resolve({ answer: 'stub' })),
  verifyStep: jest.fn(() => Promise.resolve({ rating: 'good', score: 10 })),
  diagnoseProblem: jest.fn(() => Promise.resolve({ causes: [] })),
  getClarifyingQuestions: jest.fn(() => Promise.resolve({ questions: [] })),
  submitHelpRequest: jest.fn(() => Promise.resolve({ id: 1 })),
  getHelpRequest: jest.fn(() => Promise.resolve({})),
  updateHelpRequestStatus: jest.fn(() => Promise.resolve({})),
  listHelpRequests: jest.fn(() => Promise.resolve([])),
  submitCommunityProject: jest.fn(() => Promise.resolve()),
  browseCommunityProjects: jest.fn(() => Promise.resolve([])),
  getWholeHouseAdvice: jest.fn(() => Promise.resolve({ suggestions: [] })),
  getShrubberyAdvice: jest.fn(() => Promise.resolve({ shrubs: [] })),
  translateStrings: jest.fn(() => Promise.resolve([])),
  register: jest.fn(() => Promise.resolve({ token: 't', user: { id: 1 } })),
  login: jest.fn(() => Promise.resolve({ token: 't', user: { id: 1 } })),
  getMe: jest.fn(() => Promise.resolve({})),
  requestAccountDeletion: jest.fn(() => Promise.resolve({ requestId: 'abc' })),
  getFeatures: jest.fn(() => Promise.resolve({})),
}));

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
  useAppTheme: () => ({ isDark: false, toggleDark: () => {} }),
  ThemeProvider: ({ children }) => children,
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    addListener: jest.fn(() => jest.fn()),
    setOptions: jest.fn(),
  }),
  useNavigationState: (selector) => (selector ? selector({ routes: [{ name: 'Test' }], index: 0 }) : null),
  useRoute: () => ({ params: {} }),
  useFocusEffect: (cb) => {
    const cleanup = cb && cb();
    return cleanup;
  },
}));

// Shared `renderWithNav` (from @sburson34/mobile-shared/testing) is the
// canonical render helper since 0.3.x. Its signature is
// `renderWithNav(Component, { params, navigation, props })` — to keep the
// existing call shape (`renderScreen(Comp, { params, ...extraProps })`)
// we tunnel the extra props through `props`. This adapter lets us delete
// the per-app `helpers/renderWithNav.js` without rewriting every callsite.
const { renderWithNav } = require('@sburson34/mobile-shared/testing');
const renderScreen = (Component, { params, navigation, ...extraProps } = {}) =>
  renderWithNav(Component, { params, navigation, props: extraProps });

const sampleProject = {
  title: 'Test landscape project',
  steps: ['Prepare bed', 'Plant'],
  tools_and_materials: [],
  difficulty: 'easy',
  estimated_time: '1 hr',
  estimated_cost: '$50',
  youtube_links: [],
  shopping_links: [],
  safety_tips: [],
  when_to_call_pro: [],
  checkedSteps: [false, false],
};

// Each entry renders a screen and verifies the render returns a tree. We
// list the screens that don't already have a dedicated nav test so the loop
// stays under 8 cases and runs fast.
const cases = [
  { name: 'Settings',                    module: '../screens/Settings',                  params: {} },
  { name: 'DeleteAccountScreen',         module: '../screens/DeleteAccountScreen',       params: {} },
  { name: 'Inventory',                   module: '../screens/Inventory',                 params: {} },
  { name: 'ShoppingList',                module: '../screens/ShoppingList',              params: {} },
  { name: 'Emergency',                   module: '../screens/Emergency',                 params: {} },
  { name: 'Quotes',                      module: '../screens/Quotes',                    params: {} },
  { name: 'Diagnose',                    module: '../screens/Diagnose',                  params: {} },
  { name: 'SafetyScreen',                module: '../screens/SafetyScreen',              params: { project: sampleProject } },
  { name: 'ProjDet',                     module: '../screens/ProjDet',                   params: { project: sampleProject, listType: 'honey-do' } },
];

describe('screen smoke tests', () => {
  for (const c of cases) {
    test(`${c.name} renders without throwing`, () => {
      const Component = require(c.module).default;
      const { toJSON } = renderScreen(Component, { params: c.params });
      expect(toJSON()).toBeTruthy();
    });
  }
});
