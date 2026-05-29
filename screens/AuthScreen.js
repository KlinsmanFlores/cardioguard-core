import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  StatusBar, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Heartbeat, User, EnvelopeSimple, LockKey, ShieldCheck, Stethoscope, CaretRight, Info, CheckCircle } from 'phosphor-react-native';
import { registerUser, loginUser } from '../services/supabaseService';
import { COLORS } from '../components/ui';

// ─── Selector de rol ──────────────────────────────────────────────────────────
const RoleSelector = ({ selected, onChange }) => (
  <View style={styles.roleRow}>
    <TouchableOpacity
      style={[styles.roleCard, selected === 'adulto_mayor' && styles.roleCardActive]}
      onPress={() => onChange('adulto_mayor')}
    >
      <Heartbeat size={32} color={selected === 'adulto_mayor' ? COLORS.primary : COLORS.textMuted} weight={selected === 'adulto_mayor' ? "fill" : "regular"} />
      <Text style={[styles.roleTitle, selected === 'adulto_mayor' && styles.roleTitleActive]}>
        Adulto Mayor
      </Text>
      <Text style={[styles.roleDesc, selected === 'adulto_mayor' && { color: COLORS.primary }]}>Mide mis signos vitales</Text>
      {selected === 'adulto_mayor' && (
        <View style={styles.roleCheck}>
          <CheckCircle size={16} color={COLORS.primary} weight="fill" />
        </View>
      )}
    </TouchableOpacity>

    <TouchableOpacity
      style={[styles.roleCard, selected === 'cuidador' && styles.roleCardActiveGreen]}
      onPress={() => onChange('cuidador')}
    >
      <Stethoscope size={32} color={selected === 'cuidador' ? COLORS.green : COLORS.textMuted} weight={selected === 'cuidador' ? "fill" : "regular"} />
      <Text style={[styles.roleTitle, selected === 'cuidador' && styles.roleTitleActiveGreen]}>
        Cuidador
      </Text>
      <Text style={[styles.roleDesc, selected === 'cuidador' && { color: COLORS.green }]}>Monitoreo remoto</Text>
      {selected === 'cuidador' && (
        <View style={styles.roleCheck}>
           <CheckCircle size={16} color={COLORS.green} weight="fill" />
        </View>
      )}
    </TouchableOpacity>
  </View>
);

// ─── Input reutilizable ───────────────────────────────────────────────────────
const Input = ({ label, IconComponent, value, onChangeText, secureTextEntry, keyboardType, placeholder }) => {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={[styles.inputWrap, focused && styles.inputWrapFocused]}>
        <IconComponent size={20} color={focused ? COLORS.primary : COLORS.textMuted} weight={focused ? "bold" : "regular"} />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder || ''}
          placeholderTextColor={COLORS.textMuted}
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

// ─── Código de 6 Cajas ────────────────────────────────────────────────────────
const CodeDisplay = ({ code }) => {
  if (!code) return null;
  const chars = code.split('');
  return (
    <View style={styles.codeBoxesContainer}>
      {chars.map((char, index) => (
        <React.Fragment key={index}>
          <View style={styles.codeBox}>
            <Text style={styles.codeBoxText}>{char}</Text>
          </View>
          {index === 2 && <View style={styles.codeSeparator} />}
        </React.Fragment>
      ))}
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
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
        <View style={styles.codeScreen}>
          <View style={styles.codeIconWrapper}>
            <ShieldCheck size={48} color={COLORS.green} weight="fill" />
          </View>
          <Text style={styles.codeScreenTitle}>Bóveda de Seguridad</Text>
          <Text style={styles.codeScreenSub}>
            Tu cuenta médica ha sido creada. Comparte el siguiente PIN con tu cuidador para vincular tu reloj.
          </Text>

          <View style={styles.codeBadge}>
            <Text style={styles.codeLabel}>PIN DE VINCULACIÓN</Text>
            <CodeDisplay code={showCode} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
              <LockKey size={14} color={COLORS.textMuted} weight="bold" />
              <Text style={styles.codeHint}>Código único · Permanente</Text>
            </View>
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
            <Text style={styles.codeBtnText}>Entrar al Panel de Control</Text>
            <CaretRight size={20} color="#fff" weight="bold" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Logo */}
          <View style={styles.logoArea}>
            <View style={styles.logoCircle}>
              <Heartbeat size={40} color={COLORS.red} weight="fill" />
            </View>
            <Text style={styles.appName}>CARDIOGUARD</Text>
            <Text style={styles.appSub}>Monitoreo Inteligente 24/7</Text>
          </View>

          {/* Tab login/registro */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, mode === 'login' && styles.tabActive]}
              onPress={() => setMode('login')}
            >
              <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Entrar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === 'register' && styles.tabActive]}
              onPress={() => setMode('register')}
            >
              <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>Crear Cuenta</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>

            {/* Selector de rol solo en registro */}
            {mode === 'register' && (
              <>
                <Text style={styles.sectionLabel}>Tipo de usuario:</Text>
                <RoleSelector selected={role} onChange={setRole} />
                <Input label="Nombre completo" IconComponent={User} value={fullName}
                  onChangeText={setFullName} placeholder="Ej: Juan García" />
              </>
            )}

            <Input label="Correo electrónico" IconComponent={EnvelopeSimple} value={email}
              onChangeText={setEmail} keyboardType="email-address" placeholder="correo@ejemplo.com" />

            <Input label="Contraseña" IconComponent={LockKey} value={password}
              onChangeText={setPassword} secureTextEntry placeholder="••••••••" />

            {/* Botón acción */}
            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={mode === 'login' ? handleLogin : handleRegister}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <View style={styles.btnInner}>
                    <Text style={styles.btnText}>
                      {mode === 'login' ? 'Iniciar Sesión' : 'Registrarme'}
                    </Text>
                  </View>
              }
            </TouchableOpacity>

            {/* Info rol en registro */}
            {mode === 'register' && role === 'adulto_mayor' && (
              <View style={styles.infoBox}>
                <Info size={24} color={COLORS.primary} weight="fill" />
                <Text style={styles.infoText}>
                  Recibirás un <Text style={{ color: COLORS.primary, fontWeight: 'bold' }}>PIN Médico</Text> para compartir con tu cuidador o familiar.
                </Text>
              </View>
            )}
            {mode === 'register' && role === 'cuidador' && (
              <View style={[styles.infoBox, { borderColor: COLORS.greenBorder, backgroundColor: COLORS.greenBg }]}>
                <Info size={24} color={COLORS.green} weight="fill" />
                <Text style={styles.infoText}>
                  Tras el registro, podrás vincular el reloj del paciente usando su <Text style={{ color: COLORS.green, fontWeight: 'bold' }}>PIN de 6 dígitos</Text>.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.bg },
  scroll:       { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },

  logoArea:     { alignItems: 'center', paddingTop: 40, paddingBottom: 32 },
  logoCircle:   { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFF',
                  borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center',
                  alignItems: 'center', marginBottom: 12,
                  shadowColor: COLORS.borderDark, shadowOpacity: 0.3, shadowRadius: 10, elevation: 3 },
  appName:      { fontSize: 24, fontWeight: '900', color: COLORS.textDark, letterSpacing: 2 },
  appSub:       { color: COLORS.textMuted, fontSize: 13, marginTop: 4, letterSpacing: 0.5, fontWeight: '600' },

  tabRow:       { flexDirection: 'row', backgroundColor: COLORS.header, borderRadius: 14,
                  padding: 4, marginBottom: 24, borderWidth: 1, borderColor: COLORS.border },
  tab:          { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  tabActive:    { backgroundColor: '#FFF', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  tabText:      { color: COLORS.textMuted, fontWeight: '700', fontSize: 14 },
  tabTextActive: { color: COLORS.primary, fontWeight: '800' },

  form:         { gap: 20 },
  sectionLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginBottom: -8, textTransform: 'uppercase' },

  roleRow:      { flexDirection: 'row', gap: 12 },
  roleCard:     { flex: 1, backgroundColor: '#FFF', borderRadius: 16, padding: 16,
                  borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', gap: 8 },
  roleCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.blueBg },
  roleCardActiveGreen: { borderColor: COLORS.green, backgroundColor: COLORS.greenBg },
  roleCheck:    { position: 'absolute', top: 10, right: 10 },
  roleTitle:    { color: COLORS.textMuted, fontSize: 13, fontWeight: '800' },
  roleTitleActive: { color: COLORS.primary },
  roleTitleActiveGreen: { color: COLORS.green },
  roleDesc:     { color: COLORS.textMuted, fontSize: 10, textAlign: 'center', lineHeight: 14, fontWeight: '600' },

  inputGroup:   { gap: 8 },
  inputLabel:   { color: COLORS.textDark, fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  inputWrap:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF',
                  borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
                  paddingHorizontal: 16, gap: 12 },
  inputWrapFocused: { borderColor: COLORS.primary, backgroundColor: '#FFF' },
  input:        { flex: 1, color: COLORS.textDark, fontSize: 15, paddingVertical: 16, fontWeight: '600' },

  btn:          { backgroundColor: COLORS.primary, paddingVertical: 18, borderRadius: 28,
                  alignItems: 'center', marginTop: 12,
                  shadowColor: COLORS.primary, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  btnDisabled:  { opacity: 0.5 },
  btnInner:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText:      { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

  infoBox:      { flexDirection: 'row', backgroundColor: COLORS.blueBg, borderRadius: 12, borderWidth: 1,
                  borderColor: COLORS.blueBorder, padding: 16, alignItems: 'center', gap: 12 },
  infoText:     { color: COLORS.textDark, fontSize: 12, lineHeight: 18, flex: 1, fontWeight: '600' },

  // ── Pantalla de código ──────────────────────────────────────────────────
  codeScreen:   { flex: 1, justifyContent: 'center', alignItems: 'center',
                  paddingHorizontal: 28, gap: 24 },
  codeIconWrapper:{ width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.greenBg,
                  justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.greenBorder },
  codeScreenTitle: { fontSize: 26, fontWeight: '900', color: COLORS.textDark, textAlign: 'center', letterSpacing: 0.5 },
  codeScreenSub:   { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20, fontWeight: '600' },

  codeBadge:    { width: '100%', backgroundColor: '#FFF', borderRadius: 20,
                  borderWidth: 1, borderColor: COLORS.border, paddingVertical: 30, paddingHorizontal: 20,
                  alignItems: 'center', gap: 16,
                  shadowColor: COLORS.borderDark, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4 },
  codeLabel:    { color: COLORS.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  
  codeBoxesContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  codeBox:      { backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.primary,
                  borderRadius: 12, width: 44, height: 56, justifyContent: 'center', alignItems: 'center' },
  codeBoxText:  { color: COLORS.primary, fontSize: 24, fontWeight: '900' },
  codeSeparator:{ width: 12, height: 3, backgroundColor: COLORS.borderDark, borderRadius: 2 },

  codeHint:     { color: COLORS.textMuted, fontSize: 11, fontWeight: '700' },

  codeBtn:      { backgroundColor: COLORS.green, paddingVertical: 18, paddingHorizontal: 30,
                  borderRadius: 30, alignItems: 'center', width: '100%',
                  flexDirection: 'row', justifyContent: 'center', gap: 12,
                  shadowColor: COLORS.green, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  codeBtnText:  { color: '#FFFFFF', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
});
