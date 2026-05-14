import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons as Icon } from '@expo/vector-icons';
import { getAuthUser, getAuthToken, clearAuth } from '../utils/storage';
import { requestAccountDeletion } from '../api/backendClient';
import theme from '../theme';

// App-store / Play-Console compliance: every app that creates an account must
// give the user an in-app way to request deletion. Posts to /api/account/delete;
// the server logs a pending_verification row and the actual wipe is handled
// out-of-band within 30 days. See docs/backend-deletion-endpoint.md.
export default function DeleteAccountScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const u = await getAuthUser();
      if (u) {
        setUser(u);
        setEmail(u.email || '');
        setName(u.displayName || '');
      }
    })();
  }, []);

  const handleSubmit = async () => {
    if (!email.trim() && !phone.trim()) {
      setError('Please enter an email or phone number so we can confirm the request.');
      return;
    }
    if (confirmText.trim().toUpperCase() !== 'DELETE') {
      setError('Type DELETE to confirm.');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const token = await getAuthToken();
      const res = await requestAccountDeletion({
        name: name.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        token,
      });
      setResult(res);
      // The deletion is queued, but for the user's lock screen experience we
      // sign them out locally right away so the app stops sending their token.
      await clearAuth();
    } catch (e) {
      setError(e.message || 'Could not submit deletion request. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Icon name="checkmark-circle" size={64} color={theme.colors.primary} style={{ alignSelf: 'center', marginBottom: 16 }} />
          <Text style={styles.title}>Request received</Text>
          <Text style={styles.body}>
            We will delete the account and all associated data within 30 days. You will receive a confirmation email when the deletion is complete.
          </Text>
          <Text style={[styles.body, { marginTop: 12 }]}>
            Reference ID: <Text style={{ fontWeight: '700' }}>{result.requestId}</Text>
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('NewProject')}
          >
            <Text style={styles.primaryButtonText}>Back to app</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Icon name="warning-outline" size={48} color="#DC2626" style={{ alignSelf: 'center', marginBottom: 12 }} />
        <Text style={styles.title}>Delete account</Text>
        <Text style={styles.body}>
          This will permanently delete your Landscape Helper account, including saved Whole House Advice sessions, shrubbery recommendations, and help requests. We cannot undo this.
        </Text>
        <Text style={[styles.body, { marginTop: 8 }]}>
          The deletion is processed within 30 days. You will be signed out immediately and receive an email when the wipe completes.
        </Text>

        <Text style={styles.label}>Name (optional)</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={theme.colors.textSecondary}
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="email@example.com"
          placeholderTextColor={theme.colors.textSecondary}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Phone (optional)</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="Phone number"
          placeholderTextColor={theme.colors.textSecondary}
          keyboardType="phone-pad"
        />

        <Text style={[styles.label, { marginTop: 20 }]}>Type DELETE to confirm</Text>
        <TextInput
          style={styles.input}
          value={confirmText}
          onChangeText={setConfirmText}
          placeholder="DELETE"
          placeholderTextColor={theme.colors.textSecondary}
          autoCapitalize="characters"
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.dangerButton, busy && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={busy}
        >
          {busy
            ? <ActivityIndicator color="#FFF" />
            : <Text style={styles.dangerButtonText}>Delete my account</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
          disabled={busy}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { padding: 20, paddingBottom: 40 },
  title: {
    fontSize: 22, fontWeight: '800', color: theme.colors.text,
    textAlign: 'center', marginBottom: 12,
  },
  body: {
    fontSize: 14, color: theme.colors.textSecondary,
    lineHeight: 20, textAlign: 'center',
  },
  label: {
    fontSize: 13, fontWeight: '700', color: theme.colors.text,
    marginTop: 16, marginBottom: 6,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.roundness.medium,
    padding: 12, fontSize: 15, color: theme.colors.text,
  },
  errorText: {
    color: '#DC2626', fontSize: 13, marginTop: 12, textAlign: 'center',
  },
  dangerButton: {
    backgroundColor: '#DC2626',
    padding: 14, borderRadius: theme.roundness.medium,
    alignItems: 'center', marginTop: 24,
  },
  dangerButtonText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  cancelButton: {
    backgroundColor: theme.colors.background,
    borderWidth: 1, borderColor: theme.colors.border,
    padding: 12, borderRadius: theme.roundness.medium,
    alignItems: 'center', marginTop: 12,
  },
  cancelButtonText: { color: theme.colors.textSecondary, fontWeight: '700' },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    padding: 14, borderRadius: theme.roundness.medium,
    alignItems: 'center', marginTop: 24,
  },
  primaryButtonText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});
