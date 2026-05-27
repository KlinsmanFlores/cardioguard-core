import { supabase } from './supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = '@cardioguard_session';

// ─── Umbrales de alerta ───────────────────────────────────────────────────────
export const ALERT_THRESHOLDS = {
  BPM_HIGH:   120,
  BPM_LOW:    45,
  SPO2_LOW:   90,
  SYS_HIGH:   160,
  DIA_HIGH:   100,
};

// ─── AUTH ─────────────────────────────────────────────────────────────────────

/**
 * Registra un nuevo usuario con rol (adulto_mayor | cuidador)
 * El código de vinculación es PERMANENTE y ÚNICO en toda la base de datos.
 * Si hay colisión (muy raro), reintenta automáticamente.
 */
export const registerUser = async ({ email, password, fullName, role, birthDate = '', gender = '' }) => {
  try {
    // 1. Crear cuenta en Supabase Auth
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { success: false, error: error.message };

    const userId = data.user?.id;
    if (!userId) return { success: false, error: 'No se pudo crear el usuario' };

    // 2. Generar código ÚNICO con reintentos si hay colisión
    let linkCode = null;
    let insertOk = false;
    let attempts = 0;

    while (!insertOk && attempts < 5) {
      // Formato: 3 letras + 3 números → más legible (ej: "KJM-471")
      const letters = Math.random().toString(36).substr(2, 3).toUpperCase();
      const numbers = Math.floor(100 + Math.random() * 900).toString();
      linkCode = `${letters}${numbers}`;  // 6 chars, sin guión en DB

      const { error: profileError } = await supabase.from('profiles').insert({
        id:         userId,
        email,
        full_name:  fullName,
        role,
        birth_date: birthDate,
        gender,
        link_code:  linkCode,
      });

      if (!profileError) {
        insertOk = true;
      } else if (profileError.message?.includes('duplicate') || profileError.code === '23505') {
        // Colisión de código → reintenta con nuevo código
        attempts++;
        console.warn(`[AUTH] Colisión de código, reintento ${attempts}...`);
      } else {
        console.error('[AUTH] Error creando perfil:', profileError.message);
        break;
      }
    }

    if (!insertOk) return { success: false, error: 'No se pudo crear el perfil. Intenta de nuevo.' };

    // 3. Auto-login: guardar sesión directamente (el usuario ya quedó autenticado)
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({
      userId,
      id:        userId,
      email,
      full_name: fullName,
      role,
      link_code: linkCode,
      birth_date: birthDate,
      gender,
    }));

    return { success: true, userId, linkCode, role };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

/**
 * Inicia sesión y devuelve usuario + perfil con rol
 * SIEMPRE recarga el perfil desde Supabase para tener el link_code actualizado
 */
export const loginUser = async ({ email, password }) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };

    const userId = data.user?.id;

    // Obtener perfil completo desde Supabase (incluye link_code siempre fresco)
    const { data: profile, error: pe } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (pe || !profile) return { success: false, error: 'Perfil no encontrado. Contacta soporte.' };

    const sessionData = { userId, ...profile };

    // Persistir localmente (incluye link_code)
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));

    return { success: true, user: sessionData };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

/**
 * Cerrar sesión
 */
export const logoutUser = async () => {
  await supabase.auth.signOut();
  await AsyncStorage.removeItem(SESSION_KEY);
};

/**
 * Recupera la sesión guardada localmente
 */
export const getLocalSession = async () => {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
};


// ─── MÉTRICAS ─────────────────────────────────────────────────────────────────

/**
 * Guarda una lectura de salud en Supabase (tabla heart_metrics)
 * También dispara alertas si los valores son críticos
 */
export const saveMetricToSupabase = async ({ userId, type, value, location }) => {
  if (!userId) return;

  try {
    const row = {
      user_id:   userId,
      type,            // 'BPM' | 'SPO2' | 'PRESSURE'
      bpm:       type === 'BPM'      ? value           : null,
      oxygen:    type === 'SPO2'     ? value           : null,
      sys:       type === 'PRESSURE' ? value?.sys      : null,
      dia:       type === 'PRESSURE' ? value?.dia      : null,
      timestamp: new Date().toISOString(),
      lat:       location?.lat     || null,
      lng:       location?.lng     || null,
      address:   location?.address || null,
    };

    const { error } = await supabase.from('heart_metrics').insert(row);
    if (error) console.warn('[DB] Error guardando métrica:', error.message);

    // Verificar si es alerta de emergencia
    await checkAndCreateAlert({ userId, type, value, location });

  } catch (e) {
    console.error('[DB] saveMetricToSupabase:', e.message);
  }
};

/**
 * Obtiene el historial completo de un paciente (para cuidador)
 */
export const getPatientMetrics = async (patientId, limit = 100) => {
  try {
    const { data, error } = await supabase
      .from('heart_metrics')
      .select('*')
      .eq('user_id', patientId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) return [];
    return data || [];
  } catch (_) { return []; }
};

// ─── UBICACIÓN ────────────────────────────────────────────────────────────────

/**
 * Sincroniza la ubicación actual a la tabla locations
 */
export const syncLocationToSupabase = async ({ userId, lat, lng, address, accuracy }) => {
  if (!userId || !lat || !lng) return;
  try {
    await supabase.from('locations').insert({
      user_id:   userId,
      lat, lng, address,
      accuracy:  accuracy || null,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[GPS] Error sincronizando ubicación:', e.message);
  }
};

/**
 * Obtiene la última ubicación conocida de un paciente
 */
export const getLastPatientLocation = async (patientId) => {
  try {
    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('user_id', patientId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();
    return data;
  } catch (_) { return null; }
};

// ─── VINCULACIÓN CUIDADOR ↔ ADULTO MAYOR ─────────────────────────────────────

/**
 * Cuidador se vincula a un adulto mayor por su código de 6 dígitos
 */
export const linkCaregiverToPatient = async ({ caregiverId, linkCode }) => {
  try {
    // Buscar perfil con ese código — CASE INSENSITIVE
    // Soporta códigos viejos en minúsculas y nuevos en mayúsculas
    const codeNormalized = linkCode.trim().toUpperCase();

    const { data: patient, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .ilike('link_code', codeNormalized)   // ilike = insensible a mayúsculas
      .eq('role', 'adulto_mayor')
      .single();

    if (error || !patient) return { success: false, error: 'Código no válido. Verifica que el adulto mayor te dé el código correcto.' };

    // Crear vínculo en care_links
    const { error: linkError } = await supabase.from('care_links').insert({
      caregiver_id: caregiverId,
      patient_id:   patient.id,
    });

    if (linkError && !linkError.message.includes('duplicate'))
      return { success: false, error: linkError.message };

    return { success: true, patient };
  } catch (e) {
    return { success: false, error: e.message };
  }
};

/**
 * Obtiene todos los pacientes vinculados a un cuidador
 */
export const getCaregiverPatients = async (caregiverId) => {
  try {
    const { data, error } = await supabase
      .from('care_links')
      .select('patient_id, profiles!care_links_patient_id_fkey(id, full_name, email, link_code, is_auto_mode)')
      .eq('caregiver_id', caregiverId);

    if (error) return [];
    return data?.map(d => d.profiles).filter(Boolean) || [];
  } catch (_) { return []; }
};

// ─── ALERTAS DE EMERGENCIA ────────────────────────────────────────────────────

const checkAndCreateAlert = async ({ userId, type, value, location }) => {
  let isAlert = false;
  let message = '';

  if (type === 'BPM') {
    if (value > ALERT_THRESHOLDS.BPM_HIGH) { isAlert = true; message = `⚠️ Frecuencia alta: ${value} BPM`; }
    if (value < ALERT_THRESHOLDS.BPM_LOW)  { isAlert = true; message = `⚠️ Frecuencia baja: ${value} BPM`; }
  }
  if (type === 'SPO2' && value < ALERT_THRESHOLDS.SPO2_LOW) {
    isAlert = true; message = `⚠️ Saturación crítica: ${value}%`;
  }
  if (type === 'PRESSURE') {
    if (value?.sys > ALERT_THRESHOLDS.SYS_HIGH || value?.dia > ALERT_THRESHOLDS.DIA_HIGH) {
      isAlert = true; message = `⚠️ Presión alta: ${value.sys}/${value.dia} mmHg`;
    }
  }

  if (!isAlert) return;

  try {
    await supabase.from('alerts').insert({
      patient_id: userId,
      type,
      value:      JSON.stringify(value),
      message,
      lat:        location?.lat    || null,
      lng:        location?.lng    || null,
      address:    location?.address || null,
      timestamp:  new Date().toISOString(),
      read:       false,
    });
    console.log('[ALERT] 🚨 Alerta guardada:', message);
  } catch (e) {
    console.error('[ALERT] Error guardando alerta:', e.message);
  }
};

/**
 * Obtiene alertas no leídas de los pacientes de un cuidador
 */
export const getCaregiverAlerts = async (caregiverId) => {
  try {
    // Primero obtener IDs de pacientes
    const { data: links } = await supabase
      .from('care_links')
      .select('patient_id')
      .eq('caregiver_id', caregiverId);

    if (!links?.length) return [];

    const patientIds = links.map(l => l.patient_id);

    const { data: alerts } = await supabase
      .from('alerts')
      .select('*, profiles!alerts_patient_id_fkey(full_name)')
      .in('patient_id', patientIds)
      .eq('read', false)
      .order('timestamp', { ascending: false });

    return alerts || [];
  } catch (_) { return []; }
};

/**
 * Marca una alerta como leída
 */
export const markAlertRead = async (alertId) => {
  await supabase.from('alerts').update({ read: true }).eq('id', alertId);
};

/**
 * Suscripción en tiempo real a nuevas alertas de los pacientes del cuidador
 */
export const subscribeToAlerts = (patientIds, onAlert) => {
  const channel = supabase
    .channel('caregiver_alerts')
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'alerts',
      filter: `patient_id=in.(${patientIds.join(',')})`,
    }, payload => {
      onAlert(payload.new);
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
};

/**
 * Suscripción a cambios de perfil (ej. modo automático)
 */
export const subscribeToPatientProfiles = (patientIds, onProfileChange) => {
  const channel = supabase
    .channel('caregiver_profiles')
    .on('postgres_changes', {
      event:  'UPDATE',
      schema: 'public',
      table:  'profiles',
      filter: `id=in.(${patientIds.join(',')})`,
    }, payload => {
      onProfileChange(payload.new);
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
};
