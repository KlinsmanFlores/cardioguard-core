import React, { useState, useEffect } from 'react';
import { SafeAreaView, StatusBar, Text } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import AuthScreen     from './screens/AuthScreen';
import HistoryScreen  from './screens/HistoryScreen';
import MapScreen      from './screens/MapScreen';
import CaregiverScreen from './screens/CaregiverScreen';
import PatientDashboard from './screens/PatientDashboard';

import { useBLE } from './hooks/useBLE';

import { getLocalSession, logoutUser } from './services/supabaseService';
import { registerPushToken, setupNotificationListeners } from './services/notificationService';
import { loadReadings, clearReadings } from './services/storageService';

export default function App() {
  // Inicialización global del motor BLE para resiliencia y persistencia total
  useBLE();

  const [authUser, setAuthUser]       = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [screen, setScreen]           = useState('HOME');
  const [mapReading, setMapReading]   = useState(null);
  const [readings, setReadings]       = useState([]);

  useEffect(() => {
    const checkSession = async () => {
      const saved = await getLocalSession();
      if (saved) {
        setAuthUser(saved);
        if (saved.userId) registerPushToken(saved.userId).catch(() => {});
      }
      setAuthLoading(false);
    };
    checkSession();

    const loadHist = async () => {
      const saved = await loadReadings();
      setReadings(saved);
    };
    loadHist();
  }, []);

  useEffect(() => {
    const cleanup = setupNotificationListeners({
      onReceive: (notif) => {
        console.log('[NOTIF] Recibida:', notif.request.content.title);
      },
      onTap: (data) => {
        if (data?.lat && data?.lng) {
          setMapReading({ location: { lat: Number(data.lat), lng: Number(data.lng), address: data.address } });
          setScreen('MAP');
        }
      },
    });
    return cleanup;
  }, []);

  const handleAuthSuccess = (user) => {
    setAuthUser(user);
    if (user?.userId) registerPushToken(user.userId).catch(() => {});
  };

  const handleLogout = async () => {
    await logoutUser();
    setAuthUser(null);
    setScreen('HOME');
  };

  const handleClearHistory = async () => {
    await clearReadings();
    setReadings([]);
  };

  if (authLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center' }}>
        <MaterialCommunityIcons name="heart-pulse" size={48} color="#dc2626" style={{ marginBottom: 16 }} />
        <Text style={{ color: '#dc2626', fontSize: 22, fontWeight: '900', letterSpacing: 3 }}>CARDIOGUARD</Text>
        <Text style={{ color: '#94a3b8', fontSize: 14, marginTop: 8 }}>Cargando...</Text>
      </SafeAreaView>
    );
  }

  if (!authUser) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  if (authUser.role === 'cuidador' && screen !== 'MAP') {
    return (
      <CaregiverScreen
        user={authUser}
        onLogout={handleLogout}
        onViewMap={(data) => { setMapReading(data); setScreen('MAP'); }}
      />
    );
  }

  if (screen === 'HISTORY') {
    return (
      <HistoryScreen
        readings={readings}
        onViewMap={(r) => { setMapReading(r); setScreen('MAP'); }}
        onClear={handleClearHistory}
        onBack={() => setScreen('HOME')}
      />
    );
  }

  if (screen === 'MAP') {
    return (
      <MapScreen
        reading={mapReading}
        onBack={() => setScreen(mapReading ? 'HISTORY' : 'HOME')}
      />
    );
  }


  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      <PatientDashboard
        authUser={authUser}
        onLogout={handleLogout}
        setGlobalScreen={setScreen}
        setMapReading={setMapReading}
        readings={readings}
        setReadings={setReadings}
      />
    </SafeAreaView>
  );
}
