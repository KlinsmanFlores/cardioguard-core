import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  SafeAreaView, StatusBar, RefreshControl,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

const TYPE_CONFIG = {
  BPM:      { Icon: MaterialCommunityIcons, iconName: 'heart-pulse', color: '#dc2626', bgColor: '#fef2f2', label: 'Frecuencia Cardíaca', unit: 'bpm' },
  SPO2:     { Icon: MaterialCommunityIcons, iconName: 'lungs',       color: '#2563eb', bgColor: '#eff6ff', label: 'Saturación O₂',       unit: '%' },
  PRESSURE: { Icon: MaterialCommunityIcons, iconName: 'stethoscope', color: '#7c3aed', bgColor: '#f5f3ff', label: 'Presión Arterial',    unit: 'mmHg' },
};

const formatDate = (iso) => {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
};

const ReadingCard = ({ item, onViewMap }) => {
  const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.BPM;
  const { date, time } = formatDate(item.timestamp);
  const hasLocation = item.location?.lat;

  return (
    <View style={[styles.card, { borderLeftColor: cfg.color }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <View style={[styles.cardIconWrap, { backgroundColor: cfg.bgColor }]}>
            <cfg.Icon name={cfg.iconName} size={24} color={cfg.color} />
          </View>
          <View style={{flex: 1}}>
            <Text style={styles.cardType}>{cfg.label}</Text>
            <Text style={[styles.cardValue, { color: cfg.color }]}>
              {item.type === 'PRESSURE'
                ? `${item.value.sys}/${item.value.dia}`
                : item.value}
              <Text style={styles.cardUnit}> {cfg.unit}</Text>
            </Text>
          </View>
        </View>
        {hasLocation && (
          <TouchableOpacity
            style={[styles.mapBtn, { backgroundColor: cfg.bgColor, borderColor: cfg.color }]}
            onPress={() => onViewMap(item)}
          >
            <Ionicons name="location" size={14} color={cfg.color} />
            <Text style={[styles.mapBtnText, { color: cfg.color }]}>Ver mapa</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.footerItem}>
          <Ionicons name="calendar-outline" size={14} color="#94a3b8" />
          <Text style={styles.footerText}>{date} — {time}</Text>
        </View>
        {hasLocation && (
          <View style={styles.footerItem}>
            <Ionicons name="location-outline" size={14} color="#94a3b8" />
            <Text style={styles.footerText} numberOfLines={1}>
              {item.location.address || `${item.location.lat.toFixed(4)}, ${item.location.lng.toFixed(4)}`}
            </Text>
          </View>
        )}
        {!hasLocation && (
          <View style={styles.footerItem}>
            <Ionicons name="location-outline" size={14} color="#d4d4d8" />
            <Text style={[styles.footerText, { color: '#d4d4d8' }]}>Ubicación no disponible</Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default function HistoryScreen({ readings, onViewMap, onClear, onBack }) {
  const [filter, setFilter] = useState('ALL');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = filter === 'ALL'
    ? readings
    : readings.filter(r => r.type === filter);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const FILTERS = ['ALL', 'BPM', 'SPO2', 'PRESSURE'];
  const filterIcons = {
    ALL:      null,
    BPM:      { Icon: MaterialCommunityIcons, name: 'heart-pulse' },
    SPO2:     { Icon: MaterialCommunityIcons, name: 'lungs' },
    PRESSURE: { Icon: MaterialCommunityIcons, name: 'stethoscope' },
  };
  const filterLabels = { ALL: 'Todo', BPM: 'BPM', SPO2: 'SpO₂', PRESSURE: 'Presión' };

  const stats = {
    bpm:  readings.filter(r => r.type === 'BPM').length,
    spo2: readings.filter(r => r.type === 'SPO2').length,
    bp:   readings.filter(r => r.type === 'PRESSURE').length,
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color="#475569" />
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.title}>Mi Historial</Text>
            <Text style={styles.subtitle}>{readings.length} lecturas registradas</Text>
          </View>
        </View>
        {readings.length > 0 && (
          <TouchableOpacity onPress={onClear} style={styles.clearBtn}>
            <Ionicons name="trash-outline" size={16} color="#dc2626" />
            <Text style={styles.clearText}>Limpiar</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Resumen rápido */}
      {readings.length > 0 && (
        <View style={styles.summaryRow}>
          <View style={[styles.summaryChip, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
            <Text style={[styles.summaryNum, {color:'#dc2626'}]}>{stats.bpm}</Text>
            <Text style={[styles.summaryLabel, { color: '#dc2626' }]}>BPM</Text>
          </View>
          <View style={[styles.summaryChip, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
            <Text style={[styles.summaryNum, {color:'#2563eb'}]}>{stats.spo2}</Text>
            <Text style={[styles.summaryLabel, { color: '#2563eb' }]}>SpO₂</Text>
          </View>
          <View style={[styles.summaryChip, { backgroundColor: '#f5f3ff', borderColor: '#ddd6fe' }]}>
            <Text style={[styles.summaryNum, {color:'#7c3aed'}]}>{stats.bp}</Text>
            <Text style={[styles.summaryLabel, { color: '#7c3aed' }]}>Presión</Text>
          </View>
        </View>
      )}

      {/* Filtros */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => {
          const isActive = filter === f;
          const ico = filterIcons[f];
          return (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setFilter(f)}
            >
              {ico && <ico.Icon name={ico.name} size={14} color={isActive ? '#fff' : '#64748b'} />}
              <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                {filterLabels[f]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Lista */}
      {filtered.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="bar-chart-outline" size={64} color="#d4d4d8" />
          <Text style={styles.emptyTitle}>Sin registros</Text>
          <Text style={styles.emptyMsg}>
            {readings.length === 0
              ? 'Conecta tu WATCH 8 para comenzar a registrar lecturas'
              : 'No hay lecturas del tipo seleccionado'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={[...filtered].reverse()}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ReadingCard item={item} onViewMap={onViewMap} />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#2563eb"
              colors={['#2563eb']}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#f8fafc' },
  header:         { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, flexDirection: 'row',
                    justifyContent: 'space-between', alignItems: 'flex-start',
                    borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  title:          { fontSize: 22, fontWeight: '800', color: '#1e293b' },
  subtitle:       { fontSize: 14, color: '#64748b', marginTop: 3 },
  clearBtn:       { backgroundColor: '#fef2f2', paddingHorizontal: 14, paddingVertical: 8,
                    borderRadius: 20, borderWidth: 1, borderColor: '#fecaca',
                    flexDirection: 'row', alignItems: 'center', gap: 6 },
  clearText:      { color: '#dc2626', fontSize: 13, fontWeight: 'bold' },
  backBtn:        { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff',
                    justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#e2e8f0',
                    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },

  summaryRow:     { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 14, gap: 10 },
  summaryChip:    { flex: 1, borderRadius: 14, borderWidth: 1.5,
                    alignItems: 'center', paddingVertical: 12,
                    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  summaryNum:     { fontSize: 24, fontWeight: '900' },
  summaryLabel:   { fontSize: 12, fontWeight: 'bold', letterSpacing: 1, marginTop: 2 },

  filterRow:      { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 14, gap: 8 },
  filterChip:     { flex: 1, paddingVertical: 10, borderRadius: 20, backgroundColor: '#fff',
                    alignItems: 'center', borderWidth: 1.5, borderColor: '#e2e8f0',
                    flexDirection: 'row', justifyContent: 'center', gap: 4 },
  filterChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  filterText:     { color: '#64748b', fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: '#fff' },

  list:           { paddingHorizontal: 20, paddingBottom: 24 },

  card:           { backgroundColor: '#fff', borderRadius: 18, marginBottom: 14,
                    borderWidth: 1, borderColor: '#e2e8f0', borderLeftWidth: 4,
                    padding: 18, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  cardHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLeft:       { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  cardIconWrap:   { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  cardType:       { color: '#64748b', fontSize: 12, fontWeight: '600', letterSpacing: 0.3, marginBottom: 3 },
  cardValue:      { fontSize: 28, fontWeight: '900' },
  cardUnit:       { fontSize: 14, fontWeight: '600', color: '#94a3b8' },
  mapBtn:         { borderWidth: 1.5, borderRadius: 20,
                    paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center',
                    flexDirection: 'row', gap: 5 },
  mapBtnText:     { fontSize: 12, fontWeight: 'bold' },

  cardFooter:     { marginTop: 14, gap: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12 },
  footerItem:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerText:     { color: '#64748b', fontSize: 13, flex: 1 },

  emptyState:     { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyTitle:     { color: '#475569', fontSize: 22, fontWeight: '800', marginTop: 16, marginBottom: 8 },
  emptyMsg:       { color: '#94a3b8', fontSize: 15, textAlign: 'center', lineHeight: 24 },
});
