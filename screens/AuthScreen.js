import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  SafeAreaView, StatusBar, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { registerUser, loginUser } from '../services/supabaseService';

// ─── Selector de rol ──────────────────────────────────────────────────────────
const RoleSelector = ({ selected, onChange }) => (
  <View style={styles.roleRow}>
    <TouchableOpacity
      style={[styles.roleCard, selected === 'adulto_mayor' && styles.roleCardActive]}
      onPress={() => onChange('adulto_mayor')}
    >
      <MaterialCommunityIcons name="account-heart" size={38} color={selected === 'adulto_mayor' ? '#2563eb' : '#94a3b8'} />
      <Text style={[styles.roleTitle, selected === 'adulto_mayor' && styles.roleTitleActive]}>
        Adulto Mayor
      </Text>
      <Text style={styles.roleDesc}>Uso el reloj y la app mide mis signos vitales</Text>
      {selected === 'adulto_mayor' && (
        <View style={styles.roleCheck}>
          <Ionicons name="checkmark" size={14} color="#fff" />
        </View>
      )}
    </TouchableOpacity>

    <TouchableOpacity
      style={[styles.roleCard, selected === 'cuidador' && styles.roleCardActiveGreen]}
      onPress={() => onChange('cuidador')}
    >
      <MaterialCommunityIcons name="stethoscope" size={38} color={selected === 'cuidador' ? '#059669' : '#94a3b8'} />
      <Text style={[styles.roleTitle, selected === 'cuidador' && styles.roleTitleActiveGreen]}>
        Cuidador
      </Text>
      <Text style={styles.roleDesc}>Monitoreo a mi familiar de forma remota</Text>
      {selected === 'cuidador' && (
        <View style={[styles.roleCheck, { backgroundColor: '#059669' }]}>
          <Ionicons name="checkmark" size={14} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  </View>
);

// ─── Input reutilizable ───────────────────────────────────────────────────────
const Input = ({ label, iconName, value, onChangeText, secureTextEntry, keyboardType, placeholder }) => {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={[styles.inputWrap, focused && styles.inputWrapFocused]}>
        <Ionicons name={iconName} size={20} color={focused ? '#2563eb' : '#94a3b8'} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder || ''}
          placeholderTextColor="#a1a1aa"
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType || 'default'}
          autoCapitalize="none"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>
    </View>
  );
};

// ─── Pantalla principal de Auth ───────────────────────────────────────────────
export default function AuthScreen({ onAuthSuccess }) {
  const [mode, setMode]         = useState('login');
  const [loading, setLoading]   = useState(false);
  const [showCode, setShowCode] = useState(null);
  const [registeredUserId, setRegisteredUserId] = useState(null);

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole]         = useState('adulto_mayor');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Campos requeridos', 'Ingresa tu email y contraseña.');
      return;
    }
    setLoading(true);
    const result = await loginUser({ email: email.trim(), password });
    setLoading(false);

    if (result.success) {
      onAuthSuccess(result.user);
    } else {
      Alert.alert('Error al iniciar sesión', result.error);
    }
  };

  const handleRegister = async () => {
    if (!fullName.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Campos requeridos', 'Completa todos los campos.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Contraseña débil', 'Mínimo 6 caracteres.');
      return;
    }
    setLoading(true);
    const result = await registerUser({ email: email.trim(), password, fullName: fullName.trim(), role });
    setLoading(false);

    if (result.success) {
      if (role === 'adulto_mayor') {
        setRegisteredUserId(result.userId);
        setShowCode(result.linkCode);
      } else {
        onAuthSuccess({ userId: result.userId, role, full_name: fullName.trim(), email: email.trim(), link_code: null });
      }
    } else {
      Alert.alert('Error al registrar', result.error);
    }
  };

  // Pantalla de código de vinculación (solo adulto mayor, tras registro)
  if (showCode) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
        <View style={styles.codeScreen}>
          <Ionicons name="checkmark-circle" size={56} color="#22c55e" />
          <Text style={styles.codeScreenTitle}>¡Cuenta creada!</Text>
          <Text style={styles.codeScreenSub}>
            Este es tu código de vinculación.{'\n'}
            Tu cuidador lo necesita para monitorear tus signos vitales.
          </Text>

          <View style={styles.codeBadge}>
            <Text style={styles.codeLabel}>TU CÓDIGO</Text>
            <Text style={styles.codeValue}>
              {showCode.slice(0, 3)} {showCode.slice(3)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Ionicons name="lock-closed" size={14} color="#94a3b8" />
              <Text style={styles.codeHint}>Permanente · No caduca</Text>
            </View>
          </View>

          <View style={styles.codeInfoBox}>
            <Text style={styles.codeInfoText}>
              Este código es <Text style={{ fontWeight: 'bold', color: '#1e293b' }}>permanente y único</Text>.
              No vence nunca. Lo podrás ver siempre desde tu perfil dentro de la app.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.codeBtn}
            onPress={() => onAuthSuccess({
              userId:     registeredUserId,
              role:       'adulto_mayor',
              full_name:  fullName.trim(),
              email:      email.trim(),
              link_code:  showCode,
            })}
          >
            <Text style={styles.codeBtnText}>Entrar a la app</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={styles.logoArea}>
          <View style={styles.logoCircle}>
            <MaterialCommunityIcons name="heart-pulse" size={44} color="#dc2626" />
          </View>
          <Text style={styles.appName}>CARDIOGUARD</Text>
          <Text style={styles.appSub}>Monitoreo de salud familiar</Text>
        </View>

        {/* Tab login/registro */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, mode === 'login' && styles.tabActive]}
            onPress={() => setMode('login')}
          >
            <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Iniciar Sesión</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'register' && styles.tabActive]}
            onPress={() => setMode('register')}
          >
            <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>Registrarse</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>

          {/* Selector de rol solo en registro */}
          {mode === 'register' && (
            <>
              <Text style={styles.sectionLabel}>Soy...</Text>
              <RoleSelector selected={role} onChange={setRole} />
              <Input label="Nombre completo" iconName="person" value={fullName}
                onChangeText={setFullName} placeholder="Ej: Juan García López" />
            </>
          )}

          <Input label="Correo electrónico" iconName="mail" value={email}
            onChangeText={setEmail} keyboardType="email-address" placeholder="usuario@correo.com" />

          <Input label="Contraseña" iconName="lock-closed" value={password}
            onChangeText={setPassword} secureTextEntry placeholder="Mínimo 6 caracteres" />

          {/* Botón acción */}
          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={mode === 'login' ? handleLogin : handleRegister}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <View style={styles.btnInner}>
                  <Ionicons name={mode === 'login' ? 'log-in-outline' : 'checkmark-circle-outline'} size={22} color="#fff" />
                  <Text style={styles.btnText}>
                    {mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
                  </Text>
                </View>
            }
          </TouchableOpacity>

          {/* Info rol en registro */}
          {mode === 'register' && role === 'adulto_mayor' && (
            <View style={styles.infoBox}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <Ionicons name="information-circle" size={20} color="#2563eb" style={{ marginTop: 1 }} />
                <Text style={[styles.infoText, { flex: 1 }]}>
                  Al crear tu cuenta recibirás un <Text style={{ color: '#2563eb', fontWeight: 'bold' }}>código de 6 dígitos</Text> para compartir con tu cuidador.
                </Text>
              </View>
            </View>
          )}
          {mode === 'register' && role === 'cuidador' && (
            <View style={[styles.infoBox, { borderColor: '#a7f3d0', backgroundColor: '#ecfdf5' }]}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <Ionicons name="information-circle" size={20} color="#059669" style={{ marginTop: 1 }} />
                <Text style={[styles.infoText, { flex: 1 }]}>
                  Después de registrarte podrás <Text style={{ color: '#059669', fontWeight: 'bold' }}>vincular a tu adulto mayor</Text> usando su código.
                </Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#f8fafc' },
  scroll:       { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },

  logoArea:     { alignItems: 'center', paddingTop: 48, paddingBottom: 32 },
  logoCircle:   { width: 88, height: 88, borderRadius: 44, backgroundColor: '#fff',
                  borderWidth: 3, borderColor: '#fecaca', justifyContent: 'center',
                  alignItems: 'center', marginBottom: 16,
                  shadowColor: '#ef4444', shadowOpacity: 0.15, shadowRadius: 16, elevation: 8 },
  appName:      { fontSize: 28, fontWeight: '900', color: '#1e293b', letterSpacing: 3 },
  appSub:       { color: '#64748b', fontSize: 15, marginTop: 6 },

  tabRow:       { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 16,
                  padding: 4, marginBottom: 24 },
  tab:          { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 12 },
  tabActive:    { backgroundColor: '#2563eb', shadowColor: '#2563eb', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  tabText:      { color: '#64748b', fontWeight: '700', fontSize: 15 },
  tabTextActive: { color: '#fff', fontWeight: '800' },

  form:         { gap: 16 },
  sectionLabel: { color: '#475569', fontSize: 15, fontWeight: '700', letterSpacing: 0.5, marginBottom: -4 },

  roleRow:      { flexDirection: 'row', gap: 12 },
  roleCard:     { flex: 1, backgroundColor: '#fff', borderRadius: 18, padding: 18,
                  borderWidth: 2, borderColor: '#e2e8f0', alignItems: 'center', gap: 8,
                  shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  roleCardActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  roleCardActiveGreen: { borderColor: '#059669', backgroundColor: '#ecfdf5' },
  roleCheck:    { position: 'absolute', top: 10, right: 10, width: 22, height: 22,
                  borderRadius: 11, backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center' },
  roleTitle:    { color: '#475569', fontSize: 14, fontWeight: '800' },
  roleTitleActive: { color: '#2563eb' },
  roleTitleActiveGreen: { color: '#059669' },
  roleDesc:     { color: '#94a3b8', fontSize: 11, textAlign: 'center', lineHeight: 16 },

  inputGroup:   { gap: 6 },
  inputLabel:   { color: '#475569', fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  inputWrap:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
                  borderRadius: 14, borderWidth: 2, borderColor: '#e2e8f0',
                  paddingHorizontal: 14, gap: 10,
                  shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  inputWrapFocused: { borderColor: '#2563eb', shadowColor: '#2563eb', shadowOpacity: 0.15 },
  input:        { flex: 1, color: '#1e293b', fontSize: 16, paddingVertical: 16 },

  btn:          { backgroundColor: '#2563eb', paddingVertical: 18, borderRadius: 30,
                  alignItems: 'center', marginTop: 8,
                  shadowColor: '#2563eb', shadowOpacity: 0.3, shadowRadius: 12, elevation: 4 },
  btnDisabled:  { opacity: 0.6 },
  btnInner:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText:      { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },

  infoBox:      { backgroundColor: '#eff6ff', borderRadius: 14, borderWidth: 1,
                  borderColor: '#bfdbfe', padding: 16 },
  infoText:     { color: '#475569', fontSize: 14, lineHeight: 22 },

  // ── Pantalla de código ──────────────────────────────────────────────────
  codeScreen:   { flex: 1, justifyContent: 'center', alignItems: 'center',
                  paddingHorizontal: 28, gap: 22 },
  codeScreenTitle: { fontSize: 30, fontWeight: '900', color: '#1e293b', textAlign: 'center' },
  codeScreenSub:   { color: '#64748b', fontSize: 16, textAlign: 'center', lineHeight: 24 },

  codeBadge:    { width: '100%', backgroundColor: '#fff', borderRadius: 24,
                  borderWidth: 3, borderColor: '#2563eb', paddingVertical: 36,
                  alignItems: 'center', gap: 10,
                  shadowColor: '#2563eb', shadowOpacity: 0.15, shadowRadius: 20, elevation: 8 },
  codeLabel:    { color: '#2563eb', fontSize: 12, fontWeight: '900', letterSpacing: 4 },
  codeValue:    { fontSize: 48, fontWeight: '900', color: '#1e293b', letterSpacing: 14 },
  codeHint:     { color: '#94a3b8', fontSize: 13 },

  codeInfoBox:  { backgroundColor: '#ecfdf5', borderRadius: 16, borderWidth: 1,
                  borderColor: '#a7f3d0', padding: 18, width: '100%' },
  codeInfoText: { color: '#475569', fontSize: 14, lineHeight: 22, textAlign: 'center' },

  codeBtn:      { backgroundColor: '#2563eb', paddingVertical: 18, paddingHorizontal: 40,
                  borderRadius: 30, alignItems: 'center', width: '100%',
                  flexDirection: 'row', justifyContent: 'center', gap: 10,
                  shadowColor: '#2563eb', shadowOpacity: 0.3, shadowRadius: 12, elevation: 4 },
  codeBtnText:  { color: '#fff', fontSize: 18, fontWeight: '900' },
});
