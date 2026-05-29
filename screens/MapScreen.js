import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
  SafeAreaView, StatusBar, Animated, ActivityIndicator, Linking, Platform
} from 'react-native';
// react-native-maps removido para evitar crasheos por API Key en Android
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

const { width, height } = Dimensions.get('window');

const TYPE_CONFIG = {
  BPM:      { Icon: MaterialCommunityIcons, iconName: 'heart-pulse', color: '#dc2626', bgColor: '#fef2f2', label: 'Frecuencia Cardíaca' },
  SPO2:     { Icon: MaterialCommunityIcons, iconName: 'lungs',       color: '#2563eb', bgColor: '#eff6ff', label: 'Saturación O₂' },
  PRESSURE: { Icon: MaterialCommunityIcons, iconName: 'stethoscope', color: '#7c3aed', bgColor: '#f5f3ff', label: 'Presión Arterial' },
};

const formatDate = (iso) => {
  const d = new Date(iso);
  const _months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${String(d.getDate()).padStart(2, '0')} ${_months[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function MapScreen({ reading, currentLocation, onBack, onRefresh }) {
  const [mapReady, setMapReady] = useState(true);
  const [accuracy, setAccuracy] = useState(reading?.location?.accuracy || currentLocation?.accuracy || null);
  const [loadingGPS, setLoadingGPS] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const handleLocalRefresh = async () => {
    if (!onRefresh) return;
    setLoadingGPS(true);
    await onRefresh();
    setLoadingGPS(false);
  };

  const targetLoc = reading?.location || currentLocation;
  const cfg = reading ? (TYPE_CONFIG[reading.type] || TYPE_CONFIG.BPM) : null;

  const region = targetLoc ? {
    latitude:       targetLoc.lat,
    longitude:      targetLoc.lng,
    latitudeDelta:  0.003,
    longitudeDelta: 0.003,
  } : null;

  useEffect(() => {
    if (mapReady) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    }
  }, [mapReady]);

  useEffect(() => {
    setAccuracy(reading?.location?.accuracy || currentLocation?.accuracy || null);
  }, [reading, currentLocation]);

  const openInGoogleMaps = () => {
    if (!targetLoc) return;
    const url = `https://maps.google.com/?q=${targetLoc.lat},${targetLoc.lng}`;
    Linking.openURL(url);
  };

  if (!targetLoc) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
        <View style={styles.noLocHeader}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color="#475569" />
            <Text style={styles.backText}>Volver</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.noLocBody}>
          <Ionicons name="radio-outline" size={64} color="#d4d4d8" />
          <Text style={styles.noLocTitle}>Sin ubicación</Text>
          <Text style={styles.noLocMsg}>
            No hay datos de GPS disponibles para esta lectura.
            Asegúrate de que los permisos de ubicación estén habilitados.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* Mapa eliminado para mantener el proyecto 100% gratuito sin API Keys.
          Se delega la navegación a la aplicación nativa de mapas del celular. */}
      
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
        <Ionicons name="location" size={80} color="#2563eb" />
        <Text style={{ marginTop: 16, fontSize: 18, fontWeight: '800', color: '#1e293b', textAlign: 'center' }}>
          Coordenadas Listas
        </Text>
        <Text style={{ marginTop: 8, fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 22 }}>
          La ubicación GPS del paciente se ha obtenido correctamente. 
          Presiona el botón inferior para abrir la navegación nativa en tu celular.
        </Text>
      </View>

      {/* Panel superior */}
      <Animated.View style={[styles.topPanel, { opacity: fadeAnim }]}>
        <SafeAreaView>
          <View style={styles.topPanelContent}>
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={20} color="#475569" />
              <Text style={styles.backText}>Volver</Text>
            </TouchableOpacity>
            <Text style={styles.topTitle}>
              Ubicación Actual
            </Text>
            {onRefresh && (
              <TouchableOpacity onPress={handleLocalRefresh} style={styles.refreshHeaderBtn} disabled={loadingGPS}>
                {loadingGPS ? (
                  <ActivityIndicator size="small" color="#2563eb" />
                ) : (
                  <Ionicons name="refresh" size={20} color="#2563eb" />
                )}
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </Animated.View>

      {/* Panel inferior */}
      <Animated.View style={[styles.bottomPanel, { opacity: fadeAnim }]}>

        <View style={styles.addressRow}>
          <Ionicons name="location" size={20} color="#2563eb" style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.addressLabel}>
              Ubicación actual
            </Text>
            <Text style={styles.addressText}>
              {targetLoc.address || `${targetLoc.lat.toFixed(6)}, ${targetLoc.lng.toFixed(6)}`}
            </Text>
          </View>
        </View>

        <View style={styles.coordsRow}>
          <View style={styles.coordChip}>
            <Text style={styles.coordLabel}>LAT</Text>
            <Text style={styles.coordValue}>{targetLoc.lat.toFixed(6)}</Text>
          </View>
          <View style={styles.coordChip}>
            <Text style={styles.coordLabel}>LNG</Text>
            <Text style={styles.coordValue}>{targetLoc.lng.toFixed(6)}</Text>
          </View>
          {accuracy && (
            <View style={styles.coordChip}>
              <Text style={styles.coordLabel}>PRECISIÓN</Text>
              <Text style={styles.coordValue}>±{Math.round(accuracy)}m</Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.gmapsBtn} onPress={openInGoogleMaps}>
          <Ionicons name="map-outline" size={20} color="#fff" />
          <Text style={styles.gmapsBtnText}>Abrir en Google Maps</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#f8fafc' },
  map:            { width, height },

  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#f8fafc',
                    justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  loadingText:    { color: '#64748b', marginTop: 14, fontSize: 16 },

  topPanel:       { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
                    backgroundColor: 'rgba(248,250,252,0.92)' },
  topPanelContent:{ flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 20, paddingVertical: 14, gap: 14 },
  backBtn:        { backgroundColor: '#fff', borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 4,
                    paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1.5, borderColor: '#e2e8f0',
                    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 },
  refreshHeaderBtn: { backgroundColor: '#fff', borderRadius: 20, width: 40, height: 40, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#e2e8f0', marginLeft: 'auto',
                      shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 },
  backText:       { color: '#475569', fontSize: 14, fontWeight: '700' },
  topTitle:       { color: '#1e293b', fontSize: 16, fontWeight: '800' },

  bottomPanel:    { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 5,
                    backgroundColor: 'rgba(248,250,252,0.96)',
                    borderTopWidth: 1, borderTopColor: '#e2e8f0',
                    borderTopLeftRadius: 28, borderTopRightRadius: 28,
                    paddingHorizontal: 24, paddingTop: 22, paddingBottom: 36 },

  readingBadge:   { flexDirection: 'row', alignItems: 'center', gap: 14,
                    borderRadius: 16, borderWidth: 1.5,
                    padding: 16, marginBottom: 16 },
  readingBadgeLabel: { color: '#64748b', fontSize: 12, fontWeight: '600', marginBottom: 2 },
  readingBadgeValue: { fontSize: 22, fontWeight: '900' },
  readingTime:    { marginLeft: 'auto' },
  readingTimeText: { color: '#94a3b8', fontSize: 12, textAlign: 'right' },

  addressRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  addressLabel:   { color: '#94a3b8', fontSize: 12, fontWeight: '600', marginBottom: 3 },
  addressText:    { color: '#1e293b', fontSize: 15, fontWeight: '600', lineHeight: 22 },

  coordsRow:      { flexDirection: 'row', gap: 8, marginBottom: 16 },
  coordChip:      { flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1,
                    borderColor: '#e2e8f0', paddingVertical: 10, alignItems: 'center' },
  coordLabel:     { color: '#94a3b8', fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
  coordValue:     { fontSize: 13, fontWeight: '700', color: '#1e293b' },

  gmapsBtn:       { flexDirection: 'row', backgroundColor: '#2563eb', padding: 16, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  gmapsBtnText:   { color: '#fff', fontSize: 16, fontWeight: '700', marginLeft: 8 },

  noLocHeader:    { padding: 20, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  noLocBody:      { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  noLocTitle:     { color: '#475569', fontSize: 24, fontWeight: '800', marginTop: 16, marginBottom: 10 },
  noLocMsg:       { color: '#94a3b8', fontSize: 16, textAlign: 'center', lineHeight: 24 },

  markerContainer: { width: 50, height: 50, borderRadius: 25,
                     borderWidth: 3, justifyContent: 'center', alignItems: 'center',
                     shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
});
