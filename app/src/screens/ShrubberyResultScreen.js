import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
} from 'react-native';
import { Ionicons as Icon } from '@expo/vector-icons';
import theme from '../theme';

const URGENCY_COLORS = {
  high: theme.colors.danger,
  medium: '#F59E0B',
  low: theme.colors.success,
};

const DIFFICULTY_COLORS = {
  easy: theme.colors.success,
  medium: '#F59E0B',
  hard: theme.colors.danger,
};

const weekdayFromISO = (iso) => {
  try {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  } catch {
    return iso;
  }
};

const iconForDescription = (desc = '') => {
  const d = desc.toLowerCase();
  if (d.includes('thunder')) return 'thunderstorm-outline';
  if (d.includes('snow')) return 'snow-outline';
  if (d.includes('rain') || d.includes('shower') || d.includes('drizzle')) return 'rainy-outline';
  if (d.includes('fog')) return 'cloud-outline';
  if (d.includes('overcast') || d.includes('cloud')) return 'cloudy-outline';
  if (d.includes('partly')) return 'partly-sunny-outline';
  if (d.includes('clear') || d.includes('mostly clear')) return 'sunny-outline';
  return 'partly-sunny-outline';
};

export default function ShrubberyResultScreen({ route }) {
  const { result, zip } = route.params || {};
  const shrubs = result?.shrubs || [];
  const forecast = result?.forecast;
  const dailyForecast = forecast?.daily || [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.summaryCard}>
        <Icon name="leaf" size={28} color={theme.colors.primary} />
        <Text style={styles.summaryTitle}>Your Shrubbery Plan</Text>

        <View style={styles.badgeRow}>
          {result?.season ? (
            <View style={styles.contextBadge}>
              <Icon name="calendar-outline" size={12} color={theme.colors.primary} />
              <Text style={styles.contextBadgeText}>{result.season}</Text>
            </View>
          ) : null}
          {result?.hardiness_zone ? (
            <View style={styles.contextBadge}>
              <Icon name="thermometer-outline" size={12} color={theme.colors.primary} />
              <Text style={styles.contextBadgeText}>Zone {result.hardiness_zone}</Text>
            </View>
          ) : null}
          {forecast?.place ? (
            <View style={styles.contextBadge}>
              <Icon name="location-outline" size={12} color={theme.colors.primary} />
              <Text style={styles.contextBadgeText}>{forecast.place}</Text>
            </View>
          ) : zip ? (
            <View style={styles.contextBadge}>
              <Icon name="location-outline" size={12} color={theme.colors.primary} />
              <Text style={styles.contextBadgeText}>{zip}</Text>
            </View>
          ) : null}
        </View>

        {result?.weather_outlook ? (
          <View style={styles.weatherBox}>
            <Icon name="partly-sunny-outline" size={16} color="#0369A1" />
            <Text style={styles.weatherText}>{result.weather_outlook}</Text>
          </View>
        ) : null}

        {dailyForecast.length > 0 ? (
          <View style={styles.forecastWrap}>
            <View style={styles.forecastHeader}>
              <Text style={styles.forecastTitle}>Next {Math.min(dailyForecast.length, 7)} days</Text>
              <Text style={styles.forecastAttrib}>via Open-Meteo</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.forecastStrip}>
              {dailyForecast.slice(0, 7).map((d, i) => (
                <View key={i} style={styles.forecastDay}>
                  <Text style={styles.forecastDayLabel}>{weekdayFromISO(d.date)}</Text>
                  <Icon name={iconForDescription(d.description)} size={22} color="#0369A1" />
                  <Text style={styles.forecastHigh}>
                    {d.high_f != null ? `${Math.round(d.high_f)}°` : '—'}
                  </Text>
                  <Text style={styles.forecastLow}>
                    {d.low_f != null ? `${Math.round(d.low_f)}°` : '—'}
                  </Text>
                  {d.precip_prob != null && d.precip_prob >= 20 ? (
                    <View style={styles.precipPill}>
                      <Icon name="water-outline" size={10} color="#0369A1" />
                      <Text style={styles.precipPillText}>{d.precip_prob}%</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {result?.overall_notes ? (
          <Text style={styles.overallNotes}>{result.overall_notes}</Text>
        ) : null}
      </View>

      {shrubs.map((s, i) => {
        const urgency = (s.urgency || 'low').toLowerCase();
        const difficulty = (s.difficulty || '').toLowerCase();
        return (
          <View key={i} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.shrubName}>{s.name || `Shrub ${i + 1}`}</Text>
                {s.species_guess ? (
                  <Text style={styles.speciesText}>
                    {s.species_guess !== 'Unknown' ? s.species_guess : 'Species unknown'}
                  </Text>
                ) : null}
              </View>
              {s.urgency ? (
                <View style={[styles.urgencyBadge, { backgroundColor: URGENCY_COLORS[urgency] || '#94A3B8' }]}>
                  <Text style={styles.urgencyText}>{urgency} urgency</Text>
                </View>
              ) : null}
            </View>

            {s.current_condition ? (
              <View style={styles.conditionRow}>
                <Icon name="eye-outline" size={14} color="#64748B" />
                <Text style={styles.conditionText}>{s.current_condition}</Text>
              </View>
            ) : null}

            {(s.action_summary || s.recommended_action) ? (
              <View style={styles.actionBox}>
                <View style={styles.actionHeader}>
                  <Icon name="cut-outline" size={16} color={theme.colors.primary} />
                  <Text style={styles.actionLabel}>
                    {s.recommended_action ? s.recommended_action.replace(/\b\w/g, c => c.toUpperCase()) : 'Recommended action'}
                  </Text>
                </View>
                {s.action_summary ? <Text style={styles.actionText}>{s.action_summary}</Text> : null}
              </View>
            ) : null}

            {s.timing ? (
              <View style={styles.timingRow}>
                <Icon name="time-outline" size={14} color="#D97706" />
                <Text style={styles.timingText}>{s.timing}</Text>
              </View>
            ) : null}

            <View style={styles.metaRow}>
              {s.estimated_time ? (
                <View style={styles.metaItem}>
                  <Icon name="hourglass-outline" size={14} color={theme.colors.primary} />
                  <Text style={styles.metaText}>{s.estimated_time}</Text>
                </View>
              ) : null}
              {s.estimated_cost ? (
                <View style={styles.metaItem}>
                  <Icon name="cash-outline" size={14} color="#D97706" />
                  <Text style={styles.metaText}>{s.estimated_cost}</Text>
                </View>
              ) : null}
              {difficulty ? (
                <View style={styles.metaItem}>
                  <Icon name="build-outline" size={14} color={DIFFICULTY_COLORS[difficulty] || '#475569'} />
                  <Text style={[styles.metaText, { color: DIFFICULTY_COLORS[difficulty] || '#475569' }]}>
                    {difficulty}
                  </Text>
                </View>
              ) : null}
            </View>

            {s.tools_needed && s.tools_needed.length > 0 && (
              <View style={styles.subSection}>
                <Text style={styles.subHeading}>Tools needed</Text>
                <View style={styles.chipRow}>
                  {s.tools_needed.map((t, ti) => (
                    <View key={ti} style={styles.chip}>
                      <Text style={styles.chipText}>{t}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {s.steps && s.steps.length > 0 && (
              <View style={styles.subSection}>
                <Text style={styles.subHeading}>How to do it</Text>
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

            {s.warnings && s.warnings.length > 0 && (
              <View style={styles.warningsBox}>
                {s.warnings.map((w, wi) => (
                  <View key={wi} style={styles.warningRow}>
                    <Icon name="warning-outline" size={14} color="#B91C1C" />
                    <Text style={styles.warningText}>{w}</Text>
                  </View>
                ))}
              </View>
            )}

            {s.pro_tip ? (
              <View style={styles.proTipBox}>
                <Icon name="bulb-outline" size={16} color="#D97706" />
                <Text style={styles.proTipText}>{s.pro_tip}</Text>
              </View>
            ) : null}

            {s.shopping_links && s.shopping_links.length > 0 && (
              <View style={styles.linksSection}>
                <Text style={styles.subHeading}>Shop</Text>
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
        );
      })}

      {shrubs.length === 0 && (
        <View style={styles.emptyCard}>
          <Icon name="leaf-outline" size={48} color="#CBD5E1" />
          <Text style={styles.emptyText}>
            I couldn't identify any shrubs in those photos. Try taking closer shots of individual shrubs.
          </Text>
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
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, justifyContent: 'center' },
  contextBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#E8F5E9', paddingVertical: 5, paddingHorizontal: 10,
    borderRadius: 100,
  },
  contextBadgeText: { fontSize: 11, fontWeight: '700', color: theme.colors.primary },
  weatherBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#E0F2FE', padding: 12, borderRadius: 12, marginTop: 12,
    width: '100%',
  },
  weatherText: { flex: 1, fontSize: 12, color: '#075985', lineHeight: 17 },
  forecastWrap: { width: '100%', marginTop: 14 },
  forecastHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    marginBottom: 6,
  },
  forecastTitle: { fontSize: 12, fontWeight: '800', color: '#0F172A', textTransform: 'uppercase', letterSpacing: 0.5 },
  forecastAttrib: { fontSize: 10, color: '#94A3B8', fontStyle: 'italic' },
  forecastStrip: { width: '100%' },
  forecastDay: {
    alignItems: 'center', backgroundColor: '#F0F9FF',
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12,
    marginRight: 8, minWidth: 62,
  },
  forecastDayLabel: { fontSize: 11, fontWeight: '700', color: '#0369A1', marginBottom: 4 },
  forecastHigh: { fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 4 },
  forecastLow: { fontSize: 12, color: '#64748B', marginTop: -1 },
  precipPill: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: '#E0F2FE', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 8, marginTop: 4,
  },
  precipPillText: { fontSize: 9, fontWeight: '700', color: '#0369A1' },
  overallNotes: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 10, lineHeight: 18 },
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20, marginBottom: 16,
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  shrubName: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  speciesText: { fontSize: 12, color: '#94A3B8', marginTop: 2, fontStyle: 'italic' },
  urgencyBadge: {
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 100, marginLeft: 8,
  },
  urgencyText: { color: '#fff', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  conditionRow: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#F8FAFC', padding: 10, borderRadius: 10, marginBottom: 12,
  },
  conditionText: { flex: 1, fontSize: 13, color: '#475569', lineHeight: 18 },
  actionBox: {
    backgroundColor: '#F0FDF4', padding: 12, borderRadius: 12, marginBottom: 12,
    borderLeftWidth: 4, borderLeftColor: theme.colors.primary,
  },
  actionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  actionLabel: { fontSize: 13, fontWeight: '800', color: theme.colors.primary, textTransform: 'capitalize' },
  actionText: { fontSize: 13, color: '#064E3B', lineHeight: 18 },
  timingRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: '#FFFBEB', padding: 10, borderRadius: 10, marginBottom: 12,
  },
  timingText: { flex: 1, fontSize: 12, color: '#92400E', fontWeight: '600', lineHeight: 17 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, fontWeight: '600', color: '#475569', textTransform: 'capitalize' },
  subSection: { marginTop: 8 },
  subHeading: { fontSize: 13, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: '#F0FDF4', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 100 },
  chipText: { fontSize: 11, fontWeight: '600', color: theme.colors.primary },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  stepNumber: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#E8F5E9',
    justifyContent: 'center', alignItems: 'center',
  },
  stepNumberText: { fontSize: 11, fontWeight: '800', color: theme.colors.primary },
  stepText: { flex: 1, fontSize: 13, color: '#475569', lineHeight: 18 },
  warningsBox: {
    backgroundColor: '#FEF2F2', padding: 10, borderRadius: 10, marginTop: 12, gap: 6,
  },
  warningRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  warningText: { flex: 1, fontSize: 12, color: '#991B1B', lineHeight: 17 },
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
  emptyText: { fontSize: 14, color: '#94A3B8', marginTop: 12, textAlign: 'center', lineHeight: 20 },
});
