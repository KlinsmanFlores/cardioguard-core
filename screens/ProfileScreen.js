import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { CaretLeft, User, Drop, WarningCircle, DeviceMobile, SignOut, Check } from 'phosphor-react-native';
import { COLORS } from '../components/ui';
import Toast from 'react-native-toast-message';
import { updateUserProfile, updateLocalSession } from '../services/supabaseService';

export default function ProfileScreen({ user, onBack, onLogout, onUpdateUser }) {
  const isAdult = user?.role === 'adulto_mayor';
  const [loading, setLoading] = useState(false);

  // Form State
  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    phone: user?.phone || '',
    blood_type: user?.blood_type || '',
    allergies: user?.allergies || '',
  });

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      Toast.show({ type: 'error', text1: 'El nombre es obligatorio' });
      return;
    }
    
    setLoading(true);
    const updates = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      blood_type: form.blood_type.trim().toUpperCase(),
      allergies: form.allergies.trim(),
    };

    const result = await updateUserProfile(user.id, updates);
    setLoading(false);

    if (result.success) {
      Toast.show({ type: 'success', text1: 'Perfil actualizado correctamente' });
      // Update local session
      const newSession = await updateLocalSession(updates);
      if (onUpdateUser && newSession) {
        onUpdateUser(newSession);
      }
    } else {
      Toast.show({ type: 'error', text1: 'Error al actualizar', text2: result.error });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        
        {/* HEADER */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <CaretLeft size={24} color={COLORS.textDark} weight="bold" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Mi Perfil</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          
          <View style={styles.avatarSection}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{form.full_name?.substring(0, 2).toUpperCase() || 'US'}</Text>
            </View>
            <Text style={styles.roleBadge}>{isAdult ? 'Paciente' : 'Cuidador'}</Text>
            <Text style={styles.emailText}>{user?.email}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Datos Personales</Text>
            
            <View style={styles.inputGroup}>
              <View style={styles.iconWrap}><User size={20} color={COLORS.primary} /></View>
              <TextInput
                style={styles.input}
                placeholder="Nombre completo"
                value={form.full_name}
                onChangeText={(t) => setForm({ ...form, full_name: t })}
              />
            </View>

            <View style={styles.inputGroup}>
              <View style={styles.iconWrap}><DeviceMobile size={20} color={COLORS.primary} /></View>
              <TextInput
                style={styles.input}
                placeholder="Teléfono"
                keyboardType="phone-pad"
                value={form.phone}
                onChangeText={(t) => setForm({ ...form, phone: t })}
              />
            </View>
          </View>

          {isAdult && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Información Médica (Opcional)</Text>
              
              <View style={styles.inputGroup}>
                <View style={styles.iconWrap}><Drop size={20} color={COLORS.red} weight="fill" /></View>
                <TextInput
                  style={styles.input}
                  placeholder="Tipo de Sangre (Ej. O+)"
                  value={form.blood_type}
                  onChangeText={(t) => setForm({ ...form, blood_type: t })}
                  maxLength={5}
                />
              </View>

              <View style={styles.inputGroup}>
                <View style={styles.iconWrap}><WarningCircle size={20} color={COLORS.orange} weight="fill" /></View>
                <TextInput
                  style={styles.input}
                  placeholder="Alergias conocidas"
                  value={form.allergies}
                  onChangeText={(t) => setForm({ ...form, allergies: t })}
                />
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : (
              <>
                <Check size={20} color="#FFF" weight="bold" />
                <Text style={styles.saveBtnText}>Guardar Cambios</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
            <SignOut size={20} color={COLORS.red} weight="bold" />
            <Text style={styles.logoutBtnText}>Cerrar Sesión</Text>
          </TouchableOpacity>
          
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#FFF',
    borderBottomWidth: 1, borderColor: COLORS.border
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: COLORS.textDark },
  scroll: { padding: 20, paddingBottom: 60 },
  avatarSection: { alignItems: 'center', marginBottom: 32 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.blueBg, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { fontSize: 28, fontWeight: '900', color: COLORS.primary },
  roleBadge: { backgroundColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, fontSize: 11, fontWeight: '800', color: COLORS.textDark, marginBottom: 4, textTransform: 'uppercase' },
  emailText: { fontSize: 13, color: COLORS.textMuted },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: 12, marginLeft: 4 },
  inputGroup: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12, overflow: 'hidden' },
  iconWrap: { paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' },
  input: { flex: 1, paddingVertical: 14, paddingRight: 16, fontSize: 15, color: COLORS.textDark, fontWeight: '600' },
  saveBtn: { flexDirection: 'row', backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginTop: 12, shadowColor: COLORS.primary, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4, gap: 8 },
  saveBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  logoutBtn: { flexDirection: 'row', backgroundColor: COLORS.redBg, paddingVertical: 16, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginTop: 24, borderWidth: 1, borderColor: COLORS.redBorder, gap: 8 },
  logoutBtnText: { color: COLORS.red, fontSize: 15, fontWeight: '800' }
});
