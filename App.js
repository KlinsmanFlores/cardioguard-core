import React, { useState, useEffect } from 'react';
import { StatusBar, Text, View, LogBox, BackHandler } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

// Suprimir advertencia inofensiva de arquitectura legada (común en módulos BLE)
LogBox.ignoreLogs([
  'The app is running using the Legacy Architecture',
  '`new NativeEventEmitter()` was called with a non-null argument without the required `addListener` method',
  '`new NativeEventEmitter()` was called with a non-null argument without the required `removeListeners` method'
]);

import Toast from 'react-native-toast-message';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AuthScreen     from './screens/AuthScreen';
import HistoryScreen  from './screens/HistoryScreen';
import MapScreen      from './screens/MapScreen';
import CaregiverScreen from './screens/CaregiverScreen';
import PatientDashboard from './screens/PatientDashboard';
import ProfileScreen  from './screens/ProfileScreen';

import { useBLE } from './hooks/useBLE';

import { getLocalSession, logoutUser, syncLocationToSupabase, getLastPatientLocation } from './services/supabaseService';
import { registerPushToken, setupNotificationListeners } from './services/notificationService';
import { loadReadings, clearReadings } from './services/storageService';
import { requestLocationPermission, startLocationWatch, stopLocationWatch, getCurrentLocation } from './services/locationService';

function MainApp() {
  // Inicialización global del motor BLE para resiliencia y persistencia total
  useBLE();

  const [authUser, setAuthUser]       = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [screen, setScreen]           = useState('HOME');
  const [mapReading, setMapReading]   = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
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

  // Sincronizar ubicación en tiempo real para Adulto Mayor
  useEffect(() => {
    if (!authUser || authUser.role !== 'adulto_mayor') {
      stopLocationWatch();
      return;
    }

    const initGPS = async () => {
      const granted = await requestLocationPermission();
      if (granted) {
        startLocationWatch((loc) => {
          if (loc) {
            setCurrentLocation(loc);
            syncLocationToSupabase({
              userId: authUser.userId,
              lat: loc.lat,
              lng: loc.lng,
              address: loc.address,
              accuracy: loc.accuracy,
            }).catch(err => console.error('[GPS] Error sync:', err));
          }
        });
      }
    };

    initGPS();

    return () => {
      stopLocationWatch();
    };
  }, [authUser]);

  useEffect(() => {
    const backAction = () => {
      if (screen !== 'HOME') {
        setScreen('HOME');
        setMapReading(null);
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, [screen]);

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

  if (authUser.role === 'cuidador' && screen !== 'MAP' && screen !== 'PROFILE') {
    return (
      <CaregiverScreen
        user={authUser}
        onLogout={handleLogout}
        onViewMap={(data) => { setMapReading(data); setScreen('MAP'); }}
        setGlobalScreen={setScreen}
      />
    );
  }

  if (screen === 'PROFILE') {
    return (
      <ProfileScreen 
        user={authUser}
        onBack={() => setScreen('HOME')}
        onLogout={handleLogout}
        onUpdateUser={(updatedSession) => setAuthUser(updatedSession)}
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
        currentLocation={currentLocation}
        onBack={() => setScreen(mapReading ? 'HISTORY' : 'HOME')}
        onRefresh={async () => {
          if (authUser?.role === 'adulto_mayor') {
            const loc = await getCurrentLocation();
            if (loc) {
              setCurrentLocation(loc);
            }
          } else {
            const pId = mapReading?.patientId || mapReading?.user_id;
            if (pId) {
              const loc = await getLastPatientLocation(pId);
              if (loc) {
                setMapReading({ location: loc, patientId: pId });
              }
            }
          }
        }}
      />
    );
  }

  if (screen === 'PROFILE') {
    return (
      <ProfileScreen
        user={authUser}
        onBack={() => setScreen('HOME')}
        onLogout={handleLogout}
        onUpdateUser={(updatedUser) => setAuthUser(updatedUser)}
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
        currentLocation={currentLocation}
      />
    </SafeAreaView>
  );
}

import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <MainApp />
      </ErrorBoundary>
      <Toast />
    </SafeAreaProvider>
  );
}
