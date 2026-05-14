import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, Modal, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons as Icon } from '@expo/vector-icons';
import {
  saveUserProfile, getUserProfile,
  getAppPrefs, setAppPrefs,
  getCommunityOptIn, setCommunityOptIn,
  getAuthToken, setAuthToken, getAuthUser, setAuthUser, clearAuth,
} from '../utils/storage';
import { login as apiLogin, register as apiRegister } from '../api/backendClient';
import { useTranslation } from '../i18n/I18nContext';
import { GOOGLE_LANGUAGES } from '../i18n/googleLanguages';
import { useAppTheme } from '../ThemeContext';
import theme from '../theme';

export default function Settings({ navigation }) {
  const { t, language, setLanguage, isTranslating, translationError } = useTranslation();
  const { isDark, toggleDark } = useAppTheme();
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const [langSearch, setLangSearch] = useState('');

  // Account state
  const [authUser, setAuthUserState] = useState(null);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [zip, setZip] = useState('');
  const [skillLevel, setSkillLevel] = useState('intermediate');
  const [reminders, setReminders] = useState(true);
  const [community, setCommunity] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const profile = await getUserProfile();
      if (profile) {
        setName(profile.name || '');
        setEmail(profile.email || '');
        setPhone(profile.phone || '');
      }
      const prefs = await getAppPrefs();
      setZip(prefs.zip || '');
      setSkillLevel(prefs.skillLevel || 'intermediate');
      setReminders(prefs.remindersEnabled !== false);
      setCommunity(await getCommunityOptIn());
      const u = await getAuthUser();
      if (u) setAuthUserState(u);
    })();
  }, []);

  const handleAuth = async () => {
    if (!authEmail.trim() || !authPassword) {
      setAuthError('Email and password are required.');
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      const fn = authMode === 'register' ? apiRegister : apiLogin;
      const args = authMode === 'register'
        ? { email: authEmail.trim(), password: authPassword, displayName: name || null }
        : { email: authEmail.trim(), password: authPassword };
      const result = await fn(args);
      await setAuthToken(result.token);
      await setAuthUser(result.user);
      setAuthUserState(result.user);
      setAuthEmail('');
      setAuthPassword('');
    } catch (e) {
      setAuthError(e.message || 'Sign in failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    await clearAuth();
    setAuthUserState(null);
  };

  const handleSave = async () => {
    if (!name.trim() || !email.trim() || !phone.trim()) {
      Alert.alert(t('required_fields'), t('required_fields_msg'));
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert(t('invalid_email'), t('invalid_email_msg'));
      return;
    }
    const success = await saveUserProfile({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
    });
    await setAppPrefs({ zip: zip.trim(), skillLevel, remindersEnabled: reminders });
    await setCommunityOptIn(community);
    if (success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      Alert.alert(t('error'), t('save_failed'));
    }
  };

  const SKILLS = [
    { id: 'beginner', label: 'Beginner' },
    { id: 'intermediate', label: 'Intermediate' },
    { id: 'advanced', label: 'Advanced' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Icon name="person-circle-outline" size={64} color={theme.colors.primary} />
            <Text style={styles.title}>{t('your_contact_info')}</Text>
            <Text style={styles.subtitle}>{t('contact_info_settings_desc')}</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t('name')}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t('full_name_placeholder')}
              placeholderTextColor={theme.colors.textSecondary}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t('email')}</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder={t('email_placeholder')}
              placeholderTextColor={theme.colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t('phone')}</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder={t('phone_placeholder')}
              placeholderTextColor={theme.colors.textSecondary}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Zip code (for permit checks)</Text>
            <TextInput
              style={styles.input}
              value={zip}
              onChangeText={setZip}
              placeholder="e.g. 02144"
              placeholderTextColor={theme.colors.textSecondary}
              keyboardType="number-pad"
              maxLength={5}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>DIY skill level</Text>
            <View style={styles.skillRow}>
              {SKILLS.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.skillBtn, skillLevel === s.id && styles.skillBtnActive]}
                  onPress={() => setSkillLevel(s.id)}
                >
                  <Text style={[styles.skillBtnText, skillLevel === s.id && styles.skillBtnTextActive]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Dark mode</Text>
              <Text style={styles.toggleSub}>Use a dark color scheme.</Text>
            </View>
            <Switch value={isDark} onValueChange={toggleDark} />
          </View>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Reminders</Text>
              <Text style={styles.toggleSub}>Notify me about unfinished projects.</Text>
            </View>
            <Switch value={reminders} onValueChange={setReminders} />
          </View>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Share to community</Text>
              <Text style={styles.toggleSub}>Anonymously share completed projects to the community library.</Text>
            </View>
            <Switch value={community} onValueChange={setCommunity} />
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Icon name={saved ? 'checkmark-circle' : 'save-outline'} size={22} color="#FFF" />
            <Text style={styles.saveButtonText}>{saved ? t('saved') : t('save_profile')}</Text>
          </TouchableOpacity>

          {/* Account / Sign-in section */}
          <View style={styles.languageSection}>
            <View style={styles.languageHeader}>
              <Icon name="person-circle-outline" size={24} color={theme.colors.primary} />
              <Text style={styles.languageTitle}>Account</Text>
            </View>
            {authUser ? (
              <>
                <Text style={styles.languageDesc}>
                  Signed in as <Text style={{ fontWeight: '700' }}>{authUser.email}</Text>.
                  Whole-house advice will be saved to your history at landscape.diyhelper.org/account.
                </Text>
                <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
                  <Text style={styles.signOutText}>Sign out</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteAccountButton}
                  onPress={() => {
                    if (!navigation) return;
                    // DeleteAccount lives inside the CaptureStack so we hop
                    // through the NewProject drawer route to reach it.
                    navigation.navigate('NewProject', { screen: 'DeleteAccount' });
                  }}
                >
                  <Text style={styles.deleteAccountText}>Delete account</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.languageDesc}>
                  Sign in to save your Whole House Advice and view it later at landscape.diyhelper.org/account.
                </Text>
                <View style={styles.languageButtons}>
                  <TouchableOpacity
                    style={[styles.langButton, authMode === 'login' && styles.langButtonActive]}
                    onPress={() => setAuthMode('login')}
                  >
                    <Text style={[styles.langButtonText, authMode === 'login' && styles.langButtonTextActive]}>Sign in</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.langButton, authMode === 'register' && styles.langButtonActive]}
                    onPress={() => setAuthMode('register')}
                  >
                    <Text style={[styles.langButtonText, authMode === 'register' && styles.langButtonTextActive]}>Create account</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[styles.input, { marginTop: 12 }]}
                  value={authEmail}
                  onChangeText={setAuthEmail}
                  placeholder="Email"
                  placeholderTextColor={theme.colors.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TextInput
                  style={[styles.input, { marginTop: 8 }]}
                  value={authPassword}
                  onChangeText={setAuthPassword}
                  placeholder="Password (8+ chars)"
                  placeholderTextColor={theme.colors.textSecondary}
                  secureTextEntry
                />
                {authError ? <Text style={styles.translationError}>{authError}</Text> : null}
                <TouchableOpacity
                  style={[styles.signInButton, authBusy && styles.disabledButton]}
                  onPress={handleAuth}
                  disabled={authBusy}
                >
                  {authBusy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.signInText}>{authMode === 'register' ? 'Create account' : 'Sign in'}</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Language toggle */}
          <View style={styles.languageSection}>
            <View style={styles.languageHeader}>
              <Icon name="language-outline" size={24} color={theme.colors.primary} />
              <Text style={styles.languageTitle}>{t('language')}</Text>
              {isTranslating && <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginLeft: 8 }} />}
            </View>
            <Text style={styles.languageDesc}>{t('language_desc')}</Text>
            <View style={styles.languageButtons}>
              <TouchableOpacity
                style={[styles.langButton, language === 'en' && styles.langButtonActive]}
                onPress={() => setLanguage('en')}
              >
                <Text style={[styles.langButtonText, language === 'en' && styles.langButtonTextActive]}>
                  {t('english')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.langButton, language === 'es' && styles.langButtonActive]}
                onPress={() => setLanguage('es')}
              >
                <Text style={[styles.langButtonText, language === 'es' && styles.langButtonTextActive]}>
                  {t('spanish')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* More languages dropdown */}
            <TouchableOpacity
              style={styles.moreLanguagesButton}
              onPress={() => { setLangSearch(''); setLangPickerOpen(true); }}
            >
              <Icon name="globe-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.moreLanguagesText}>
                {language !== 'en' && language !== 'es'
                  ? (GOOGLE_LANGUAGES.find(l => l.code === language)?.name || language)
                  : 'More languages…'}
              </Text>
              <Icon name="chevron-down" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
            {translationError ? (
              <Text style={styles.translationError}>Translation error: {translationError}</Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Language picker modal */}
      <Modal visible={langPickerOpen} animationType="slide" transparent onRequestClose={() => setLangPickerOpen(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Choose a language</Text>
              <TouchableOpacity onPress={() => setLangPickerOpen(false)}>
                <Icon name="close" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.pickerSearch}
              value={langSearch}
              onChangeText={setLangSearch}
              placeholder="Search…"
              placeholderTextColor={theme.colors.textSecondary}
              autoCorrect={false}
            />
            <FlatList
              data={GOOGLE_LANGUAGES.filter(l =>
                !langSearch || l.name.toLowerCase().includes(langSearch.toLowerCase())
              )}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerRow, language === item.code && styles.pickerRowActive]}
                  onPress={() => {
                    setLangPickerOpen(false);
                    setLanguage(item.code);
                  }}
                >
                  <Text style={[styles.pickerRowText, language === item.code && styles.pickerRowTextActive]}>
                    {item.name}
                  </Text>
                  <Text style={styles.pickerRowCode}>{item.code}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.l,
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: theme.spacing.m,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.s,
    paddingHorizontal: theme.spacing.l,
  },
  field: {
    marginBottom: theme.spacing.m,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.roundness.medium,
    padding: theme.spacing.m,
    fontSize: 16,
    color: theme.colors.text,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.roundness.medium,
    padding: theme.spacing.m,
    marginTop: theme.spacing.l,
    gap: 8,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  languageSection: {
    marginTop: theme.spacing.xl,
    padding: theme.spacing.l,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.roundness.large,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  languageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  languageTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  languageDesc: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 14,
  },
  languageButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  langButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.roundness.medium,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  langButtonActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '15',
  },
  langButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  langButtonTextActive: {
    color: theme.colors.primary,
  },
  skillRow: { flexDirection: 'row', gap: 8 },
  skillBtn: {
    flex: 1, paddingVertical: 12, borderRadius: theme.roundness.medium,
    borderWidth: 2, borderColor: theme.colors.border, alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  skillBtnActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '15' },
  skillBtnText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
  skillBtnTextActive: { color: theme.colors.primary },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  toggleLabel: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  toggleSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  moreLanguagesButton: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 12, paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.roundness.medium, backgroundColor: theme.colors.background,
  },
  moreLanguagesText: {
    flex: 1, fontSize: 14, fontWeight: '600', color: theme.colors.text,
  },
  translationError: {
    fontSize: 12, color: theme.colors.danger, marginTop: 8,
  },
  pickerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end',
  },
  pickerCard: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '85%', paddingTop: 16, paddingHorizontal: 16, paddingBottom: 24,
  },
  pickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12,
  },
  pickerTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  pickerSearch: {
    backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: 12, padding: 12, marginBottom: 12, color: theme.colors.text,
  },
  pickerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  pickerRowActive: { backgroundColor: theme.colors.primary + '15' },
  pickerRowText: { fontSize: 15, color: theme.colors.text },
  pickerRowTextActive: { fontWeight: '800', color: theme.colors.primary },
  pickerRowCode: { fontSize: 11, color: theme.colors.textSecondary, fontWeight: '600' },
  signInButton: {
    backgroundColor: theme.colors.primary,
    padding: 14, borderRadius: theme.roundness.medium,
    alignItems: 'center', marginTop: 12,
  },
  signInText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  signOutButton: {
    backgroundColor: theme.colors.background,
    borderWidth: 1, borderColor: theme.colors.border,
    padding: 12, borderRadius: theme.roundness.medium,
    alignItems: 'center', marginTop: 12,
  },
  signOutText: { color: theme.colors.textSecondary, fontWeight: '700' },
  deleteAccountButton: {
    backgroundColor: theme.colors.background,
    borderWidth: 1, borderColor: '#DC2626',
    padding: 12, borderRadius: theme.roundness.medium,
    alignItems: 'center', marginTop: 8,
  },
  deleteAccountText: { color: '#DC2626', fontWeight: '700' },
  disabledButton: { opacity: 0.6 },
});
