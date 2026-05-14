import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  saveToHoneyDoList,
  getHoneyDoList,
  updateHoneyDoList,
  removeFromHoneyDoList,
  saveToContractorList,
  getContractorList,
  updateContractorList,
  removeFromContractorList,
  saveUserProfile,
  getUserProfile,
  getToolInventory,
  addToInventory,
  removeFromInventory,
  getShoppingBought,
  setShoppingBought,
  getAppPrefs,
  setAppPrefs,
  getCachedAnalysis,
  setCachedAnalysis,
  getLocalHelpRequests,
  saveLocalHelpRequest,
  updateLocalHelpRequest,
  getMostRecentProject,
  getCommunityOptIn,
  setCommunityOptIn,
  getAuthToken,
  setAuthToken,
  getAuthUser,
  setAuthUser,
  clearAuth,
} from '../utils/storage';

beforeEach(() => {
  jest.clearAllMocks();
  AsyncStorage._reset();
});

describe('honey-do list', () => {
  it('save + get round-trips a project with auto-id/createdAt', async () => {
    await saveToHoneyDoList({ title: 'Plant azaleas' });
    const list = await getHoneyDoList();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('Plant azaleas');
    expect(list[0].id).toBeTruthy();
    expect(list[0].createdAt).toBeTruthy();
  });

  it('update replaces an existing entry by id', async () => {
    await saveToHoneyDoList({ title: 'Mulch beds' });
    let [stored] = await getHoneyDoList();
    await updateHoneyDoList({ ...stored, title: 'Mulch front beds' });
    const after = await getHoneyDoList();
    expect(after).toHaveLength(1);
    expect(after[0].title).toBe('Mulch front beds');
  });

  it('remove deletes by id', async () => {
    await saveToHoneyDoList({ title: 'A' });
    await saveToHoneyDoList({ title: 'B' });
    const [first] = await getHoneyDoList();
    await removeFromHoneyDoList(first.id);
    const list = await getHoneyDoList();
    expect(list).toHaveLength(1);
    expect(list[0].title).not.toBe(first.title);
  });

  it('returns [] when storage is empty', async () => {
    const list = await getHoneyDoList();
    expect(list).toEqual([]);
  });

  it('filters out objects that have neither id nor title', async () => {
    await AsyncStorage.setItem('@honey_do_list', JSON.stringify([
      { id: '1', title: 'good' },
      null,
      {},
      { foo: 'bar' },
    ]));
    const list = await getHoneyDoList();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe('good');
  });
});

describe('contractor list', () => {
  it('round-trips entries', async () => {
    await saveToContractorList({ title: 'Tree removal' });
    const list = await getContractorList();
    expect(list[0].title).toBe('Tree removal');
  });

  it('update and remove work like the honey-do list', async () => {
    await saveToContractorList({ title: 'Hardscape' });
    const [stored] = await getContractorList();
    await updateContractorList({ ...stored, title: 'Hardscape patio' });
    let after = await getContractorList();
    expect(after[0].title).toBe('Hardscape patio');
    await removeFromContractorList(after[0].id);
    after = await getContractorList();
    expect(after).toEqual([]);
  });
});

describe('user profile', () => {
  it('saves and retrieves a profile', async () => {
    await saveUserProfile({ name: 'Sam', email: 's@example.com' });
    const profile = await getUserProfile();
    expect(profile).toEqual({ name: 'Sam', email: 's@example.com' });
  });

  it('returns null when none saved', async () => {
    expect(await getUserProfile()).toBeNull();
  });
});

describe('tool inventory', () => {
  it('adds + lists + removes entries by id', async () => {
    await addToInventory({ name: 'Spade' });
    const inv = await getToolInventory();
    expect(inv).toHaveLength(1);
    expect(inv[0].name).toBe('Spade');
    await removeFromInventory(inv[0].id);
    expect(await getToolInventory()).toEqual([]);
  });
});

describe('shopping bought map', () => {
  it('toggles checked-state by key', async () => {
    await setShoppingBought('mulch', true);
    let map = await getShoppingBought();
    expect(map.mulch).toBe(true);
    await setShoppingBought('mulch', false);
    map = await getShoppingBought();
    expect(map.mulch).toBe(false);
  });
});

describe('app prefs', () => {
  it('returns the documented defaults when nothing saved', async () => {
    const prefs = await getAppPrefs();
    expect(prefs).toEqual(
      expect.objectContaining({
        darkMode: false,
        skillLevel: 'intermediate',
        zip: '',
        remindersEnabled: true,
        reminderDays: 3,
      }),
    );
  });

  it('merges patches with current values', async () => {
    await setAppPrefs({ zip: '12345' });
    const prefs = await getAppPrefs();
    expect(prefs.zip).toBe('12345');
    expect(prefs.skillLevel).toBe('intermediate');
  });
});

describe('analyze cache', () => {
  it('round-trips with key = description + media count', async () => {
    await setCachedAnalysis('test', 2, { ok: true });
    const cached = await getCachedAnalysis('test', 2);
    expect(cached).not.toBeNull();
    expect(cached.result).toEqual({ ok: true });
  });

  it('returns null when no entry matches', async () => {
    expect(await getCachedAnalysis('never', 0)).toBeNull();
  });
});

describe('local help requests', () => {
  it('save + list + update', async () => {
    const saved = await saveLocalHelpRequest({ title: 'Quote ask' });
    expect(saved.id).toBeTruthy();
    let list = await getLocalHelpRequests();
    expect(list).toHaveLength(1);
    await updateLocalHelpRequest(saved.id, { status: 'received' });
    list = await getLocalHelpRequests();
    expect(list[0].status).toBe('received');
  });
});

describe('most recent project', () => {
  it('returns null when both lists are empty', async () => {
    expect(await getMostRecentProject()).toBeNull();
  });

  it('returns the project with the latest lastActivityAt', async () => {
    // saveTo*List stamps lastActivityAt with `new Date().toISOString()` and
    // ignores any value the caller passes — so to control ordering we
    // advance the system clock between saves via jest's fake timers.
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    await saveToHoneyDoList({ title: 'older' });
    jest.setSystemTime(new Date('2026-05-13T00:00:00Z'));
    await saveToContractorList({ title: 'newer' });
    jest.useRealTimers();

    const recent = await getMostRecentProject();
    expect(recent.title).toBe('newer');
  });
});

describe('community opt-in', () => {
  it('defaults to false and round-trips', async () => {
    expect(await getCommunityOptIn()).toBe(false);
    await setCommunityOptIn(true);
    expect(await getCommunityOptIn()).toBe(true);
  });
});

describe('auth token / user', () => {
  it('token round-trips and clears', async () => {
    await setAuthToken('abc.def.ghi');
    expect(await getAuthToken()).toBe('abc.def.ghi');
    await setAuthToken(null);
    expect(await getAuthToken()).toBeNull();
  });

  it('user round-trips JSON', async () => {
    await setAuthUser({ id: 1, email: 't@t.com' });
    const u = await getAuthUser();
    expect(u).toEqual({ id: 1, email: 't@t.com' });
  });

  it('clearAuth clears both token and user', async () => {
    await setAuthToken('xxx');
    await setAuthUser({ id: 1, email: 't@t.com' });
    await clearAuth();
    expect(await getAuthToken()).toBeNull();
    expect(await getAuthUser()).toBeNull();
  });
});
