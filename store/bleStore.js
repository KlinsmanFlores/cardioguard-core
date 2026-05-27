import { create } from 'zustand';

export const useBleStore = create((set) => ({
  isConnected: false,
  isScanning: false,
  statusMsg: 'Listo para conectar',
  deviceId: null,
  battery: null,
  
  bpm: 0,
  spo2: 0,
  pressure: { sys: 0, dia: 0 },
  isBluetoothBusy: false,
  activeResolver: null,

  // UUIDs descubiertos dinámicamente para soporte modular entre hooks
  resolvedHealthService: '0000feea-0000-1000-8000-00805f9b34fb',
  resolvedHealthChar: '0000fee3-0000-1000-8000-00805f9b34fb',
  resolvedHealthWriteService: '0000feea-0000-1000-8000-00805f9b34fb',
  resolvedHealthWrite: '0000fee2-0000-1000-8000-00805f9b34fb',
  resolvedHealthV2Service: null,
  resolvedHealthV2Char: null,
  resolvedHRService: '0000180d-0000-1000-8000-00805f9b34fb',
  resolvedHRChar: '00002a37-0000-1000-8000-00805f9b34fb',
  resolvedBattService: '0000180f-0000-1000-8000-00805f9b34fb',
  resolvedBattChar: '00002a19-0000-1000-8000-00805f9b34fb',
  
  // Cola de datos pendientes por guardar (para evitar guardar duplicados en la UI)
  lastMetricEvent: null, // { type: 'BPM'|'SPO2'|'PRESSURE', value: any, timestamp: number }
  
  // Registros en bruto de BLE para el Laboratorio de Depuración (BLE Lab)
  rawLogs: [],

  // Estado de la sesión con la máquina de estados del firmware Moyoung V2
  sessionState: {
    authenticated: false,
    realtimeEnabled: false,
    telemetryUnlocked: false,
    sensorReady: false,
  },

  // Acciones vinculadas del motor BLE (inicializadas por useBLE a nivel raíz)
  startScan: null,
  disconnectDevice: null,
  triggerMeasurement: null,
  triggerAppBPM: null,
  triggerAppSpO2: null,
  triggerAppPressure: null,

  // Acciones
  addRawLog: (log) => set((state) => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    const stamp = `[${hh}:${mm}:${ss}.${ms}]`;
    const stamped = `${stamp} ${log}`;
    return { rawLogs: [stamped, ...state.rawLogs].slice(0, 200) };
  }),
  clearRawLogs: () => set({ rawLogs: [] }),
  setSessionState: (newVal) => set((state) => ({ sessionState: { ...state.sessionState, ...newVal } })),
  setConnected: (status) => set({ isConnected: status }),
  setScanning: (status) => set({ isScanning: status }),
  setStatusMsg: (msg) => set({ statusMsg: msg }),
  setDeviceId: (id) => set({ deviceId: id }),
  setBattery: (batt) => set({ battery: batt }),
  setBluetoothBusy: (busy) => set({ isBluetoothBusy: busy }),
  
  setBpm: (bpm) => set({ bpm, lastMetricEvent: { type: 'BPM', value: bpm, timestamp: Date.now() } }),
  setSpo2: (spo2) => set({ spo2, lastMetricEvent: { type: 'SPO2', value: spo2, timestamp: Date.now() } }),
  setSpO2: (spo2) => set({ spo2, lastMetricEvent: { type: 'SPO2', value: spo2, timestamp: Date.now() } }),
  setPressure: (sys, dia) => set({ pressure: { sys, dia }, lastMetricEvent: { type: 'PRESSURE', value: { sys, dia }, timestamp: Date.now() } }),
  setSistolica: (sys) => set((state) => ({ 
    pressure: { ...state.pressure, sys },
    lastMetricEvent: { type: 'PRESSURE', value: { sys, dia: state.pressure.dia }, timestamp: Date.now() }
  })),
  setDiastolica: (dia) => set((state) => ({ 
    pressure: { ...state.pressure, dia },
    lastMetricEvent: { type: 'PRESSURE', value: { sys: state.pressure.sys, dia }, timestamp: Date.now() }
  })),
  
  resetDevice: () => set({ 
    isConnected: false, 
    battery: null, 
    bpm: 0, 
    spo2: 0, 
    pressure: { sys: 0, dia: 0 },
    deviceId: null,
    isBluetoothBusy: false,
    sessionState: {
      authenticated: false,
      realtimeEnabled: false,
      telemetryUnlocked: false,
      sensorReady: false,
    },
    // Resetear UUIDs a defaults
    resolvedHealthService: '0000feea-0000-1000-8000-00805f9b34fb',
    resolvedHealthChar: '0000fee3-0000-1000-8000-00805f9b34fb',
    resolvedHealthWriteService: '0000feea-0000-1000-8000-00805f9b34fb',
    resolvedHealthWrite: '0000fee2-0000-1000-8000-00805f9b34fb',
    resolvedHealthV2Service: null,
    resolvedHealthV2Char: null,
    resolvedHRService: '0000180d-0000-1000-8000-00805f9b34fb',
    resolvedHRChar: '00002a37-0000-1000-8000-00805f9b34fb',
    resolvedBattService: '0000180f-0000-1000-8000-00805f9b34fb',
    resolvedBattChar: '00002a19-0000-1000-8000-00805f9b34fb'
  })
}));
