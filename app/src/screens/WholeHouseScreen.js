import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Image, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons as Icon } from '@expo/vector-icons';
import { getWholeHouseAdvice } from '../api/backendClient';
import { useTranslation } from '../i18n/I18nContext';
import theme from '../theme';

const SIDES = [
  { key: 'front', label: 'Front of House', icon: 'home-outline' },
  { key: 'left',  label: 'Left Side',      icon: 'arrow-back-outline' },
  { key: 'back',  label: 'Back of House',   icon: 'image-outline' },
  { key: 'right', label: 'Right Side',      icon: 'arrow-forward-outline' },
];

export default function WholeHouseScreen({ navigation }) {
  const { t, language } = useTranslation();
  const [sideIndex, setSideIndex] = useState(0);
  const [photos, setPhotos] = useState({ front: [], left: [], back: [], right: [] });
  const [budget, setBudget] = useState('');
  const [ideas, setIdeas] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  // Wizard step: 0-3 = photo sides, 4 = budget & ideas
  const wizardStep = sideIndex <= 3 ? 'photos' : 'details';
  const currentSide = SIDES[sideIndex] || SIDES[3];
  const totalPhotos = Object.values(photos).reduce((sum, arr) => sum + arr.length, 0);

  const openCamera = async () => {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        Alert.alert(t('permission_denied'), t('camera_perm_msg'));
        return;
      }
    }
    setShowCamera(true);
  };

  const capturePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, base64: true });
      setPhotos(prev => ({
        ...prev,
        [currentSide.key]: [...prev[currentSide.key], {
          uri: photo.uri,
          base64: photo.base64,
          mimeType: 'image/jpeg',
        }],
      }));
      setShowCamera(false);
    } catch (err) {
      Alert.alert(t('camera_error'), err.message);
    }
  };

  const removePhoto = (sideKey, index) => {
    setPhotos(prev => ({
      ...prev,
      [sideKey]: prev[sideKey].filter((_, i) => i !== index),
    }));
  };

  const goNextSide = () => {
    if (photos[currentSide.key].length === 0) {
      Alert.alert('No Photos', `Please take at least one photo of the ${currentSide.label.toLowerCase()}.`);
      return;
    }
    setSideIndex(prev => prev + 1);
  };

  const goPrevSide = () => {
    setSideIndex(prev => Math.max(0, prev - 1));
  };

  const handleSubmit = async () => {
    if (totalPhotos === 0) {
      Alert.alert('No Photos', 'Please go back and add photos of your house.');
      return;
    }
    setIsAnalyzing(true);
    try {
      const result = await getWholeHouseAdvice({
        photos,
        budget,
        ideas,
        language,
      });
      navigation.navigate('WholeHouseResult', { result, budget, ideas });
    } catch (error) {
      Alert.alert('Analysis Error', error.message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const renderPhotoStep = () => (
    <>
      {/* Progress bar */}
      <View style={styles.progressContainer}>
        {SIDES.map((s, i) => (
          <View key={s.key} style={styles.progressStep}>
            <View style={[
              styles.progressDot,
              i < sideIndex && styles.progressDotDone,
              i === sideIndex && styles.progressDotActive,
            ]}>
              {i < sideIndex ? (
                <Icon name="checkmark" size={14} color="#fff" />
              ) : (
                <Text style={[
                  styles.progressDotText,
                  i === sideIndex && styles.progressDotTextActive,
                ]}>{i + 1}</Text>
              )}
            </View>
            <Text style={[
              styles.progressLabel,
              i === sideIndex && styles.progressLabelActive,
            ]}>{s.label.split(' ')[0]}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.sideHeader}>
          <View style={[styles.iconCircle, { backgroundColor: '#E8F5E9' }]}>
            <Icon name={currentSide.icon} size={28} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.sideTitle}>{currentSide.label}</Text>
            <Text style={styles.sideSub}>
              Take as many photos as you'd like of this area
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.captureButton} onPress={openCamera}>
          <Icon name="camera" size={24} color="#fff" />
          <Text style={styles.captureButtonText}>Take Photo</Text>
        </TouchableOpacity>

        {photos[currentSide.key].length > 0 && (
          <View style={styles.previewSection}>
            <Text style={styles.previewCount}>
              {photos[currentSide.key].length} photo{photos[currentSide.key].length !== 1 ? 's' : ''} taken
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewList}>
              {photos[currentSide.key].map((p, i) => (
                <View key={i} style={styles.previewItem}>
                  <Image source={{ uri: p.uri }} style={styles.previewImage} />
                  <TouchableOpacity
                    style={styles.removeMedia}
                    onPress={() => removePhoto(currentSide.key, i)}
                  >
                    <Icon name="close-circle" size={20} color={theme.colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.navRow}>
          {sideIndex > 0 ? (
            <TouchableOpacity style={styles.navBackButton} onPress={goPrevSide}>
              <Icon name="chevron-back" size={20} color="#475569" />
              <Text style={styles.navBackText}>Back</Text>
            </TouchableOpacity>
          ) : <View />}
          <TouchableOpacity style={styles.navNextButton} onPress={goNextSide}>
            <Text style={styles.navNextText}>
              {sideIndex < 3 ? 'Next Side' : 'Continue'}
            </Text>
            <Icon name="chevron-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary of all sides */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Photos Collected</Text>
        {SIDES.map((s, i) => (
          <View key={s.key} style={styles.summaryRow}>
            <Icon
              name={photos[s.key].length > 0 ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={photos[s.key].length > 0 ? theme.colors.success : '#CBD5E1'}
            />
            <Text style={[
              styles.summaryLabel,
              i === sideIndex && { fontWeight: '700', color: theme.colors.primary },
            ]}>{s.label}</Text>
            <Text style={styles.summaryCount}>
              {photos[s.key].length} photo{photos[s.key].length !== 1 ? 's' : ''}
            </Text>
          </View>
        ))}
      </View>
    </>
  );

  const renderDetailsStep = () => (
    <View style={styles.card}>
      <View style={styles.sideHeader}>
        <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}>
          <Icon name="cash-outline" size={28} color="#D97706" />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.sideTitle}>Budget & Ideas</Text>
          <Text style={styles.sideSub}>
            Tell us your budget and any ideas you'd like considered
          </Text>
        </View>
      </View>

      <Text style={styles.fieldLabel}>What's your budget?</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. $5,000 or $2,000 - $10,000"
        placeholderTextColor="#94A3B8"
        value={budget}
        onChangeText={setBudget}
        keyboardType="default"
      />

      <Text style={styles.fieldLabel}>Any ideas or preferences?</Text>
      <TextInput
        style={[styles.input, { minHeight: 120 }]}
        placeholder="e.g. I'd love a patio area, native plants, better curb appeal, low maintenance garden, privacy hedge..."
        placeholderTextColor="#94A3B8"
        multiline
        value={ideas}
        onChangeText={setIdeas}
        textAlignVertical="top"
      />

      <View style={styles.photoSummaryBadge}>
        <Icon name="images-outline" size={16} color={theme.colors.primary} />
        <Text style={styles.photoSummaryText}>{totalPhotos} photos across 4 sides</Text>
      </View>

      <View style={styles.navRow}>
        <TouchableOpacity style={styles.navBackButton} onPress={goPrevSide}>
          <Icon name="chevron-back" size={20} color="#475569" />
          <Text style={styles.navBackText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitButton, isAnalyzing && styles.disabledButton]}
          onPress={handleSubmit}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Icon name="sparkles" size={20} color="#fff" />
              <Text style={styles.submitButtonText}>Get Suggestions</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

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
          <Icon name="home" size={32} color={theme.colors.primary} />
          <Text style={styles.heroTitle}>Whole House Advice</Text>
          <Text style={styles.heroSub}>
            Capture your house from all sides and get personalized landscaping suggestions ranked by price and complexity.
          </Text>
        </View>

        {wizardStep === 'photos' ? renderPhotoStep() : renderDetailsStep()}
      </ScrollView>

      {/* Camera modal */}
      <Modal visible={showCamera} animationType="slide">
        <View style={styles.cameraContainer}>
          <CameraView ref={cameraRef} style={styles.camera} facing="back">
            <View style={styles.cameraBanner}>
              <Text style={styles.cameraBannerText}>
                {currentSide.label}
              </Text>
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
  progressContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, paddingHorizontal: 8 },
  progressStep: { alignItems: 'center', flex: 1 },
  progressDot: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#E2E8F0',
    justifyContent: 'center', alignItems: 'center',
  },
  progressDotActive: { backgroundColor: theme.colors.primary },
  progressDotDone: { backgroundColor: theme.colors.success },
  progressDotText: { fontSize: 12, fontWeight: '700', color: '#94A3B8' },
  progressDotTextActive: { color: '#fff' },
  progressLabel: { fontSize: 10, color: '#94A3B8', marginTop: 4, fontWeight: '600' },
  progressLabelActive: { color: theme.colors.primary },
  card: {
    backgroundColor: '#fff', borderRadius: 24, padding: 20, marginBottom: 16,
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1, shadowRadius: 20, elevation: 5,
  },
  sideHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
  },
  sideTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  sideSub: { fontSize: 13, color: '#64748B', marginTop: 2 },
  captureButton: {
    backgroundColor: theme.colors.primary, height: 56, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 8,
  },
  captureButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  previewSection: { marginTop: 16 },
  previewCount: { fontSize: 12, fontWeight: '700', color: '#64748B', marginBottom: 8, textTransform: 'uppercase' },
  previewList: { flexDirection: 'row' },
  previewItem: {
    width: 80, height: 80, borderRadius: 12, marginRight: 10,
    position: 'relative', borderWidth: 1, borderColor: '#E2E8F0',
  },
  previewImage: { width: '100%', height: '100%', borderRadius: 11 },
  removeMedia: { position: 'absolute', top: -5, right: -5, backgroundColor: '#fff', borderRadius: 10 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 },
  navBackButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 12, paddingHorizontal: 16,
  },
  navBackText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  navNextButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.colors.primary, paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: 12,
  },
  navNextText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  summaryCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  summaryTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 10 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  summaryLabel: { flex: 1, fontSize: 13, color: '#475569' },
  summaryCount: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  fieldLabel: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14,
    borderColor: '#E2E8F0', borderWidth: 1, fontSize: 14, color: '#1E293B',
  },
  photoSummaryBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F0FDF4', paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 100, alignSelf: 'flex-start', marginTop: 16,
  },
  photoSummaryText: { fontSize: 12, fontWeight: '600', color: theme.colors.primary },
  submitButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.primary, paddingVertical: 14, paddingHorizontal: 24,
    borderRadius: 12, shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 8 },
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
