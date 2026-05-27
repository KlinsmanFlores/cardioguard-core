import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, StatusBar, FlatList, ActivityIndicator,
  TextInput, Alert, RefreshControl,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  getCaregiverPatients, getCaregiverAlerts,
  getPatientMetrics, getLastPatientLocation,
  linkCaregiverToPatient, markAlertRead,
  subscribeToAlerts, subscribeToPatientProfiles
} from '../services/supabaseService';

const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const METRIC_CFG = {
  BPM:      { Icon: MaterialCommunityIcons, iconName: 'heart-pulse', color: '#dc2626', label: 'BPM',     unit: 'bpm' },
  SPO2:     { Icon: MaterialCommunityIcons, iconName: 'lungs',       color: '#2563eb', label: 'SpO₂',    unit: '%' },
  PRESSURE: { Icon: MaterialCommunityIcons, iconName: 'stethoscope', color: '#7c3aed', label: 'Presión', unit: 'mmHg' },
};

// ─── Tarjeta de alerta ────────────────────────────────────────────────────────
const AlertCard = ({ alert, onDismiss }) => (
  <View style={styles.alertCard}>
    <View style={styles.alertLeft}>
      <View style={styles.alertIconWrap}>
        <Ionicons name="warning" size={24} color="#dc2626" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.alertPatient}>{alert.profiles?.full_name || 'Paciente'}</Text>
        <Text style={styles.alertMsg}>{alert.message}</Text>
        {alert.address && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
            <Ionicons name="location-outline" size={12} color="#94a3b8" />
            <Text style={styles.alertAddr} numberOfLines={1}>{alert.address}</Text>
          </View>
        )}
        <Text style={styles.alertTime}>{formatDate(alert.timestamp)}</Text>
      </View>
    </View>
    <TouchableOpacity style={styles.alertDismiss} onPress={() => onDismiss(alert.id)}>
      <Ionicons name="checkmark" size={20} color="#fff" />
    </TouchableOpacity>
  </View>
);

// ─── Tarjeta de métrica ───────────────────────────────────────────────────────
const MetricRow = ({ item }) => {
  const cfg = METRIC_CFG[item.type] || METRIC_CFG.BPM;
  const val = item.type === 'PRESSURE'
    ? `${item.sys}/${item.dia}`
    : item.bpm || item.oxygen;
  return (
    <View style={[styles.metricRow, { borderLeftColor: cfg.color }]}>
      <cfg.Icon name={cfg.iconName} size={22} color={cfg.color} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.metricRowVal, { color: cfg.color }]}>{val} {cfg.unit}</Text>
        <Text style={styles.metricRowTime}>{formatDate(item.timestamp)}</Text>
        {item.address && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Ionicons name="location-outline" size={12} color="#94a3b8" />
            <Text style={styles.metricRowAddr} numberOfLines={1}>{item.address}</Text>
          </View>
        )}
      </View>
    </View>
  );
};

// ─── Dashboard Cuidador ───────────────────────────────────────────────────────
export default function CaregiverScreen({ user, onLogout, onViewMap }) {
  const [patients, setPatients]     = useState([]);
  const [alerts, setAlerts]         = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [metrics, setMetrics]       = useState([]);
  const [lastLocation, setLastLocation] = useState(null);
  const [linkCode, setLinkCode]     = useState('');
  const [linking, setLinking]       = useState(false);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab]               = useState('alertas'); // 'alertas' | 'metricas' | 'vincular'

  const loadData = useCallback(async () => {
    const [pts, alts] = await Promise.all([
      getCaregiverPatients(user.userId),
      getCaregiverAlerts(user.userId),
    ]);
    setPatients(pts);
    setAlerts(alts);
    if (pts.length > 0 && !selectedPatient) setSelectedPatient(pts[0]);
    setLoading(false);
    setRefreshing(false);
  }, [user.userId, selectedPatient]);

  useEffect(() => { loadData(); }, []);

  // Suscripción en tiempo real a alertas y perfiles
  useEffect(() => {
    if (!patients.length) return;
    const ids = patients.map(p => p.id);
    const unsubAlerts = subscribeToAlerts(ids, (newAlert) => {
      setAlerts(prev => [newAlert, ...prev]);
    });
    const unsubProfiles = subscribeToPatientProfiles(ids, (updatedProfile) => {
      setPatients(prev => prev.map(p => p.id === updatedProfile.id ? { ...p, ...updatedProfile } : p));
      if (selectedPatient?.id === updatedProfile.id) {
        setSelectedPatient(prev => ({ ...prev, ...updatedProfile }));
      }
    });
    return () => {
      unsubAlerts();
      unsubProfiles();
    };
  }, [patients, selectedPatient]);

  // Cargar métricas del paciente seleccionado
  useEffect(() => {
    if (!selectedPatient) return;
    const load = async () => {
      const [m, loc] = await Promise.all([
        getPatientMetrics(selectedPatient.id, 50),
        getLastPatientLocation(selectedPatient.id),
      ]);
      setMetrics(m);
      setLastLocation(loc);
    };
    load();
  }, [selectedPatient]);

  const handleDismissAlert = async (alertId) => {
    await markAlertRead(alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  const handleLink = async () => {
    if (!linkCode.trim() || linkCode.length < 5) {
      Alert.alert('Código inválido', 'Ingresa un código de 6 caracteres.');
      return;
    }
    setLinking(true);
    const result = await linkCaregiverToPatient({ caregiverId: user.userId, linkCode });
    setLinking(false);
    if (result.success) {
      Alert.alert('✅ Vinculado', `Ahora monitoreas a: ${result.patient.full_name}`);
      setLinkCode('');
      loadData();
    } else {
      Alert.alert('Error', result.error);
    }
  };

  const onRefresh = () => { setRefreshing(true); loadData(); };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#10b981" />
          <Text style={styles.loadingText}>Cargando datos...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f0fdf4" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>CUIDADOR</Text>
          <Text style={styles.headerSub}>Hola, {user.full_name?.split(' ')[0]}</Text>
        </View>
        <TouchableOpacity onPress={onLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Salir</Text>
        </TouchableOpacity>
      </View>

      {/* Selector de paciente */}
      {patients.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.patientRow}>
          {patients.map(p => (
            <TouchableOpacity
              key={p.id}
              style={[styles.patientChip, selectedPatient?.id === p.id && styles.patientChipActive]}
              onPress={() => setSelectedPatient(p)}
            >
              <MaterialCommunityIcons name="account-heart" size={18} color={selectedPatient?.id === p.id ? '#059669' : '#94a3b8'} />
              <Text style={[styles.patientChipText, selectedPatient?.id === p.id && { color: '#059669' }]}>
                {p.full_name?.split(' ')[0]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Estado del Modo Automático y Ubicación */}
      {selectedPatient && (
        <View style={{ marginHorizontal: 20, marginBottom: 10, flexDirection: 'row', gap: 10 }}>
           
           {/* Chip Auto Mode */}
           <View style={{ flex: 1, backgroundColor: selectedPatient.is_auto_mode ? '#ecfdf5' : '#fef2f2', borderRadius: 16, borderWidth: 1.5, borderColor: selectedPatient.is_auto_mode ? '#a7f3d0' : '#fecaca', padding: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
             <Ionicons name={selectedPatient.is_auto_mode ? "timer-outline" : "hand-left-outline"} size={22} color={selectedPatient.is_auto_mode ? '#059669' : '#dc2626'} />
             <View>
               <Text style={{ color: '#64748b', fontSize: 13, fontWeight: '600' }}>Modo de Lectura</Text>
               <Text style={{ color: selectedPatient.is_auto_mode ? '#059669' : '#dc2626', fontSize: 14, fontWeight: '700', marginTop: 2 }}>
                 {selectedPatient.is_auto_mode ? 'Automático (3 min)' : 'Manual'}
               </Text>
             </View>
           </View>

           {/* Botón Mapa */}
           {lastLocation && (
             <TouchableOpacity style={{ flex: 1, backgroundColor: '#ecfdf5', borderRadius: 16, borderWidth: 1.5, borderColor: '#a7f3d0', padding: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}
               onPress={() => onViewMap({ location: { lat: lastLocation.lat, lng: lastLocation.lng, address: lastLocation.address } })}>
               <Ionicons name="location" size={22} color="#059669" />
               <View style={{ flex: 1 }}>
                 <Text style={{ color: '#64748b', fontSize: 13, fontWeight: '600' }}>Ubicación</Text>
                 <Text style={{ color: '#059669', fontSize: 14, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
                   Ver en mapa
                 </Text>
               </View>
             </TouchableOpacity>
           )}
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabRow}>
        {[
          { key: 'alertas',  label: `Alertas${alerts.length > 0 ? ` (${alerts.length})` : ''}`, icon: 'warning-outline' },
          { key: 'metricas', label: 'Lecturas', icon: 'bar-chart-outline' },
          { key: 'vincular', label: 'Vincular', icon: 'link-outline' },
        ].map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name={t.icon} size={14} color={tab === t.key ? '#fff' : '#64748b'} />
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
      >
        {/* ── ALERTAS ── */}
        {tab === 'alertas' && (
          alerts.length === 0
            ? <View style={styles.empty}>
                <Ionicons name="checkmark-circle" size={56} color="#22c55e" />
                <Text style={styles.emptyTitle}>Sin alertas activas</Text>
                <Text style={styles.emptyMsg}>Todo está bien. Recibirás notificaciones si hay valores fuera de rango.</Text>
              </View>
            : alerts.map(a => <AlertCard key={a.id} alert={a} onDismiss={handleDismissAlert} />)
        )}

        {/* ── MÉTRICAS ── */}
        {tab === 'metricas' && (
          !selectedPatient
            ? <View style={styles.empty}>
                <MaterialCommunityIcons name="account-heart-outline" size={56} color="#d4d4d8" />
                <Text style={styles.emptyTitle}>Sin paciente vinculado</Text>
                <Text style={styles.emptyMsg}>Ve a "Vincular" para conectar con el adulto mayor.</Text>
              </View>
            : metrics.length === 0
              ? <View style={styles.empty}>
                  <Ionicons name="bar-chart-outline" size={56} color="#d4d4d8" />
                  <Text style={styles.emptyTitle}>Sin lecturas aún</Text>
                  <Text style={styles.emptyMsg}>{selectedPatient.full_name} no ha registrado lecturas todavía.</Text>
                </View>
              : metrics.map(m => <MetricRow key={m.id} item={m} />)
        )}

        {/* ── VINCULAR ── */}
        {tab === 'vincular' && (
          <View style={styles.linkPanel}>
            <Text style={styles.linkTitle}>Vincular Adulto Mayor</Text>
            <Text style={styles.linkDesc}>
              Pide al adulto mayor que abra su app y te comparta su <Text style={{ color: '#3b82f6', fontWeight: 'bold' }}>código de 6 dígitos</Text>.
            </Text>
            <View style={styles.linkInputWrap}>
              <TextInput
                style={styles.linkInput}
                value={linkCode}
                onChangeText={t => setLinkCode(t.toUpperCase())}
                placeholder="Ej: AB12CD"
                placeholderTextColor="#475569"
                maxLength={6}
                autoCapitalize="characters"
              />
            </View>
            <TouchableOpacity
              style={[styles.linkBtn, linking && { opacity: 0.6 }]}
              onPress={handleLink}
              disabled={linking}
            >
              {linking
                ? <ActivityIndicator color="#fff" />
                : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="link" size={20} color="#fff" />
                    <Text style={styles.linkBtnText}>Vincular</Text>
                  </View>
              }
            </TouchableOpacity>

            {patients.length > 0 && (
              <View style={styles.linkedList}>
                <Text style={styles.linkedTitle}>Adultos mayores vinculados:</Text>
                {patients.map(p => (
                  <View key={p.id} style={styles.linkedItem}>
                    <MaterialCommunityIcons name="account-heart" size={22} color="#059669" />
                    <Text style={styles.linkedName}>{p.full_name}</Text>
                    <Text style={styles.linkedCode}>#{p.link_code}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#f0fdf4' },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText:  { color: '#64748b', fontSize: 16 },

  header:       { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 14, flexDirection: 'row',
                  justifyContent: 'space-between', alignItems: 'flex-start',
                  borderBottomWidth: 1, borderBottomColor: '#d1fae5' },
  title:        { fontSize: 22, fontWeight: '900', color: '#059669', letterSpacing: 2 },
  headerSub:    { color: '#64748b', fontSize: 14, marginTop: 4 },
  logoutBtn:    { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 9,
                  borderRadius: 20, borderWidth: 1.5, borderColor: '#e2e8f0',
                  shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  logoutText:   { color: '#64748b', fontSize: 13, fontWeight: '700' },

  patientRow:   { maxHeight: 68, paddingHorizontal: 20, paddingVertical: 12 },
  patientChip:  { flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: '#fff', borderRadius: 22, paddingHorizontal: 16,
                  paddingVertical: 10, marginRight: 10, borderWidth: 1.5, borderColor: '#e2e8f0',
                  shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  patientChipActive: { borderColor: '#059669', backgroundColor: '#ecfdf5' },
  patientChipIcon:   { fontSize: 18 },
  patientChipText:   { color: '#475569', fontSize: 15, fontWeight: '700' },

  locationBanner: { flexDirection: 'row', alignItems: 'center', gap: 12,
                    marginHorizontal: 20, marginBottom: 10, backgroundColor: '#ecfdf5',
                    borderRadius: 16, borderWidth: 1.5, borderColor: '#a7f3d0', padding: 16 },
  locationBannerIcon: { fontSize: 22 },
  locationBannerTitle: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  locationBannerAddr: { color: '#059669', fontSize: 14, fontWeight: '600', marginTop: 3 },
  locationBannerArrow: { fontSize: 22 },

  tabRow:       { flexDirection: 'row', marginHorizontal: 20, marginBottom: 14,
                  backgroundColor: '#e2e8f0', borderRadius: 16, padding: 4 },
  tab:          { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: 12 },
  tabActive:    { backgroundColor: '#059669', shadowColor: '#059669', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  tabText:      { color: '#64748b', fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: '#fff', fontWeight: '800' },

  content:      { paddingHorizontal: 20, paddingBottom: 30 },

  alertCard:    { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1.5,
                  borderColor: '#fecaca', padding: 16, marginBottom: 12,
                  flexDirection: 'row', alignItems: 'center',
                  shadowColor: '#ef4444', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  alertLeft:    { flex: 1, flexDirection: 'row', gap: 14 },
  alertIcon:    { fontSize: 28 },
  alertPatient: { color: '#dc2626', fontSize: 14, fontWeight: '800' },
  alertMsg:     { color: '#1e293b', fontSize: 16, fontWeight: '700', marginTop: 3 },
  alertAddr:    { color: '#64748b', fontSize: 13, marginTop: 4 },
  alertTime:    { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  alertDismiss: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#059669',
                  justifyContent: 'center', alignItems: 'center' },
  alertDismissText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },

  metricRow:    { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1,
                  borderColor: '#e2e8f0', borderLeftWidth: 4, padding: 16,
                  flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10,
                  shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  metricRowIcon:  { fontSize: 24 },
  metricRowVal:   { fontSize: 20, fontWeight: '900' },
  metricRowTime:  { color: '#64748b', fontSize: 13, marginTop: 3 },
  metricRowAddr:  { color: '#94a3b8', fontSize: 12, marginTop: 2 },

  linkPanel:    { gap: 16 },
  linkTitle:    { color: '#1e293b', fontSize: 22, fontWeight: '800' },
  linkDesc:     { color: '#64748b', fontSize: 15, lineHeight: 24 },
  linkInputWrap: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 2,
                   borderColor: '#e2e8f0', padding: 4 },
  linkInput:    { color: '#1e293b', fontSize: 32, fontWeight: '900', textAlign: 'center',
                  letterSpacing: 10, paddingVertical: 18 },
  linkBtn:      { backgroundColor: '#059669', paddingVertical: 18, borderRadius: 30, alignItems: 'center',
                  shadowColor: '#059669', shadowOpacity: 0.3, shadowRadius: 12, elevation: 4 },
  linkBtnText:  { color: '#fff', fontSize: 17, fontWeight: '800' },
  linkedList:   { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1.5,
                  borderColor: '#e2e8f0', padding: 18, gap: 12,
                  shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  linkedTitle:  { color: '#64748b', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  linkedItem:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  linkedIcon:   { fontSize: 22 },
  linkedName:   { color: '#1e293b', fontSize: 16, fontWeight: '700', flex: 1 },
  linkedCode:   { color: '#2563eb', fontSize: 14, fontWeight: '800' },

  empty:        { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyIcon:    { fontSize: 56 },
  emptyTitle:   { color: '#475569', fontSize: 20, fontWeight: '800' },
  emptyMsg:     { color: '#94a3b8', fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
