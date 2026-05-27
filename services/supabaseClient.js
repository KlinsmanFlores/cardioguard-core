import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Credenciales de CardioGuardEvolution (SupabaseModule.kt) ────────────────
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// ─── Cliente Supabase con AsyncStorage para sesión persistente ───────────────
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage:          AsyncStorage,
    autoRefreshToken: true,
    persistSession:   true,
    detectSessionInUrl: false,
  },
});

// ─── Tablas usadas en este proyecto ─────────────────────────────────────────
// profiles      → { id, email, full_name, role, birth_date, gender, link_code }
// heart_metrics → { id, user_id, bpm, oxygen, sys, dia, timestamp, lat, lng, address }
// locations     → { id, user_id, lat, lng, address, accuracy, timestamp }
// care_links    → { id, caregiver_id, patient_id, created_at }
// alerts        → { id, patient_id, type, value, message, lat, lng, timestamp, read }
