import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity,
  Animated, ScrollView, TextInput, Alert
} from 'react-native';
import { Clipboard } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import {
  saveBpmReading, saveSpo2Reading, savePressureReading
} from '../services/storageService';
import {
  requestLocationPermission, getCurrentLocation,
  startLocationWatch, stopLocationWatch,
} from '../services/locationService';
import { saveMetricToSupabase } from '../services/supabaseService';
import { checkThresholdAndNotify } from '../services/notificationService';

// --- NUEVA ARQUITECTURA: FASE 1 & 2 ---
import { useBleStore } from '../store/bleStore';
import { bleQueue } from '../services/ble/bleQueue';

export default function PatientDashboard({ authUser, onLogout, setGlobalScreen, setMapReading, readings, setReadings }) {
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationReady, setLocationReady]     = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const currentLocRef = useRef(null);
  useEffect(() => { currentLocRef.current = currentLocation; }, [currentLocation]);

  // Consumimos el estado y las acciones del motor BLE desde el store global
  const { 
    isScanning, isConnected, statusMsg, battery, 
    bpm, spo2: oxygen, pressure, lastMetricEvent,
    isBluetoothBusy, deviceId, rawLogs, clearRawLogs,
    resolvedHealthWriteService, resolvedHealthWrite,
    startScan, disconnectDevice, triggerAppBPM, triggerAppSpO2, triggerAppPressure
  } = useBleStore();

  // Inicialización de ubicación
  useEffect(() => {
    const initLocation = async () => {
      const gpsGranted = await requestLocationPermission();
      if (gpsGranted) {
        const loc = await getCurrentLocation();
        if (loc) {
          setCurrentLocation(loc);
          setLocationReady(true);
        }
        startLocationWatch((newLoc) => setCurrentLocation(newLoc));
      }
    };
    initLocation();
    
    return () => stopLocationWatch();
  }, []);

  // Animación del corazón reactiva al estado global
  useEffect(() => {
    if (bpm > 0) {
      const dur = 60000 / bpm;
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.12, duration: dur * 0.3, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: dur * 0.7, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [bpm]);

  // Escuchar eventos de medición pura del Store para guardarlos en DB
  // (Separación de responsabilidad: UI guarda, BLE solo mide)
  const lastEventTimeRef = useRef(0);
  useEffect(() => {
    if (!lastMetricEvent || lastMetricEvent.timestamp === lastEventTimeRef.current) return;
    lastEventTimeRef.current = lastMetricEvent.timestamp;

    const processMetric = async () => {
      const loc = currentLocRef.current;
      const { type, value } = lastMetricEvent;

      if (type === 'PRESSURE') {
        const { sys, dia } = value;
        useBleStore.getState().setStatusMsg(`Última BP: ${sys}/${dia} mmHg`);
        const saved = await savePressureReading(sys, dia, loc);
        if (saved) setReadings(prev => [...prev, saved]);
        await checkThresholdAndNotify('PRESSURE', { sys, dia }, loc);
        if (authUser?.userId) await saveMetricToSupabase({ userId: authUser.userId, type: 'PRESSURE', value: { sys, dia }, location: loc });
      } 
      else if (type === 'SPO2') {
        const saved = await saveSpo2Reading(value, loc);
        if (saved) setReadings(prev => [...prev, saved]);
        await checkThresholdAndNotify('SPO2', value, loc);
        if (authUser?.userId) await saveMetricToSupabase({ userId: authUser.userId, type: 'SPO2', value, location: loc });
      } 
      else if (type === 'BPM') {
        const saved = await saveBpmReading(value, loc);
        if (saved) setReadings(prev => [...prev, saved]);
        await checkThresholdAndNotify('BPM', value, loc);
        if (authUser?.userId) await saveMetricToSupabase({ userId: authUser.userId, type: 'BPM', value, location: loc });
      }
    };

    processMetric();
  }, [lastMetricEvent, authUser, setReadings]);

  const [sendingHex, setSendingHex] = useState(false);
  const [isCopyMode, setIsCopyMode] = useState(false);
  const consoleScrollRef = useRef(null);

  const handleCopyToClipboard = async () => {
    if (rawLogs.length === 0) {
      Alert.alert('Terminal Vacía', 'No hay logs para copiar.');
      return;
    }
    try {
      const fullLogText = rawLogs.join('\n');
      Clipboard.setString(fullLogText);
      Alert.alert('Copiado', '¡Se han copiado todos los logs al portapapeles con éxito!');
    } catch (err) {
      console.error('Error al copiar al portapapeles:', err);
      Alert.alert('Error', 'No se pudo copiar el texto automáticamente.');
    }
  };

  const handleSendHexStep = async (stepName, hexStr) => {
    if (!isConnected || !deviceId) {
      Alert.alert('Error', 'El reloj inteligente no está conectado.');
      return;
    }
    
    let cleanHex = hexStr.replace(/[^0-9a-fA-F]/g, '');
    let bytes = [];
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes.push(parseInt(cleanHex.slice(i, i + 2), 16));
    }

    setSendingHex(true);
    const timeStr = new Date().toLocaleTimeString();
    useBleStore.getState().addRawLog(`[${timeStr}] 📤 TX (${stepName}) -> [${bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('-')}]`);

    try {
      const sUUID = resolvedHealthWriteService || '0000feea-0000-1000-8000-00805f9b34fb';
      const cUUID = resolvedHealthWrite || '0000fee2-0000-1000-8000-00805f9b34fb';

      if (cUUID.toLowerCase().includes('fee2') || cUUID.toLowerCase().includes('fea2')) {
        await bleQueue.writeWithoutResponse(deviceId, sUUID, cUUID, bytes);
        console.log(`[BLE DASH LAB] Paso enviado (WithoutResponse): ${JSON.stringify(bytes)}`);
      } else {
        await bleQueue.write(deviceId, sUUID, cUUID, bytes);
        console.log(`[BLE DASH LAB] Paso enviado (WithResponse): ${JSON.stringify(bytes)}`);
      }
    } catch (err) {
      console.error('[BLE DASH LAB] Error al escribir:', err);
      useBleStore.getState().addRawLog(`[${timeStr}] ⚠️ ERROR TX -> ${err.message || err}`);
    } finally {
      setSendingHex(false);
    }
  };

  const getLogColor = (log) => {
    if (log.includes('ERROR') || log.includes('⚠️')) return '#ef4444';
    if (log.includes('🔮') || log.includes('Frame 458') || log.includes('Frame 539') || log.includes('Frame 770') || log.includes('2A37')) return '#c084fc';
    if (log.includes('📤 TX') || log.includes('TX ->')) return '#4ade80';
    if (log.includes('TELEMETRÍA 21-B') || log.includes('0x0047') || (log.includes('FEE3') && log.includes('21B'))) return '#c084fc';
    if (log.includes('📥 Datos en vivo') || log.includes('CH:')) return '#38bdf8';
    if (log.includes('🚀') || log.includes('🟢') || log.includes('Frame 896') || log.includes('MOY-82L3')) return '#a7f3d0';
    return '#94a3b8';
  };

  const handleOpenCurrentMap = () => {
    setMapReading(null);
    setGlobalScreen('MAP');
  };

  const batteryColor = battery === null ? '#64748b' : battery > 50 ? '#10b981' : battery > 20 ? '#f59e0b' : '#ef4444';

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>CardioGuard</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <Ionicons name={isConnected ? (battery !== null ? 'battery-full' : 'checkmark-circle') : 'ellipse-outline'} size={14} color={batteryColor} />
            <Text style={[styles.batteryText, { color: batteryColor }]}>
              {isConnected ? battery !== null ? `${battery}%` : 'Conectado' : 'Sin conexión'}
            </Text>
          </View>
          {locationReady && currentLocation && (
            <TouchableOpacity onPress={handleOpenCurrentMap} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}>
              <Ionicons name="location" size={14} color="#2563eb" />
              <Text style={styles.locationText} numberOfLines={1}>
                {currentLocation.address || `${currentLocation.lat?.toFixed(4)}, ${currentLocation.lng?.toFixed(4)}`}
              </Text>
            </TouchableOpacity>
          )}
          {!locationReady && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}>
              <Ionicons name="radio-outline" size={14} color="#94a3b8" />
              <Text style={[styles.locationText, { color: '#94a3b8' }]}>Obteniendo ubicación...</Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.statusDot, { backgroundColor: isConnected ? '#22c55e' : '#d4d4d8' }]} />
          {authUser && (
            <TouchableOpacity onPress={onLogout} style={styles.logoutMini}>
              <Ionicons name="log-out-outline" size={14} color="#64748b" />
              <Text style={styles.logoutMiniText}>Salir</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
 
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.circle, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={styles.bpmValue}>{bpm > 0 ? bpm : '--'}</Text>
          <Text style={styles.bpmLabel}>BPM</Text>
        </Animated.View>
 
        <View style={styles.metricsRow}>
          <View style={[styles.metricBox, { borderColor: '#bfdbfe' }]}>
            <MaterialCommunityIcons name="lungs" size={20} color="#2563eb" style={{ marginBottom: 4 }} />
            <Text style={styles.metricLabel}>SpO₂</Text>
            <Text style={[styles.metricValue, { color: '#2563eb' }]}>
              {oxygen > 0 ? `${oxygen}%` : '--'}
            </Text>
          </View>
          <View style={[styles.metricBox, { borderColor: '#ddd6fe' }]}>
            <MaterialCommunityIcons name="stethoscope" size={20} color="#7c3aed" style={{ marginBottom: 4 }} />
            <Text style={styles.metricLabel}>PRESIÓN</Text>
            <Text style={[styles.metricValue, { color: '#7c3aed' }]}>
              {pressure.sys > 0 ? `${pressure.sys}/${pressure.dia}` : '--'}
            </Text>
            {pressure.sys > 0 && <Text style={styles.metricUnit}>mmHg</Text>}
          </View>
        </View>
        <Text style={styles.statusMsg}>{statusMsg}</Text>

        {/* PANEL DE CONTROL DIRECTO DAFIT CLONE */}
        {isConnected && (
          <View style={styles.dafitPanelCard}>
            <View style={styles.dafitPanelHeader}>
              <MaterialCommunityIcons name="bluetooth-connect" size={18} color="#2563eb" />
              <Text style={styles.dafitPanelTitle}>CONTROL DIRECTO (DAFIT CLONE)</Text>
            </View>
            <Text style={styles.dafitPanelDesc}>
              Dispara estimaciones físicas manuales enviando ráfagas directas al firmware.
            </Text>

            <View style={styles.dafitButtonsRow}>
              {/* Botón BPM */}
              <TouchableOpacity style={[styles.dafitBtn, { backgroundColor: '#ef4444' }]} onPress={triggerAppBPM}>
                <Ionicons name="heart" size={16} color="#fff" />
                <Text style={styles.dafitBtnText}>Medir BPM</Text>
              </TouchableOpacity>

              {/* Botón SpO2 */}
              <TouchableOpacity style={[styles.dafitBtn, { backgroundColor: '#2563eb' }]} onPress={triggerAppSpO2}>
                <MaterialCommunityIcons name="lungs" size={16} color="#fff" />
                <Text style={styles.dafitBtnText}>Medir SpO₂</Text>
              </TouchableOpacity>

              {/* Botón Presión */}
              <TouchableOpacity style={[styles.dafitBtn, { backgroundColor: '#7c3aed' }]} onPress={triggerAppPressure}>
                <MaterialCommunityIcons name="stethoscope" size={16} color="#fff" />
                <Text style={styles.dafitBtnText}>Medir Presión</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
 
        {/* LABORATORIO DE DIAGNÓSTICO BLE */}
        {isConnected && (
          <View style={styles.labPanelCard}>
            <View style={styles.labPanelHeader}>
              <MaterialCommunityIcons name="flask-outline" size={18} color="#7c3aed" />
              <Text style={styles.labPanelTitle}>LABORATORIO DE DIAGNÓSTICO BLE</Text>
            </View>
            <Text style={styles.labPanelDesc}>
              Ejecuta la secuencia de diagnóstico paso a paso para sincronizar y probar los sensores del reloj.
            </Text>

            <View style={styles.sequenceContainer}>
              {/* Paso 1: Enlace Corto */}
              <TouchableOpacity style={styles.seqBtn} onPress={() => handleSendHexStep('Paso 1', 'FE-EA-20-06-5A-00')} disabled={sendingHex}>
                <View style={styles.seqBadge}><Text style={styles.seqBadgeText}>Paso 1</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.seqTitle}>Enlace Corto (5A 00)</Text>
                  <Text style={styles.seqDesc}>Desbloquea la respuesta base del reloj</Text>
                </View>
                <Ionicons name="play" size={16} color="#22c55e" />
              </TouchableOpacity>

              {/* Paso 2: Unlock Telemetría */}
              <TouchableOpacity style={styles.seqBtn} onPress={() => handleSendHexStep('Paso 2', 'FE-EA-20-06-35-07')} disabled={sendingHex}>
                <View style={[styles.seqBadge, { backgroundColor: '#0284c7' }]}><Text style={styles.seqBadgeText}>Paso 2</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.seqTitle}>Desbloquear Telemetría (35 07)</Text>
                  <Text style={styles.seqDesc}>Habilita el canal para notificaciones FEE3</Text>
                </View>
                <Ionicons name="key" size={16} color="#0284c7" />
              </TouchableOpacity>

              {/* Paso 3: Activar Streaming F9 */}
              <TouchableOpacity style={styles.seqBtn} onPress={() => handleSendHexStep('Paso 3', 'FE-EA-20-07-F9-02-01')} disabled={sendingHex}>
                <View style={[styles.seqBadge, { backgroundColor: '#7c3aed' }]}><Text style={styles.seqBadgeText}>Paso 3</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.seqTitle}>Activar Streaming (F9 02 01)</Text>
                  <Text style={styles.seqDesc}>Habilita flujo en tiempo real de telemetr�a</Text>
                </View>
                <Ionicons name="flash" size={16} color="#7c3aed" />
              </TouchableOpacity>

              {/* Paso 4: Disparar Ritmo Card�aco (BPM) */}
              <TouchableOpacity style={styles.seqBtn} onPress={() => handleSendHexStep('Paso 4', 'FE-EA-20-0B-BB-01-00-B0-B9-FF-FF')} disabled={sendingHex}>
                <View style={[styles.seqBadge, { backgroundColor: '#ef4444' }]}><Text style={styles.seqBadgeText}>Paso 4</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.seqTitle}>ENCENDER SENSOR PULSO (BB 01)</Text>
                  <Text style={styles.seqDesc}>Fuerza el encendido f�sico del LED verde</Text>
                </View>
                <Ionicons name="heart" size={16} color="#ef4444" />
              </TouchableOpacity>
 
              {/* Paso 5: Disparar Ox�geno (SpO2) */}
              <TouchableOpacity style={styles.seqBtn} onPress={() => handleSendHexStep('Paso 5', 'FE-EA-20-0B-BB-02-00-B0-B9-FF-FF')} disabled={sendingHex}>
                <View style={[styles.seqBadge, { backgroundColor: '#3b82f6' }]}><Text style={styles.seqBadgeText}>Paso 5</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.seqTitle}>ENCENDER SENSOR OX�GENO (BB 02)</Text>
                  <Text style={styles.seqDesc}>Fuerza el encendido f�sico del LED rojo</Text>
                </View>
                <Ionicons name="water" size={16} color="#3b82f6" />
              </TouchableOpacity>

              {/* Paso 6: Apagar Sensores */}
              <TouchableOpacity style={styles.seqBtn} onPress={() => handleSendHexStep('Paso 6', 'FE-EA-10-08-05-00-00-00')} disabled={sendingHex}>
                <View style={[styles.seqBadge, { backgroundColor: '#64748b' }]}><Text style={styles.seqBadgeText}>Paso 6</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.seqTitle}>APAGAR TODOS LOS SENSORES</Text>
                  <Text style={styles.seqDesc}>Apaga diodos y finaliza la medici�n activa</Text>
                </View>
                <Ionicons name="power" size={16} color="#64748b" />
              </TouchableOpacity>
            </View>
          </View>
        )}
        {isConnected && (
          <View style={[styles.card, styles.consoleCard]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={[styles.sectionTitle, { color: '#38bdf8', marginBottom: 0 }]}>
                {isCopyMode ? '📋 SELECCIÓN MANUAL DE LOGS' : '⌨️ TERMINAL CMD EN VIVO (RX/TX)'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <TouchableOpacity onPress={handleCopyToClipboard} style={{ padding: 4 }} title="Copiar todo al portapapeles">
                  <Ionicons name="copy" size={18} color="#4ade80" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setIsCopyMode(!isCopyMode)} style={{ padding: 4 }} title="Modo selección">
                  <Ionicons name={isCopyMode ? 'terminal-outline' : 'document-text-outline'} size={18} color="#38bdf8" />
                </TouchableOpacity>
                <TouchableOpacity onPress={clearRawLogs} style={{ padding: 4 }} title="Limpiar terminal">
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
 
            <View style={styles.terminalContainer}>
              {isCopyMode ? (
                <TextInput
                  style={styles.terminalTextInput}
                  multiline={true}
                  editable={false}
                  selectTextOnFocus={true}
                  value={rawLogs.join('\n')}
                />
              ) : (
                <ScrollView 
                  ref={consoleScrollRef}
                  style={styles.terminalScroll}
                  onContentSizeChange={() => consoleScrollRef.current?.scrollToEnd({ animated: true })}
                >
                  {rawLogs.length === 0 ? (
                    <Text style={styles.terminalPlaceholder}>Consola vacía. Envía comandos o activa sensores en el reloj para ver tramas en vivo...</Text>
                  ) : (
                    rawLogs.map((log, index) => (
                      <Text key={index} selectable={true} style={[styles.terminalLine, { color: getLogColor(log) }]}>
                        {log}
                      </Text>
                    ))
                  )}
                </ScrollView>
              )}
            </View>

            {/* Botón premium de copiado rápido sugerido por el usuario */}
            <TouchableOpacity 
              style={styles.terminalCopyBtn}
              onPress={handleCopyToClipboard}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="content-copy" size={16} color="#fff" />
              <Text style={styles.terminalCopyBtnText}>COPIAR TODOS LOS RESULTADOS Y LOGS</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.historyBanner} onPress={() => setGlobalScreen('HISTORY')}>
          <Ionicons name="bar-chart-outline" size={28} color="#2563eb" />
          <View style={{ flex: 1 }}>
            <Text style={styles.historyBannerTitle}>Ver Historial</Text>
            <Text style={styles.historyBannerSub}>{readings.length} lecturas registradas</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#2563eb" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.mapBanner} onPress={handleOpenCurrentMap}>
          <Ionicons name="map-outline" size={28} color="#059669" />
          <View style={{ flex: 1 }}>
            <Text style={styles.historyBannerTitle}>Mi Ubicación</Text>
            <Text style={styles.historyBannerSub} numberOfLines={1}>
              {currentLocation?.address || (locationReady ? 'Ubicación disponible' : 'Buscando GPS...')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#059669" />
        </TouchableOpacity>

        {authUser?.link_code && (
          <View style={styles.codeBanner}>
            <View style={styles.codeBannerLeft}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="key" size={14} color="#2563eb" />
                <Text style={styles.codeBannerLabel}>TU CÓDIGO PARA EL CUIDADOR</Text>
              </View>
              <Text style={styles.codeBannerValue}>
                {authUser.link_code.slice(0, 3)} {authUser.link_code.slice(3)}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Ionicons name="lock-closed" size={12} color="#94a3b8" />
                <Text style={styles.codeBannerHint}>Permanente · No caduca · Compártelo con quien te cuida</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.btn, 
            isScanning && styles.btnOff,
            isConnected && { backgroundColor: '#ef4444', shadowColor: '#ef4444' }
          ]}
          onPress={isConnected ? disconnectDevice : startScan}
          disabled={isScanning}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name={isScanning ? 'search' : isConnected ? 'close-circle' : 'bluetooth'} size={20} color="#fff" />
            <Text style={styles.btnText}>
              {isScanning ? 'BUSCANDO...' : isConnected ? 'DESCONECTAR RELOJ' : 'CONECTAR RELOJ'}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.bottomNav}>
          <TouchableOpacity style={[styles.navItem, styles.navItemActive]}>
            <MaterialCommunityIcons name="heart-pulse" size={24} color="#dc2626" />
            <Text style={[styles.navLabel, { color: '#dc2626' }]}>Monitor</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => setGlobalScreen('HISTORY')}>
            <Ionicons name="bar-chart-outline" size={24} color="#94a3b8" />
            <Text style={styles.navLabel}>Historial</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={handleOpenCurrentMap}>
            <Ionicons name="location-outline" size={24} color="#94a3b8" />
            <Text style={styles.navLabel}>Mapa</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header:        { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 14, flexDirection: 'row',
                   justifyContent: 'space-between', alignItems: 'flex-start',
                   borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  title:         { fontSize: 24, fontWeight: '900', color: '#1e293b', letterSpacing: 1 },
  batteryText:   { fontSize: 14, fontWeight: '700' },
  locationText:  { fontSize: 13, color: '#2563eb', maxWidth: 260, fontWeight: '600' },
  headerRight:   { alignItems: 'flex-end', paddingTop: 4, gap: 10 },
  statusDot:     { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#fff',
                   shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  logoutMini:    { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6,
                   borderRadius: 14, borderWidth: 1.5, borderColor: '#e2e8f0',
                   flexDirection: 'row', alignItems: 'center', gap: 4 },
  logoutMiniText: { color: '#64748b', fontSize: 12, fontWeight: '700' },

  scrollContent: { paddingVertical: 28, alignItems: 'center', paddingHorizontal: 24 },

  circle:        { width: 210, height: 210, borderRadius: 105,
                   borderWidth: 4, borderColor: '#fecaca',
                   justifyContent: 'center', alignItems: 'center',
                   backgroundColor: '#fff',
                   shadowColor: '#ef4444', shadowOpacity: 0.12, shadowRadius: 24, elevation: 8 },
  bpmValue:      { fontSize: 68, fontWeight: '900', color: '#dc2626' },
  bpmLabel:      { fontSize: 16, color: '#ef4444', fontWeight: '800', letterSpacing: 3 },

  metricsRow:    { flexDirection: 'row', gap: 14, marginTop: 24, width: '100%' },
  metricBox:     { flex: 1, backgroundColor: '#fff', padding: 20, borderRadius: 18,
                   alignItems: 'center', borderWidth: 1.5,
                   shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  metricLabel:   { color: '#64748b', fontSize: 13, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  metricValue:   { fontSize: 30, fontWeight: '900' },
  metricUnit:    { color: '#94a3b8', fontSize: 12, marginTop: 4, fontWeight: '600' },

  statusMsg:     { marginTop: 20, color: '#94a3b8', fontSize: 15, textAlign: 'center', fontWeight: '500' },

  historyBanner: { marginTop: 20, width: '100%', backgroundColor: '#fff',
                   borderRadius: 18, borderWidth: 1.5, borderColor: '#bfdbfe',
                   flexDirection: 'row', alignItems: 'center', padding: 18, gap: 14,
                   shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, elevation: 2 },
  mapBanner:     { marginTop: 12, width: '100%', backgroundColor: '#fff',
                   borderRadius: 18, borderWidth: 1.5, borderColor: '#a7f3d0',
                   flexDirection: 'row', alignItems: 'center', padding: 18, gap: 14,
                   shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, elevation: 2 },
  bleLabBanner:  { marginTop: 12, width: '100%', backgroundColor: '#fff',
                   borderRadius: 18, borderWidth: 1.5, borderColor: '#ddd6fe',
                   flexDirection: 'row', alignItems: 'center', padding: 18, gap: 14,
                   shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, elevation: 2 },
  historyBannerTitle: { color: '#1e293b', fontSize: 17, fontWeight: '700' },
  historyBannerSub:   { color: '#64748b', fontSize: 14, marginTop: 3 },

  codeBanner:    { marginTop: 14, width: '100%', backgroundColor: '#fff',
                   borderRadius: 22, borderWidth: 2, borderColor: '#bfdbfe',
                   padding: 22, alignItems: 'center',
                   shadowColor: '#2563eb', shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  codeBannerLeft: { alignItems: 'center', gap: 8 },
  codeBannerLabel: { color: '#2563eb', fontSize: 11, fontWeight: '900', letterSpacing: 3 },
  codeBannerValue: { fontSize: 44, fontWeight: '900', color: '#1e293b', letterSpacing: 14 },
  codeBannerHint:  { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 4 },

  footer:        { paddingHorizontal: 24, paddingBottom: 12 },
  btn:           { backgroundColor: '#2563eb', paddingVertical: 18, borderRadius: 30,
                   alignItems: 'center', marginBottom: 14,
                   shadowColor: '#2563eb', shadowOpacity: 0.3, shadowRadius: 12, elevation: 4 },
  btnOff:        { backgroundColor: '#e2e8f0', shadowOpacity: 0 },
  btnText:       { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },

  bottomNav:     { flexDirection: 'row', justifyContent: 'space-around',
                   borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 12 },
  navItem:       { alignItems: 'center', paddingVertical: 4, paddingHorizontal: 18 },
  navItemActive: {},
  navLabel:      { fontSize: 13, color: '#94a3b8', marginTop: 4, fontWeight: '700' },
  dafitPanelCard: {
    marginTop: 20,
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  dafitPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  dafitPanelTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#2563eb',
    letterSpacing: 2,
  },
  dafitPanelDesc: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 16,
    fontWeight: '500',
  },
  dafitButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    width: '100%',
  },
  dafitBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  dafitBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  labPanelCard: {
    marginTop: 20,
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  labPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  labPanelTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#7c3aed',
    letterSpacing: 2,
  },
  labPanelDesc: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 16,
    fontWeight: '500',
  },
  sequenceContainer: {
    gap: 10,
    marginTop: 12,
  },
  seqBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  seqBadge: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  seqBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  seqTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  seqDesc: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 2,
  },
  consoleCard: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    marginTop: 20,
    width: '100%',
  },
  terminalContainer: {
    backgroundColor: '#020617',
    borderRadius: 10,
    height: 250,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  terminalScroll: {
    flex: 1,
  },
  terminalPlaceholder: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 80,
    fontStyle: 'italic',
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  terminalLine: {
    color: '#38bdf8',
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 6,
  },
  terminalTextInput: {
    color: '#38bdf8',
    fontFamily: 'monospace',
    fontSize: 11,
    textAlignVertical: 'top',
    flex: 1,
  },
  terminalCopyBtn: {
    backgroundColor: '#10b981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
    shadowColor: '#10b981',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  terminalCopyBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
