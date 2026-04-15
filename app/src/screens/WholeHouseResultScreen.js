import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
} from 'react-native';
import { Ionicons as Icon } from '@expo/vector-icons';
import theme from '../theme';

const COMPLEXITY_ORDER = { easy: 0, medium: 1, hard: 2 };
const COMPLEXITY_COLORS = {
  easy: theme.colors.success,
  medium: '#F59E0B',
  hard: theme.colors.danger,
};

function parseCost(costStr) {
  if (!costStr) return 0;
  const nums = costStr.match(/[\d,]+/g);
  if (!nums) return 0;
  // Use the first number as the lower bound for sorting
  return parseInt(nums[0].replace(/,/g, ''), 10);
}

export default function WholeHouseResultScreen({ route }) {
  const { result, budget, ideas } = route.params;
  const suggestions = result?.suggestions || [];
  const [sortBy, setSortBy] = useState('price'); // 'price' or 'complexity'

  const sorted = [...suggestions].sort((a, b) => {
    if (sortBy === 'price') {
      return parseCost(a.estimated_cost) - parseCost(b.estimated_cost);
    }
    return (COMPLEXITY_ORDER[a.complexity] || 0) - (COMPLEXITY_ORDER[b.complexity] || 0);
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header summary */}
      <View style={styles.summaryCard}>
        <Icon name="home" size={28} color={theme.colors.primary} />
        <Text style={styles.summaryTitle}>Your Whole House Plan</Text>
        {budget ? (
          <View style={styles.budgetBadge}>
            <Icon name="cash-outline" size={14} color="#D97706" />
            <Text style={styles.budgetText}>Budget: {budget}</Text>
          </View>
        ) : null}
        {result?.overall_notes ? (
          <Text style={styles.overallNotes}>{result.overall_notes}</Text>
        ) : null}
      </View>

      {/* Sort controls */}
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sort by:</Text>
        <TouchableOpacity
          style={[styles.sortButton, sortBy === 'price' && styles.sortButtonActive]}
          onPress={() => setSortBy('price')}
        >
          <Icon name="cash-outline" size={14} color={sortBy === 'price' ? '#fff' : '#475569'} />
          <Text style={[styles.sortButtonText, sortBy === 'price' && styles.sortButtonTextActive]}>Price</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortButton, sortBy === 'complexity' && styles.sortButtonActive]}
          onPress={() => setSortBy('complexity')}
        >
          <Icon name="build-outline" size={14} color={sortBy === 'complexity' ? '#fff' : '#475569'} />
          <Text style={[styles.sortButtonText, sortBy === 'complexity' && styles.sortButtonTextActive]}>Complexity</Text>
        </TouchableOpacity>
      </View>

      {/* Suggestion cards */}
      {sorted.map((s, i) => (
        <View key={i} style={styles.suggestionCard}>
          <View style={styles.suggestionHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.suggestionTitle}>{s.title}</Text>
              <Text style={styles.suggestionArea}>
                {s.area ? `Area: ${s.area}` : ''}
              </Text>
            </View>
            <View style={[styles.complexityBadge, { backgroundColor: COMPLEXITY_COLORS[s.complexity] || '#94A3B8' }]}>
              <Text style={styles.complexityText}>{s.complexity || 'N/A'}</Text>
            </View>
          </View>

          <Text style={styles.suggestionDesc}>{s.description}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Icon name="cash-outline" size={14} color="#D97706" />
              <Text style={styles.metaText}>{s.estimated_cost || 'N/A'}</Text>
            </View>
            <View style={styles.metaItem}>
              <Icon name="time-outline" size={14} color={theme.colors.primary} />
              <Text style={styles.metaText}>{s.estimated_time || 'N/A'}</Text>
            </View>
            {s.diy_friendly !== undefined && (
              <View style={styles.metaItem}>
                <Icon
                  name={s.diy_friendly ? 'hand-left-outline' : 'construct-outline'}
                  size={14}
                  color={s.diy_friendly ? theme.colors.success : theme.colors.secondary}
                />
                <Text style={styles.metaText}>{s.diy_friendly ? 'DIY Friendly' : 'Hire a Pro'}</Text>
              </View>
            )}
          </View>

          {/* Materials */}
          {s.materials && s.materials.length > 0 && (
            <View style={styles.materialsSection}>
              <Text style={styles.subHeading}>Materials & Plants</Text>
              <View style={styles.chipRow}>
                {s.materials.map((m, mi) => (
                  <View key={mi} style={styles.chip}>
                    <Text style={styles.chipText}>{m}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Steps preview */}
          {s.steps && s.steps.length > 0 && (
            <View style={styles.stepsSection}>
              <Text style={styles.subHeading}>Key Steps</Text>
              {s.steps.map((step, si) => (
                <View key={si} style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{si + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Pro tip */}
          {s.pro_tip && (
            <View style={styles.proTipBox}>
              <Icon name="bulb-outline" size={16} color="#D97706" />
              <Text style={styles.proTipText}>{s.pro_tip}</Text>
            </View>
          )}

          {/* Shopping links */}
          {s.shopping_links && s.shopping_links.length > 0 && (
            <View style={styles.linksSection}>
              {s.shopping_links.map((link, li) => (
                <TouchableOpacity
                  key={li}
                  style={styles.linkButton}
                  onPress={() => {
                    const url = link.amazon_url || link.url;
                    if (url) Linking.openURL(url);
                  }}
                >
                  <Icon name="cart-outline" size={14} color={theme.colors.primary} />
                  <Text style={styles.linkText}>{link.item || link}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      ))}

      {sorted.length === 0 && (
        <View style={styles.emptyCard}>
          <Icon name="leaf-outline" size={48} color="#CBD5E1" />
          <Text style={styles.emptyText}>No suggestions returned. Please try again.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 20, paddingBottom: 100 },
  summaryCard: {
    backgroundColor: '#fff', borderRadius: 24, padding: 24, alignItems: 'center',
    marginBottom: 16, shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  summaryTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', marginTop: 8 },
  budgetBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FEF3C7', paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 100, marginTop: 10,
  },
  budgetText: { fontSize: 13, fontWeight: '700', color: '#92400E' },
  overallNotes: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 10, lineHeight: 18 },
  sortRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16,
  },
  sortLabel: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  sortButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 100,
    backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0',
  },
  sortButtonActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  sortButtonText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  sortButtonTextActive: { color: '#fff' },
  suggestionCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 16,
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
  },
  suggestionHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  suggestionTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  suggestionArea: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  complexityBadge: {
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 100, marginLeft: 8,
  },
  complexityText: { color: '#fff', fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  suggestionDesc: { fontSize: 14, color: '#475569', lineHeight: 20, marginBottom: 12 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  materialsSection: { marginTop: 8 },
  subHeading: { fontSize: 13, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: '#F0FDF4', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 100 },
  chipText: { fontSize: 11, fontWeight: '600', color: theme.colors.primary },
  stepsSection: { marginTop: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  stepNumber: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#E8F5E9',
    justifyContent: 'center', alignItems: 'center',
  },
  stepNumberText: { fontSize: 11, fontWeight: '800', color: theme.colors.primary },
  stepText: { flex: 1, fontSize: 13, color: '#475569', lineHeight: 18 },
  proTipBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FFFBEB', padding: 12, borderRadius: 12, marginTop: 12,
  },
  proTipText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },
  linksSection: { marginTop: 12, gap: 6 },
  linkButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: '#F0FDF4', borderRadius: 10,
  },
  linkText: { fontSize: 12, fontWeight: '600', color: theme.colors.primary },
  emptyCard: {
    alignItems: 'center', padding: 40, backgroundColor: '#fff',
    borderRadius: 20, marginTop: 20,
  },
  emptyText: { fontSize: 14, color: '#94A3B8', marginTop: 12 },
});
