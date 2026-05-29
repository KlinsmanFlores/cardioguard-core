import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  StatusBar, Switch, Alert, Modal, Pressable, Dimensions, RefreshControl
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarBlank, Copy, CheckCircle, ShieldCheck, MapPin, House, ClockCounterClockwise, SignOut, Bluetooth, Info, Heart, Drop, Pulse, X, CaretRight, User } from 'phosphor-react-native';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';

import { smartQueue } from '../services/ble/smartQueue';
import { useBleStore } from '../store/bleStore';
import { subscribeToRemoteCommands, updateRemoteCommandStatus } from '../services/supabaseService';
import { supabase } from '../services/supabaseClient';
import { loadReadings } from '../services/storageService';

// Importar Design System
import { VitalCard, LineChartCard, ActionButton, SOSButton, WatchBadge, StatusBadge, COLORS } from '../components/ui';

const formatRelativeTime = (isoString) => {
  if (!isoString) return '';
  const diff = Math.floor((new Date() - new Date(isoString)) / 60000);
  if (diff < 1) return 'Hace un momento';
  if (diff < 60) return `Hace ${diff} min`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `Hace ${hours} h`;
  return `Hace ${Math.floor(hours / 24)} d`;
};

export default function PatientDashboard({ authUser, onLogout, setGlobalScreen, setMapReading, readings, setReadings, currentLocation }) {
  const [isAutoMode, setIsAutoMode] = useState(smartQueue.autoLoopActive);
  const [showInfo, setShowInfo] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isConnected = useBleStore(state => state.isConnected);
  const battery = useBleStore(state => state.battery);
  const startScan = useBleStore(state => state.startScan);
  const insets = useSafeAreaInsets();

  const onRefresh = async () => {
    setRefreshing(true);
    const freshReadings = await loadReadings();
    if (typeof setReadings === 'function') {
      setReadings(freshReadings);
    }
    if (!isConnected && startScan) {
      startScan();
    }
    setRefreshing(false);
  };
  
  // Realtime stats from store
  const currentBpm = useBleStore(state => state.bpm);
  const currentSpo2 = useBleStore(state => state.spo2);
  const currentSys = useBleStore(state => state.pressure.sys);
  const currentDia = useBleStore(state => state.pressure.dia);
  const lastMetricEvent = useBleStore(state => state.lastMetricEvent);

  // Escuchar nuevos datos BLE para actualizar el gráfico en tiempo real
  useEffect(() => {
    if (lastMetricEvent) {
      // Pequeño delay para asegurar que el storage terminó de escribir
      setTimeout(async () => {
        const freshReadings = await loadReadings();
        if (typeof setReadings === 'function') {
          setReadings(freshReadings);
        }
      }, 500);
    }
  }, [lastMetricEvent]);

  useEffect(() => {
    if (!authUser?.userId) return;
    const unsub = subscribeToRemoteCommands(authUser.userId, async (cmd) => {
      const store = useBleStore.getState();
      let taskFn;
      if (cmd.command_type === 'BPM') taskFn = store.triggerAppBPM;
      else if (cmd.command_type === 'SpO2') taskFn = store.triggerAppSpO2;
      else if (cmd.command_type === 'Presión') taskFn = store.triggerAppPressure;

      if (taskFn) {
        Toast.show({ type: 'info', text1: 'Petición Médica Recibida', text2: `Midiendo ${cmd.command_type}...` });
        const wrappedTask = async () => {
          await taskFn();
          await new Promise(r => setTimeout(r, 2000));
          await updateRemoteCommandStatus(cmd.id, 'completed');
        };
        smartQueue.enqueueTask(`Remoto-${cmd.command_type}`, wrappedTask, true);
      }
    });
    return () => unsub();
  }, [authUser?.userId]);

  // Sincronizar el estado del Switch con el motor de smartQueue al montar la pantalla
  useEffect(() => {
    setIsAutoMode(smartQueue.autoLoopActive);
  }, []);

  // Cargar preferencia persistida del usuario de Supabase si está guardada
  useEffect(() => {
    if (authUser) {
      const active = authUser.auto_mode_active || false;
      setIsAutoMode(active);
      if (active !== smartQueue.autoLoopActive) {
        smartQueue.setAutoMode(active);
      }
    }
  }, [authUser]);

  useEffect(() => {
    if (battery !== null && authUser?.userId) {
      supabase.from('profiles').update({ watch_battery_level: battery }).eq('id', authUser.userId).then();
    }
  }, [battery, authUser?.userId]);

  const toggleAutoMode = async (value) => {
    setIsAutoMode(value);
    smartQueue.setAutoMode(value);
    if (authUser?.userId) {
      await supabase.from('profiles').update({ auto_mode_active: value }).eq('id', authUser.userId);
      // Mantener la sesión local consistente
      authUser.auto_mode_active = value;
    }
    Toast.show({
      type: value ? 'success' : 'info',
      text1: value ? 'Vigilancia Activa' : 'Vigilancia Pausada'
    });
  };

  const handleManualMeasurement = (type) => {
    const store = useBleStore.getState();
    if (!store.isConnected) {
      Toast.show({ type: 'error', text1: 'Reloj desconectado' });
      return;
    }
    let taskFn;
    if (type === 'Pulso') taskFn = store.triggerAppBPM;
    else if (type === 'Oxígeno') taskFn = store.triggerAppSpO2;
    else if (type === 'Presión') taskFn = store.triggerAppPressure;

    if (!taskFn) return;
    Toast.show({ type: 'info', text1: `Midiendo ${type}...` });
    smartQueue.enqueueTask(`Manual-${type}`, taskFn, true);
  };

  const copyCode = async () => {
    if (authUser?.link_code) {
      await Clipboard.setStringAsync(authUser.link_code);
      Toast.show({ type: 'success', text1: 'Código copiado' });
    }
  };

  const fireSOS = () => {
    Alert.alert("Emergencia SOS", "Enviando alerta a tus cuidadores...");
    // Future: implement Supabase insert for SOS
  };

  const _d = new Date();
  const _days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const _months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const todayStr = `${_days[_d.getDay()]}, ${_d.getDate()} ${_months[_d.getMonth()]}`;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#EEF2FF" />
      
      {/* ── HEADER ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hola, {authUser?.full_name?.split(' ')[0] || 'Usuario'}</Text>
          <View style={styles.dateWrap}>
            <CalendarBlank size={12} color="#6366F1" weight="regular" />
            <Text style={styles.dateText}>Hoy, {todayStr}</Text>
          </View>
        </View>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
          <TouchableOpacity onPress={!isConnected ? startScan : undefined}>
            <WatchBadge isConnected={isConnected} battery={battery} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setGlobalScreen('PROFILE')} style={styles.avatarBtn}>
            <Text style={styles.avatarText}>{authUser?.full_name?.substring(0,2) || 'AM'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── VITALS STRIP ── */}
      <View style={styles.vitalsStrip}>
        <VitalCard type="Pulso" value={currentBpm || '--'} unit="bpm" />
        <VitalCard type="Oxígeno" value={currentSpo2 ? `${currentSpo2}` : '--'} unit="%" />
        <VitalCard type="Presión" value={currentSys && currentDia ? `${currentSys}/${currentDia}` : '--/--'} unit="mmHg" />
      </View>

      <ScrollView 
        contentContainerStyle={styles.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#4F46E5']}
            tintColor="#4F46E5"
          />
        }
      >
        
        {/* BOTÓN EXPLÍCITO DE CONEXIÓN */}
        {!isConnected && (
          <TouchableOpacity style={styles.connectCard} onPress={startScan}>
            <View style={styles.connectIconWrap}>
              <Bluetooth size={24} color="#FFF" weight="regular" />
            </View>
            <View>
              <Text style={styles.connectTitle}>Reloj no conectado</Text>
              <Text style={styles.connectSub}>Toca aquí para buscar y conectar tu P28 Plus</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* 24/7 MODE */}
        <View style={styles.surveillanceCard}>
          <View style={styles.surveillanceLeft}>
            <View style={styles.survIconWrap}>
              <ShieldCheck size={24} color="#10B981" weight="fill" />
            </View>
            <View>
              <Text style={styles.survTitle}>Vigilancia 24/7</Text>
              {isAutoMode ? (
                <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 4}}>
                  <CheckCircle size={10} color="#10B981" weight="fill" />
                  <Text style={styles.survActive}> Activa · cada 5 min</Text>
                </View>
              ) : (
                <Text style={styles.survInactive}>Pausada</Text>
              )}
            </View>
          </View>
          <Switch
            value={isAutoMode}
            onValueChange={toggleAutoMode}
            trackColor={{ false: '#E0E7FF', true: '#D1FAE5' }}
            thumbColor={isAutoMode ? '#10B981' : '#9CA3AF'}
          />
        </View>

        {/* MEDIR AHORA */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={[styles.sectionLabel, { marginBottom: 0 }]}>MEDIR AHORA</Text>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={() => setShowInfo(true)}>
            <Info size={14} color="#6366F1" weight="bold" />
            <Text style={{ fontSize: 10, color: '#6366F1', fontWeight: '700' }}>Info. Umbrales</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.actionsGrid}>
          <ActionButton type="Pulso" onPress={() => handleManualMeasurement('Pulso')} />
          <ActionButton type="Oxígeno" onPress={() => handleManualMeasurement('Oxígeno')} />
          <ActionButton type="Presión" onPress={() => handleManualMeasurement('Presión')} />
        </View>

        {/* GPS UBICACIÓN */}
        {/* Se accede mediante el menú inferior (Bottom Nav) -> 'GPS' */}

        {/* CÓDIGO MÉDICO */}
        <View style={styles.codeCard}>
          <View>
            <Text style={styles.codeLabel}>Código médico</Text>
            <Text style={styles.codeValue}>{authUser?.link_code || '---'}</Text>
          </View>
          <TouchableOpacity style={styles.copyBtn} onPress={copyCode}>
            <Copy size={20} color="#4338CA" weight="regular" />
          </TouchableOpacity>
        </View>

        {/* SOS */}
        <View style={{ marginTop: 8 }}>
          <SOSButton onPress={fireSOS} />
        </View>

        <View style={{height: 40}} />
      </ScrollView>

      {/* ── MODAL DE UMBRALES ── */}
      <Modal visible={showInfo} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                <Info size={20} color="#4F46E5" weight="fill" />
                <Text style={styles.modalTitle}>Umbrales Médicos</Text>
              </View>
              <TouchableOpacity onPress={() => setShowInfo(false)} style={{padding: 4}}>
                <X size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.thresholdItem}>
                <View style={[styles.threshIconWrap, {backgroundColor: '#FEF2F2'}]}><Heart size={16} color="#DC2626" weight="fill" /></View>
                <View style={{flex: 1}}>
                  <Text style={styles.threshName}>Pulso (BPM)</Text>
                  <Text style={styles.threshDesc}><Text style={{color:'#10B981'}}>Normal:</Text> 60 - 100 bpm</Text>
                  <Text style={styles.threshDesc}><Text style={{color:'#92400E'}}>Elevado:</Text> + de 100 bpm</Text>
                  <Text style={styles.threshDesc}><Text style={{color:'#92400E'}}>Bajo:</Text> - de 60 bpm</Text>
                </View>
              </View>

              <View style={styles.thresholdItem}>
                <View style={[styles.threshIconWrap, {backgroundColor: '#EFF6FF'}]}><Drop size={16} color="#2563EB" weight="fill" /></View>
                <View style={{flex: 1}}>
                  <Text style={styles.threshName}>Oxígeno (SpO2)</Text>
                  <Text style={styles.threshDesc}><Text style={{color:'#10B981'}}>Normal:</Text> 95% - 100%</Text>
                  <Text style={styles.threshDesc}><Text style={{color:'#92400E'}}>Advertencia:</Text> - de 95%</Text>
                </View>
              </View>

              <View style={styles.thresholdItem}>
                <View style={[styles.threshIconWrap, {backgroundColor: '#F5F3FF'}]}><Pulse size={16} color="#7C3AED" weight="fill" /></View>
                <View style={{flex: 1}}>
                  <Text style={styles.threshName}>Presión Arterial</Text>
                  <Text style={styles.threshDesc}><Text style={{color:'#10B981'}}>Normal:</Text> Sistólica -130 y Diastólica -80</Text>
                  <Text style={styles.threshDesc}><Text style={{color:'#92400E'}}>Elevado:</Text> Sistólica +130 o Diastólica +80</Text>
                  <Text style={styles.threshDesc}><Text style={{color:'#92400E'}}>Bajo:</Text> Sistólica - de 90</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowInfo(false)}>
                <Text style={styles.modalCloseText}>Entendido</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── BOTTOM NAV ── */}
      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity style={styles.navItem} onPress={() => setGlobalScreen('HOME')}>
          <House size={22} color="#4F46E5" weight="fill" />
          <Text style={[styles.navText, { color: '#4F46E5' }]}>Inicio</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setGlobalScreen('HISTORY')}>
          <ClockCounterClockwise size={22} color="#9CA3AF" weight="regular" />
          <Text style={styles.navText}>Historial</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => {
          setMapReading(null); // Limpiar reading anterior
          setGlobalScreen('MAP');
        }}>
          <MapPin size={22} color="#9CA3AF" weight="regular" />
          <Text style={styles.navText}>GPS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => setGlobalScreen('PROFILE')}>
          <User size={22} color="#9CA3AF" weight="regular" />
          <Text style={styles.navText}>Perfil</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FF' },
  header: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', 
    backgroundColor: '#EEF2FF', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16,
    borderBottomWidth: 0.5, borderColor: '#C7D2FE'
  },
  greeting: { fontSize: 15, fontWeight: '800', color: '#1E3A8A' },
  dateWrap: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  dateText: { fontSize: 9, color: '#6366F1', fontWeight: '600', textTransform: 'capitalize' },
  vitalsStrip: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 16, backgroundColor: '#F5F7FF',
    justifyContent: 'space-between'
  },
  content: { paddingHorizontal: 20, paddingBottom: 20 },
  surveillanceCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#D1FAE5',
    padding: 16, marginBottom: 24
  },
  surveillanceLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  survIconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#D1FAE5', justifyContent: 'center', alignItems: 'center' },
  survTitle: { fontSize: 12, fontWeight: '700', color: '#1E3A8A' },
  survActive: { fontSize: 9, color: '#065F46', fontWeight: '600' },
  survInactive: { fontSize: 9, color: '#9CA3AF', fontWeight: '600', marginTop: 4 },
  sectionLabel: { fontSize: 9, color: '#9CA3AF', fontWeight: '800', marginBottom: 12, marginLeft: 4, textTransform: 'uppercase' },
  actionsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  codeCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#EEF2FF', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 14,
    marginBottom: 24
  },
  codeLabel: { fontSize: 9, color: '#818CF8', fontWeight: '700', marginBottom: 2 },
  codeValue: { fontSize: 15, fontWeight: '900', color: '#4338CA', letterSpacing: 4 },
  copyBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#C7D2FE', justifyContent: 'center', alignItems: 'center' },
  avatarBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.blueBg, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.primary },
  avatarText: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  connectCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4F46E5', padding: 16, borderRadius: 12, marginBottom: 16, gap: 12 },
  connectIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  connectTitle: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  connectSub: { color: '#E0E7FF', fontSize: 10, marginTop: 2, paddingRight: 40 },
  bottomNav: {
    flexDirection: 'row', backgroundColor: '#FFF', paddingVertical: 12, 
    borderTopWidth: 0.5, borderColor: '#E0E7FF', 
    justifyContent: 'space-around', alignItems: 'center'
  },
  navItem: { alignItems: 'center', flex: 1, gap: 4 },
  navText: { fontSize: 8, color: '#9CA3AF', fontWeight: '600' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', width: '100%', borderRadius: 20, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#1E3A8A' },
  thresholdItem: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 0.5, borderColor: '#E5E7EB', gap: 12 },
  threshIconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  threshName: { fontSize: 13, fontWeight: '800', color: '#1F2937', marginBottom: 4 },
  threshDesc: { fontSize: 11, color: '#6B7280', fontWeight: '600', marginBottom: 2 },
  modalCloseBtn: { backgroundColor: '#4F46E5', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  modalCloseText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  
  gpsCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#C7D2FE', padding: 16, marginBottom: 20, shadowColor: '#4F46E5', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  gpsIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  gpsTitle: { fontSize: 13, fontWeight: '800', color: '#1E3A8A', marginBottom: 2 },
  gpsAddress: { fontSize: 11, color: '#6B7280', fontWeight: '600', marginBottom: 4 },
  gpsTime: { fontSize: 9, color: '#4F46E5', fontWeight: '700' },
  gpsArrow: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' }
});
