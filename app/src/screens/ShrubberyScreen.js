import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Image, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Ionicons as Icon } from '@expo/vector-icons';
import { getShrubberyAdvice } from '../api/backendClient';
import { useTranslation } from '../i18n/I18nContext';
import { getAppPrefs, setAppPrefs } from '../utils/storage';
import theme from '../theme';

export default function ShrubberyScreen({ navigation }) {
  const { language } = useTranslation();
  const [photos, setPhotos] = useState([]);
  const [zip, setZip] = useState('');
  const [notes, setNotes] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [locationStatus, setLocationStatus] = useState('idle'); // 'idle' | 'detecting' | 'detected' | 'denied' | 'unavailable'
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const detectZipFromLocation = async () => {
      try {
        setLocationStatus('detecting');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) setLocationStatus('denied');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });
        const places = await Location.reverseGeocodeAsync({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        const postal = places?.find(p => p?.postalCode)?.postalCode;
        if (cancelled) return;
        if (postal) {
          setZip(postal);
          setLocationStatus('detected');
          // Cache in prefs so future sessions don't re-prompt.
          setAppPrefs({ zip: postal }).catch(() => {});
        } else {
          setLocationStatus('unavailable');
        }
      } catch {
        if (!cancelled) setLocationStatus('unavailable');
      }
    };

    getAppPrefs().then((prefs) => {
      if (cancelled) return;
      if (prefs?.zip) {
        setZip(prefs.zip);
        setLocationStatus('idle');
      } else {
        detectZipFromLocation();
      }
    }).catch(() => {
      if (!cancelled) detectZipFromLocation();
    });

    return () => { cancelled = true; };
  }, []);

  const openCamera = async () => {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        Alert.alert('Permission denied', 'Camera access is needed to photograph your shrubs.');
        return;
      }
    }
    setShowCamera(true);
  };

  const capturePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, base64: true });
      setPhotos(prev => [...prev, { uri: photo.uri, base64: photo.base64, mimeType: 'image/jpeg' }]);
      setShowCamera(false);
    } catch (err) {
      Alert.alert('Camera error', err.message);
    }
  };

  const removePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (photos.length === 0) {
      Alert.alert('No photos yet', 'Take at least one photo of your shrubs so I can have a look.');
      return;
    }
    setIsAnalyzing(true);
    try {
      const result = await getShrubberyAdvice({ photos, zip, notes, language });
      navigation.navigate('ShrubberyResult', { result, zip, notes });
    } catch (error) {
      Alert.alert('Analysis error', error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroCard}>
          <Icon name="leaf" size={32} color={theme.colors.primary} />
          <Text style={styles.heroTitle}>Shrubbery Helper</Text>
          <Text style={styles.heroSub}>
            Photograph your shrubs and I'll tell you exactly what to do right now — pruning, cutting back, replacing, or leaving alone — based on the season and your local weather.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconCircle, { backgroundColor: '#E8F5E9' }]}>
              <Icon name="camera-outline" size={26} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.sectionTitle}>Your shrubs</Text>
              <Text style={styles.sectionSub}>
                Take a clear photo of each shrub or grouping. Get close enough to see the branches.
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.captureButton} onPress={openCamera}>
            <Icon name="camera" size={22} color="#fff" />
            <Text style={styles.captureButtonText}>
              {photos.length === 0 ? 'Take first photo' : 'Add another photo'}
            </Text>
          </TouchableOpacity>

          {photos.length > 0 && (
            <View style={styles.previewSection}>
              <Text style={styles.previewCount}>
                {photos.length} photo{photos.length !== 1 ? 's' : ''}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewList}>
                {photos.map((p, i) => (
                  <View key={i} style={styles.previewItem}>
                    <Image source={{ uri: p.uri }} style={styles.previewImage} />
                    <TouchableOpacity
                      style={styles.removeMedia}
                      onPress={() => removePhoto(i)}
                    >
                      <Icon name="close-circle" size={20} color={theme.colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}>
              <Icon name="location-outline" size={26} color="#D97706" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.sectionTitle}>Your location</Text>
              <Text style={styles.sectionSub}>
                ZIP code helps me factor in your climate, hardiness zone, and upcoming weather.
              </Text>
            </View>
          </View>
          <View style={styles.zipRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="e.g. 90210"
              placeholderTextColor="#94A3B8"
              value={zip}
              onChangeText={(v) => { setZip(v); setLocationStatus('idle'); }}
              keyboardType="number-pad"
              maxLength={10}
            />
            {locationStatus === 'detecting' ? (
              <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginLeft: 10 }} />
            ) : null}
          </View>
          {locationStatus === 'detected' ? (
            <View style={styles.locationHint}>
              <Icon name="navigate-circle" size={14} color={theme.colors.success} />
              <Text style={styles.locationHintText}>Detected from your current location</Text>
            </View>
          ) : locationStatus === 'denied' ? (
            <View style={styles.locationHint}>
              <Icon name="information-circle-outline" size={14} color="#94A3B8" />
              <Text style={styles.locationHintText}>Location permission denied — enter a ZIP manually.</Text>
            </View>
          ) : locationStatus === 'unavailable' ? (
            <View style={styles.locationHint}>
              <Icon name="information-circle-outline" size={14} color="#94A3B8" />
              <Text style={styles.locationHintText}>Couldn't detect your location — enter a ZIP manually.</Text>
            </View>
          ) : null}

          <Text style={styles.fieldLabel}>Anything you want me to know?</Text>
          <TextInput
            style={[styles.input, { minHeight: 90 }]}
            placeholder="e.g. the hedge along the driveway, the yellow-flowering bush, I want it shorter, etc."
            placeholderTextColor="#94A3B8"
            multiline
            value={notes}
            onChangeText={setNotes}
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.submitButton, (isAnalyzing || photos.length === 0) && styles.disabledButton]}
            onPress={handleSubmit}
            disabled={isAnalyzing || photos.length === 0}
          >
            {isAnalyzing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Icon name="sparkles" size={20} color="#fff" />
                <Text style={styles.submitButtonText}>Get shrub advice</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={showCamera} animationType="slide">
        <View style={styles.cameraContainer}>
          <CameraView ref={cameraRef} style={styles.camera} facing="back">
            <View style={styles.cameraBanner}>
              <Text style={styles.cameraBannerText}>Frame the whole shrub</Text>
            </View>
            <View style={styles.cameraControls}>
              <TouchableOpacity style={styles.cameraCancelButton} onPress={() => setShowCamera(false)}>
                <Icon name="close" size={28} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.cameraShutterButton} onPress={capturePhoto}>
                <View style={styles.cameraShutterInner} />
              </TouchableOpacity>
              <View style={{ width: 50 }} />
            </View>
          </CameraView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  contentContainer: { padding: 20, paddingTop: 10, paddingBottom: 120 },
  heroCard: {
    alignItems: 'center', backgroundColor: '#fff', borderRadius: 24,
    padding: 24, marginBottom: 16,
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginTop: 8 },
  heroSub: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 6, lineHeight: 18 },
  card: {
    backgroundColor: '#fff', borderRadius: 24, padding: 20, marginBottom: 16,
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1, shadowRadius: 20, elevation: 5,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  iconCircle: {
    width: 52, height: 52, borderRadius: 26,
    justifyContent: 'center', alignItems: 'center',
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  sectionSub: { fontSize: 12, color: '#64748B', marginTop: 2, lineHeight: 16 },
  captureButton: {
    backgroundColor: theme.colors.primary, height: 54, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 8,
  },
  captureButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  previewSection: { marginTop: 16 },
  previewCount: { fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 8, textTransform: 'uppercase' },
  previewList: { flexDirection: 'row' },
  previewItem: {
    width: 90, height: 90, borderRadius: 12, marginRight: 10,
    position: 'relative', borderWidth: 1, borderColor: '#E2E8F0',
  },
  previewImage: { width: '100%', height: '100%', borderRadius: 11 },
  removeMedia: { position: 'absolute', top: -5, right: -5, backgroundColor: '#fff', borderRadius: 10 },
  fieldLabel: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14,
    borderColor: '#E2E8F0', borderWidth: 1, fontSize: 14, color: '#1E293B',
  },
  zipRow: { flexDirection: 'row', alignItems: 'center' },
  locationHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
  },
  locationHintText: { fontSize: 11, color: '#64748B', fontStyle: 'italic' },
  submitButton: {
    marginTop: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: theme.colors.primary, paddingVertical: 14, paddingHorizontal: 24,
    borderRadius: 14, shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 8,
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabledButton: { backgroundColor: '#CBD5E1', shadowOpacity: 0, elevation: 0 },
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1, justifyContent: 'space-between' },
  cameraBanner: {
    backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 12, paddingHorizontal: 20,
    alignItems: 'center', marginTop: 50,
  },
  cameraBannerText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cameraControls: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 30, paddingBottom: 40,
  },
  cameraCancelButton: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  cameraShutterButton: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  cameraShutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
});
