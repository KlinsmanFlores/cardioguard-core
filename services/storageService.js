import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocalSession, saveMetricToSupabase } from './supabaseService';

const READINGS_KEY = '@cardioguard_readings';
const MAX_READINGS = 500;

/**
 * Genera un ID único para cada lectura
 */
const generateId = () =>
  `reading_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Carga todas las lecturas almacenadas
 * @returns {Promise<Array>}
 */
export const loadReadings = async () => {
  try {
    const raw = await AsyncStorage.getItem(READINGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('[STORAGE] Error cargando lecturas:', e);
    return [];
  }
};

/**
 * Guarda una nueva lectura de BPM
 * @param {number} value  - Valor BPM
 * @param {object|null} location - { lat, lng, address, accuracy }
 */
export const saveBpmReading = async (value, location = null) => {
  if (!value || value <= 0) return null;
  return saveReading({ type: 'BPM', value, location });
};

/**
 * Guarda una nueva lectura de SpO₂
 * @param {number} value  - Porcentaje de saturación
 * @param {object|null} location
 */
export const saveSpo2Reading = async (value, location = null) => {
  if (!value || value <= 0) return null;
  return saveReading({ type: 'SPO2', value, location });
};

/**
 * Guarda una nueva lectura de presión arterial
 * @param {number} sys  - Sistólica
 * @param {number} dia  - Diastólica
 * @param {object|null} location
 */
export const savePressureReading = async (sys, dia, location = null) => {
  if (!sys || !dia || sys <= 0 || dia <= 0) return null;
  return saveReading({ type: 'PRESSURE', value: { sys, dia }, location });
};

/**
 * Función base de guardado
 */
const saveReading = async ({ type, value, location }) => {
  try {
    const current = await loadReadings();

    const newReading = {
      id:        generateId(),
      type,
      value,
      location,
      timestamp: new Date().toISOString(),
    };

    // Mantener máximo MAX_READINGS (eliminar los más viejos)
    const updated = [...current, newReading].slice(-MAX_READINGS);
    await AsyncStorage.setItem(READINGS_KEY, JSON.stringify(updated));

    console.log(`[STORAGE] ✅ Guardado [${type}]:`, value, location ? '📍' : '');

    // Sincronizar en espejo con Supabase en background si hay una sesión activa de Adulto Mayor
    try {
      const session = await getLocalSession();
      if (session && session.userId && session.role === 'adulto_mayor') {
        console.log(`[STORAGE] 🚀 Espejo Supabase: Sincronizando medición [${type}] para ${session.userId}...`);
        await saveMetricToSupabase({
          userId: session.userId,
          type,
          value,
          location
        });
      }
    } catch (dbErr) {
      console.warn('[STORAGE] Error en background sync con Supabase:', dbErr);
    }

    return newReading;
  } catch (e) {
    console.error('[STORAGE] Error guardando lectura:', e);
    return null;
  }
};

/**
 * Elimina todas las lecturas
 */
export const clearReadings = async () => {
  try {
    await AsyncStorage.removeItem(READINGS_KEY);
    console.log('[STORAGE] 🗑 Historial limpiado');
    return true;
  } catch (e) {
    console.error('[STORAGE] Error limpiando:', e);
    return false;
  }
};

/**
 * Obtiene estadísticas básicas
 */
export const getStats = async () => {
  const readings = await loadReadings();
  const bpmReadings      = readings.filter(r => r.type === 'BPM');
  const spo2Readings     = readings.filter(r => r.type === 'SPO2');
  const pressureReadings = readings.filter(r => r.type === 'PRESSURE');

  const avg = (arr) => arr.length > 0
    ? Math.round(arr.reduce((s, r) => s + r.value, 0) / arr.length)
    : null;

  return {
    total:   readings.length,
    bpm:     { count: bpmReadings.length,      avg: avg(bpmReadings) },
    spo2:    { count: spo2Readings.length,     avg: avg(spo2Readings) },
    pressure: { count: pressureReadings.length },
    latest:  readings[readings.length - 1] || null,
  };
};
