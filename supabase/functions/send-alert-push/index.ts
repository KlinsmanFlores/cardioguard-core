// supabase/functions/send-alert-push/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Supabase Edge Function — se dispara automáticamente cuando se inserta
// una fila nueva en la tabla `alerts` (via Database Webhook).
//
// CÓMO DESPLEGAR:
//   1. Instalar Supabase CLI: npm install -g supabase
//   2. supabase login
//   3. supabase link --project-ref <TU_PROJECT_REF>
//   4. supabase functions deploy send-alert-push
//
// CÓMO CONFIGURAR EL WEBHOOK:
//   Supabase Dashboard → Database → Webhooks → Create a new hook
//   - Name: on_new_alert
//   - Table: alerts
//   - Events: INSERT
//   - Type: Supabase Edge Functions
//   - Edge Function: send-alert-push
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

serve(async (req) => {
  try {
    const payload = await req.json();
    
    // El webhook de Supabase envía { type, table, record, old_record }
    const alert = payload.record;
    if (!alert || !alert.patient_id) {
      return new Response('No alert data', { status: 400 });
    }

    console.log('[EDGE] Nueva alerta:', alert.message, '| Paciente:', alert.patient_id);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Obtener nombre del paciente
    const { data: patientProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', alert.patient_id)
      .single();

    const patientName = patientProfile?.full_name?.split(' ')[0] || 'Tu familiar';

    // 2. Obtener push tokens de TODOS los cuidadores vinculados al paciente
    const { data: careLinks } = await supabase
      .from('care_links')
      .select('caregiver_id, profiles!care_links_caregiver_id_fkey(push_token, full_name)')
      .eq('patient_id', alert.patient_id);

    if (!careLinks || careLinks.length === 0) {
      console.log('[EDGE] Sin cuidadores vinculados para el paciente');
      return new Response('No caregivers', { status: 200 });
    }

    // 3. Filtrar cuidadores con push token registrado
    const pushMessages = careLinks
      .map(link => link.profiles)
      .filter(p => p?.push_token)
      .map(caregiver => ({
        to:       caregiver.push_token,
        title:    `🚨 Alerta de ${patientName}`,
        body:     alert.message,
        sound:    'default',
        priority: 'high',
        channelId: 'cardioguard_alerts',
        data: {
          alertId:   alert.id,
          patientId: alert.patient_id,
          type:      alert.type,
          lat:       alert.lat,
          lng:       alert.lng,
          address:   alert.address,
        },
        badge: 1,
      }));

    if (pushMessages.length === 0) {
      console.log('[EDGE] Ningún cuidador tiene push token registrado');
      return new Response('No push tokens', { status: 200 });
    }

    // 4. Enviar via Expo Push API (proxy a FCM/APNs)
    const response = await fetch(EXPO_PUSH_URL, {
      method:  'POST',
      headers: {
        'Accept':           'application/json',
        'Accept-Encoding':  'gzip, deflate',
        'Content-Type':     'application/json',
      },
      body: JSON.stringify(pushMessages),
    });

    const result = await response.json();
    console.log('[EDGE] Push enviado:', JSON.stringify(result));

    return new Response(JSON.stringify({ ok: true, sent: pushMessages.length }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('[EDGE] Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
