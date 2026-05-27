import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabaseClient';

// ─── Configuración de cómo se muestran las notificaciones en primer plano ─────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

// ─── Umbrales de alerta (deben coincidir con supabaseService.js) ──────────────
export const THRESHOLDS = {
  BPM_HIGH:  120,
  BPM_LOW:   45,
  SPO2_LOW:  90,
  SYS_HIGH:  160,
  DIA_HIGH:  100,
};

// ─── 1. PERMISOS Y REGISTRO DE PUSH TOKEN ────────────────────────────────────

/**
 * Solicita permisos de notificación y obtiene el Expo Push Token.
 * Guarda el token en Supabase (tabla profiles.push_token) para que
 * el Edge Function pueda enviarlo push cuando haya una alerta.
 */
export const registerPushToken = async (userId) => {
  try {

    // Solicitar permisos
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[PUSH] Permisos de notificación denegados');
      return null;
    }

    // Canal de notificación para Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('cardioguard_alerts', {
        name:        'Alertas CardioGuard',
        importance:  Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor:  '#ef4444',
        sound:       true,
        enableVibrate: true,
      });
    }

    // Obtener token de Expo
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: 'cardioguard-appexpo', // nombre del proyecto en Expo
    });
    const pushToken = tokenData.data;
    console.log('[PUSH] Token registrado:', pushToken);

    // Guardar token en Supabase
    if (userId && pushToken) {
      await supabase
        .from('profiles')
        .update({ push_token: pushToken })
        .eq('id', userId);
      console.log('[PUSH] Token guardado en Supabase');
    }

    return pushToken;
  } catch (e) {
    console.error('[PUSH] Error registrando token:', e.message);
    return null;
  }
};

// ─── 2. NOTIFICACIÓN LOCAL (para el adulto mayor en su propio cel) ────────────

/**
 * Dispara una notificación LOCAL inmediata en el dispositivo.
 * Se usa cuando los valores del reloj cruzan los umbrales.
 * Funciona aunque no haya internet.
 */
export const sendLocalAlert = async ({ title, body, data = {} }) => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound:    true,
        priority: Notifications.AndroidNotificationPriority.MAX,
        color:    '#ef4444',
        vibrate:  [0, 250, 250, 250],
      },
      trigger: null, // null = inmediata
    });
    console.log('[NOTIF] 🔔 Alerta local enviada:', title);
  } catch (e) {
    console.error('[NOTIF] Error enviando alerta local:', e.message);
  }
};

// ─── 3. VERIFICAR UMBRAL Y DISPARAR ALERTA ───────────────────────────────────

/**
 * Evalúa si un valor supera los umbrales y envía notificación local.
 * El push al cuidador lo maneja el Supabase Edge Function automáticamente
 * cuando se inserta el registro en la tabla `alerts`.
 *
 * @param {'BPM'|'SPO2'|'PRESSURE'} type
 * @param {number|{sys,dia}} value
 * @param {object} location
 */
export const checkThresholdAndNotify = async (type, value, location = null) => {
  let triggered = false;
  let title     = '';
  let body      = '';

  if (type === 'BPM') {
    if (value > THRESHOLDS.BPM_HIGH) {
      triggered = true;
      title = '⚠️ Frecuencia cardíaca alta';
      body  = `Tu pulso es ${value} BPM. Descansa y respira profundo.`;
    } else if (value < THRESHOLDS.BPM_LOW) {
      triggered = true;
      title = '⚠️ Frecuencia cardíaca baja';
      body  = `Tu pulso es ${value} BPM. Siéntate y avisa a alguien.`;
    }
  }

  if (type === 'SPO2' && value < THRESHOLDS.SPO2_LOW) {
    triggered = true;
    title = '🫁 Saturación de oxígeno baja';
    body  = `Tu SpO₂ es ${value}%. Respira lento y busca ayuda.`;
  }

  if (type === 'PRESSURE') {
    const { sys, dia } = value;
    if (sys > THRESHOLDS.SYS_HIGH || dia > THRESHOLDS.DIA_HIGH) {
      triggered = true;
      title = '🩺 Presión arterial elevada';
      body  = `Tu presión es ${sys}/${dia} mmHg. Descansa y notifica a tu médico.`;
    }
  }

  if (triggered) {
    await sendLocalAlert({
      title,
      body,
      data: { type, value: JSON.stringify(value), lat: location?.lat, lng: location?.lng },
    });
  }

  return triggered;
};

// ─── 4. LISTENERS PARA CUANDO EL CUIDADOR RECIBE LA PUSH ─────────────────────

/**
 * Configura los listeners de notificaciones para el cuidador.
 * - onReceive: cuando llega la push con app en primer plano
 * - onResponse: cuando el usuario toca la notificación
 */
export const setupNotificationListeners = ({ onReceive, onTap }) => {
  const receiveSub = Notifications.addNotificationReceivedListener(notification => {
    console.log('[PUSH] Notificación recibida:', notification.request.content);
    onReceive?.(notification);
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener(response => {
    console.log('[PUSH] Notificación tocada:', response.notification.request.content.data);
    onTap?.(response.notification.request.content.data);
  });

  // Retorna función para limpiar los listeners
  return () => {
    receiveSub.remove();
    responseSub.remove();
  };
};
