import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, TextInput, Alert, ActivityIndicator, BackHandler, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { BatteryWarning, SignOut, MagnifyingGlass, ShieldPlus, MapPin, CaretRight, House, ClockCounterClockwise, User } from 'phosphor-react-native';

import { supabase } from '../services/supabaseClient';
import { requestRemoteCommand, getCaregiverPatients, linkCaregiverToPatient, getLastPatientLocation } from '../services/supabaseService';

// Importar Design System
import { PatientCard, LineChartCard, ActionButton, AlertFeedItem, COLORS } from '../components/ui';
import HistoryScreen from './HistoryScreen';
import ProfileScreen from './ProfileScreen';

const MOCK_PULSE_DATA = [
  { value: 70 }, { value: 72 }, { value: 68 }, { value: 75 }, { value: 73 }, { value: 76 }, { value: 72 }
];

const formatRelativeTime = (isoString) => {
  if (!isoString) return '';
  const diff = Math.floor((new Date() - new Date(isoString)) / 60000);
  if (diff < 1) return 'Hace un momento';
  if (diff < 60) return `Hace ${diff} min`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `Hace ${hours} h`;
  return `Hace ${Math.floor(hours / 24)} d`;
};

export default function CaregiverScreen({ user, onLogout, onViewMap }) {
  const [patient, setPatient] = useState(null);
  const [activeTab, setActiveTab] = useState('Control');
  const [recentReadings, setRecentReadings] = useState([]);
  const [watchBattery, setWatchBattery] = useState(100);
  const [patientLocation, setPatientLocation] = useState(null);
  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  // Link Patient State
  const [linkCode, setLinkCode] = useState('');
  const [linking, setLinking] = useState(false);

  const insets = useSafeAreaInsets();

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPatientData();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchPatientData();
    const interval = setInterval(fetchPatientData, 10000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    const backAction = () => {
      if (activeTab !== 'Control') {
        setActiveTab('Control');
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, [activeTab]);

  const fetchPatientData = async () => {
    try {
      // 1. Obtener pacientes vinculados desde care_links
      const patients = await getCaregiverPatients(user.userId);
      
      if (patients && patients.length > 0) {
        // Tomamos el primer paciente por ahora
        const p = patients[0];
        setPatient(p);
        
        if (p.watch_battery_level !== undefined && p.watch_battery_level !== null) {
          setWatchBattery(p.watch_battery_level);
        }
        
        // 2. Obtener métricas recientes (aumentado para historial profundo)
        const { data: readingsData } = await supabase
          .from('heart_metrics')
          .select('*')
          .eq('user_id', p.id)
          .order('timestamp', { ascending: false })
          .limit(150);
          
        if (readingsData) {
          setRecentReadings(readingsData);
        }

        // Batería (requiere un fetch extra o se manda desde heart_metrics, 
        // pero por ahora lo sacamos del perfil si estuviera, o mockeamos)
        // En profiles ya trajimos algo en getCaregiverPatients si le añadimos watch_battery_level

        // 3. Obtener ubicación de GPS más reciente
        const loc = await getLastPatientLocation(p.id);
        if (loc) {
          setPatientLocation(loc);
        } else {
          setPatientLocation(null);
        }
      } else {
        setPatient(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleLinkPatient = async () => {
    if (!linkCode.trim()) {
      Alert.alert('Error', 'Ingresa el PIN de 6 dígitos del paciente.');
      return;
    }
    setLinking(true);
    const result = await linkCaregiverToPatient({ caregiverId: user.userId, linkCode });
    setLinking(false);

    if (result.success) {
      Toast.show({ type: 'success', text1: 'Paciente vinculado', text2: `Ahora monitoreas a ${result.patient.full_name}` });
      setLinkCode('');
      setLoading(true);
      fetchPatientData();
    } else {
      Alert.alert('Error de Vinculación', result.error);
    }
  };

  const handleRemoteMeasurement = async (type) => {
    if (!patient?.id) return;
    Toast.show({ type: 'info', text1: 'Enviando solicitud al reloj...' });
    const res = await requestRemoteCommand({ patientId: patient.id, caregiverId: user.userId, commandType: type });
    if (res.success) {
      Toast.show({ type: 'success', text1: 'Comando enviado', text2: 'El reloj despertará en breve.' });
    } else {
      Toast.show({ type: 'error', text1: 'Error al solicitar', text2: res.error });
    }
  };

  const formatRelativeTime = (dateStr) => {
    if (!dateStr) return 'Reciente';
    const mins = Math.floor((new Date() - new Date(dateStr)) / 60000);
    if (mins < 1) return 'hace un momento';
    if (mins < 60) return `hace ${mins} min`;
    return `hace ${Math.floor(mins/60)} h`;
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ marginTop: 12, color: COLORS.textMuted }}>Cargando datos...</Text>
      </SafeAreaView>
    );
  }

  // Si no hay paciente vinculado, mostramos la UI de vinculación
  if (!patient) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
        <View style={styles.header}>
           <Text style={styles.headerTitle}>Modo Cuidador</Text>
           <View style={styles.cgAvatar}>
             <Text style={{fontSize: 12, fontWeight: '800', color: COLORS.primary}}>
               {user.full_name?.substring(0,2) || 'CG'}
             </Text>
           </View>
        </View>
        <View style={styles.linkContainer}>
          <ShieldPlus size={64} color={COLORS.primary} weight="fill" style={{ marginBottom: 16 }} />
          <Text style={styles.linkTitle}>Aún no monitoreas a nadie</Text>
          <Text style={styles.linkSub}>
            Pídele al Adulto Mayor que te comparta su PIN Médico de 6 dígitos que aparece en su pantalla de inicio.
          </Text>
          
          <View style={styles.inputWrap}>
            <MagnifyingGlass size={20} color={COLORS.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="Ej: ABC123"
              value={linkCode}
              onChangeText={setLinkCode}
              autoCapitalize="characters"
              maxLength={6}
            />
          </View>

          <TouchableOpacity style={[styles.linkBtn, linking && { opacity: 0.7 }]} onPress={handleLinkPatient} disabled={linking}>
            {linking ? <ActivityIndicator color="#fff" /> : <Text style={styles.linkBtnText}>Vincular Paciente</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Encontrar últimas métricas desde el historial unificado (heart_metrics)
  const lastBpm = recentReadings.find(r => r.type === 'BPM')?.bpm;
  const lastSpo2 = recentReadings.find(r => r.type === 'SPO2')?.oxygen;
  const lastPressSys = recentReadings.find(r => r.type === 'PRESSURE')?.sys;
  const lastPressDia = recentReadings.find(r => r.type === 'PRESSURE')?.dia;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.header} />
      
      {/* ── HEADER ── */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={styles.cgAvatar}>
            <Text style={{fontSize: 12, fontWeight: '800', color: COLORS.primary}}>
              {user.full_name?.substring(0,2) || 'CG'}
            </Text>
          </View>
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Monitoreo · {patient.full_name?.split(' ')[0]}</Text>
            <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 2}}>
              <View style={styles.onlineDot} />
              <Text style={styles.headerSub}>En línea · hace 1 min</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── ALERTA DE BATERÍA ── */}
      {watchBattery < 20 && (
        <View style={styles.batteryAlert}>
          <BatteryWarning size={16} color={COLORS.red} weight="fill" />
          <Text style={styles.batteryText}>Batería del reloj: {watchBattery}% — cargar pronto</Text>
        </View>
      )}

      {/* TABS ELIMINADOS a favor del BOTTOM NAV */}

      {/* ── BODY ── */}
      {activeTab === 'Control' ? (
        <ScrollView 
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) }]} 
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
        >
          <PatientCard 
            name={patient.full_name} 
            age="72" 
            isAutoMode={patient.is_auto_mode || false}
            bpm={lastBpm} spo2={lastSpo2} pressure={lastPressSys ? `${lastPressSys}/${lastPressDia}` : null}
            battery={watchBattery}
          />

          {/* GPS CARD ELIMINADO - Movido al Bottom Nav */}

          <Text style={styles.sectionTitle}>Solicitar medición remota</Text>
          <View style={styles.actionsGrid}>
            <ActionButton type="Pulso" onPress={() => handleRemoteMeasurement('BPM')} />
            <ActionButton type="Oxígeno" onPress={() => handleRemoteMeasurement('SpO2')} />
            <ActionButton type="Presión" onPress={() => handleRemoteMeasurement('Presión')} />
          </View>
          <View style={{height: 40}}/>
        </ScrollView>
      ) : activeTab === 'Historial' ? (
        <View style={{ flex: 1, paddingBottom: Math.max(insets.bottom, 20) }}>
          <HistoryScreen readings={recentReadings} hideHeader={true} onRefresh={onRefresh} />
        </View>
      ) : (
        <View style={{ flex: 1, paddingBottom: Math.max(insets.bottom, 20) }}>
          <ProfileScreen
            user={user}
            onBack={() => setActiveTab('Control')}
            onLogout={onLogout}
          />
        </View>
      )}

      {/* ── BOTTOM NAV ── */}
      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('Control')}>
          <House size={22} color={activeTab === 'Control' ? COLORS.primary : COLORS.textMuted} weight={activeTab === 'Control' ? 'fill' : 'regular'} />
          <Text style={[styles.navText, { color: activeTab === 'Control' ? COLORS.primary : COLORS.textMuted }]}>Inicio</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('Historial')}>
          <ClockCounterClockwise size={22} color={activeTab === 'Historial' ? COLORS.primary : COLORS.textMuted} weight={activeTab === 'Historial' ? 'fill' : 'regular'} />
          <Text style={[styles.navText, { color: activeTab === 'Historial' ? COLORS.primary : COLORS.textMuted }]}>Historial</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => onViewMap({ location: patientLocation, patientId: patient.id })}>
          <MapPin size={22} color={COLORS.textMuted} weight="regular" />
          <Text style={styles.navText}>GPS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('Perfil')}>
          <User size={22} color={activeTab === 'Perfil' ? COLORS.primary : COLORS.textMuted} weight={activeTab === 'Perfil' ? 'fill' : 'regular'} />
          <Text style={[styles.navText, { color: activeTab === 'Perfil' ? COLORS.primary : COLORS.textMuted }]}>Perfil</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.header, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
    borderBottomWidth: 0.5, borderColor: COLORS.borderDark
  },
  cgAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 13, fontWeight: '800', color: COLORS.textDark },
  headerSub: { fontSize: 9, color: COLORS.textMuted, fontWeight: '600', marginLeft: 4 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.green },
  batteryAlert: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.redBg, 
    paddingVertical: 6, borderBottomWidth: 0.5, borderColor: COLORS.redBorder, gap: 6 
  },
  batteryText: { fontSize: 9, fontWeight: '700', color: COLORS.red, textTransform: 'uppercase' },
  tabsRow: { flexDirection: 'row', backgroundColor: '#FFF', borderBottomWidth: 0.5, borderColor: COLORS.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderColor: 'transparent' },
  tabActive: { borderColor: COLORS.primary },
  tabText: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted },
  tabTextActive: { color: COLORS.primary, fontWeight: '800' },
  content: { padding: 20 },
  sectionTitle: { fontSize: 9, color: COLORS.textMuted, fontWeight: '800', marginBottom: 12, marginLeft: 4, textTransform: 'uppercase' },
  actionsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  feedBox: { backgroundColor: '#FFF', borderRadius: 12, borderWidth: 0.5, borderColor: COLORS.border, paddingHorizontal: 16 },
  logoutBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', borderWidth: 0.5, borderColor: '#FECACA' },

  // Link UI styles
  linkContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  linkTitle: { fontSize: 20, fontWeight: '900', color: COLORS.textDark, marginBottom: 12, textAlign: 'center' },
  linkSub: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 16, width: '100%', marginBottom: 24 },
  input: { flex: 1, paddingVertical: 18, fontSize: 18, fontWeight: '800', color: COLORS.textDark, textAlign: 'center', letterSpacing: 2 },
  linkBtn: { backgroundColor: COLORS.primary, width: '100%', paddingVertical: 18, borderRadius: 30, alignItems: 'center', shadowColor: COLORS.primary, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  linkBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

  gpsCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: COLORS.borderDark, padding: 16, marginBottom: 20, shadowColor: COLORS.primary, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  gpsIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  gpsTitle: { fontSize: 13, fontWeight: '800', color: COLORS.textDark, marginBottom: 2 },
  gpsAddress: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600', marginBottom: 4 },
  gpsTime: { fontSize: 9, color: COLORS.primary, fontWeight: '700' },
  gpsArrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.blueBg, justifyContent: 'center', alignItems: 'center' },
  
  bottomNav: {
    flexDirection: 'row', backgroundColor: '#FFF', paddingVertical: 12, 
    borderTopWidth: 0.5, borderColor: COLORS.border, 
    justifyContent: 'space-around', alignItems: 'center'
  },
  navItem: { alignItems: 'center', flex: 1, gap: 4 },
  navText: { fontSize: 8, color: COLORS.textMuted, fontWeight: '600' }
});
