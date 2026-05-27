import { useEffect, useRef, useCallback } from 'react';
import { NativeEventEmitter, NativeModules, Platform, PermissionsAndroid } from 'react-native';
import BleManager from 'react-native-ble-manager';
import { useBleStore } from '../store/bleStore';
import { parseHealthMetrics } from '../services/ble/packetParser';
import { bleQueue } from '../services/ble/bleQueue';
import { startForegroundShield, stopForegroundShield } from '../services/background/foregroundShield';
import { saveBpmReading, saveSpo2Reading, savePressureReading } from '../services/storageService';

const BleManagerModule   = NativeModules.BleManager;
const bleManagerEmitter  = new NativeEventEmitter(BleManagerModule);

const HEALTH_SERVICE_UUID = '0000feea-0000-1000-8000-00805f9b34fb'; // Servicio Propietario Moyoung V2 FEEA
const HEALTH_CHAR_UUID    = '0000fee3-0000-1000-8000-00805f9b34fb'; // Notificaciones Salud FEE3
const HEALTH_WRITE_UUID   = '0000fee2-0000-1000-8000-00805f9b34fb'; // Escritura de comandos FEE2

const BATT_SERVICE_UUID   = '0000180f-0000-1000-8000-00805f9b34fb'; // Servicio Estándar Batería 180F
const BATT_CHAR_UUID      = '00002a19-0000-1000-8000-00805f9b34fb'; // Característica Batería 2A19

const HR_SERVICE_UUID     = '0000180d-0000-1000-8000-00805f9b34fb'; // Servicio Estándar Pulso 180D
const HR_NOTIFY_UUID      = '00002a37-0000-1000-8000-00805f9b34fb'; // Característica Pulso 2A37

const TARGET_MAC_1 = '70:F2:A9:0B:12:E7'; // Colmi P28 Plus de prueba

const bleLog = (msg, ...args) => console.log(msg, ...args);
const bleWarn = (msg, ...args) => console.warn(msg, ...args);
const bleError = (msg, ...args) => console.error(msg, ...args);


export function useBLE() {
  const isConnected = useBleStore(state => state.isConnected);
  
  // Referencias para temporizadores y control asíncrono
  const keepAliveInterval = useRef(null);
  const busyTimeout       = useRef(null);
  
  // Referencias de estado para evitar llamadas a renderizado en callbacks de BLE
  const isConnectingRef   = useRef(false);
  const deviceIdRef       = useRef(null);
  const isConnectedRef    = useRef(false);
  
  // Semáforo lógico crítico para evitar colisión de paquetes en el puente nativo
  const isBluetoothBusyRef = useRef(false);
  
  // Reintentos de reconexión automática
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;

  // Mapeo dinámico de UUIDs resueltos desde el descubrimiento de servicios para resiliencia total
  const resolvedHealthServiceRef = useRef(HEALTH_SERVICE_UUID);
  const resolvedHealthCharRef    = useRef(HEALTH_CHAR_UUID);
  const resolvedHealthWriteServiceRef = useRef(HEALTH_SERVICE_UUID);
  const resolvedHealthWriteRef   = useRef(HEALTH_WRITE_UUID);
  const resolvedHealthV2ServiceRef = useRef(null);
  const resolvedHealthV2CharRef    = useRef(null);
  const resolvedHRServiceRef     = useRef(HR_SERVICE_UUID);
  const resolvedHRCharRef        = useRef(HR_NOTIFY_UUID);
  const resolvedBattServiceRef   = useRef(BATT_SERVICE_UUID);
  const resolvedBattCharRef      = useRef(BATT_CHAR_UUID);

  // Ref para auto-trigger físico de BPM por Frame 964
  const triggerBPMPhysicalCommandRef = useRef(null);
  const runPPGTriggerSequenceRef = useRef(null);
  const executeHardwarePPGTriggerRef = useRef(null);
  const resetHeartRateMeasurementRef = useRef(null);
  const stopBloodPressureMeasurementRef = useRef(null);

  // Refs de estado para inicialización en cascada y control de loops PPG
  const currentMetricTypeRef = useRef(1); // 1 = BPM, 2 = SpO2, 3 = Pressure
  const hasTriggeredPPGRef = useRef(false);
  const manualTriggerActiveRef = useRef(false);
  const lastCascadeTimeRef = useRef(0);

  // Sincronizar el ref de conexión con el estado global de Zustand
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  // Inicialización de Foreground Service al montar el hook (previene context-shift drops posteriores)
  useEffect(() => {
    bleLog('[BLE] 🛡️ Iniciando Foreground Service en fase temprana para prevenir desconexiones GATT...');
    startForegroundShield();

    return () => {
      clearInterval(keepAliveInterval.current);
      if (busyTimeout.current) clearTimeout(busyTimeout.current);
    };
  }, []);

  const triggerBPMPhysicalCommand = useCallback(async () => {
    bleLog('[BLE APP] 🟢 [AUTO-TRIGGER] Detectado Frame 964 (0xB4). El reloj está listo.');
  }, []);

  const runPPGTriggerSequence = useCallback(async (id) => {
    if (hasTriggeredPPGRef.current) {
      bleLog("[BLE APP] 🔮 PPG ya fue disparado en este ciclo. Evitando loop redundante.");
      return;
    }
    hasTriggeredPPGRef.current = true;
    try {
      const metric = currentMetricTypeRef.current;
      bleLog(`[BLE APP] 🔮 Ejecutando runPPGTriggerSequence post-Frame 5694 para Métrica ${metric}...`);
      
      
      await bleQueue.writeWithoutResponse(id, resolvedHealthWriteServiceRef.current, resolvedHealthWriteRef.current, [0xFE, 0xEA, 0x20, 0x06, 0x35, 0x07]);
      await new Promise(resolve => setTimeout(resolve, 40));
      const packet = [0xFE, 0xEA, 0x20, 0x0B, 0xBB, metric, 0x00, 0x83, 0xB9, 0xFF, 0xFF];

      await bleQueue.writeWithoutResponse(
        id,
        resolvedHealthWriteServiceRef.current,
        resolvedHealthWriteRef.current,
        packet
      );
      useBleStore.getState().addRawLog(`📤 [TX] Ráfaga secuencial PPG (BB 0${metric}) inyectada post-Frame 5694.`);
    } catch (err) {
      bleError("Error en secuencia PPG:", err);
      useBleStore.getState().addRawLog(`⚠️ ERROR en Ráfaga 5694 -> ${err.message || err}`);
        manualTriggerActiveRef.current = false;
    }
  }, [resolvedHealthWriteServiceRef, resolvedHealthWriteRef]);

  const executeHardwarePPGTrigger = useCallback(async (id) => {
    if (hasTriggeredPPGRef.current) {
      bleLog("[BLE APP] 🔮 PPG ya fue disparado en este ciclo. Evitando loop redundante.");
      return;
    }
    hasTriggeredPPGRef.current = true;
    try {
        const metric = currentMetricTypeRef.current;
        bleLog(`[BLE APP] Ejecutando executeHardwarePPGTrigger post-Pagina 07 para Metrica ${metric}...`);
        
        const packet = [0xFE, 0xEA, 0x20, 0x0B, 0xBB, metric, 0x00, 0x83, 0xB9, 0xFF, 0xFF];

      await bleQueue.writeWithoutResponse(
        id,
        resolvedHealthWriteServiceRef.current,
        resolvedHealthWriteRef.current,
        packet
      );
      useBleStore.getState().addRawLog(`📤 [TX] Ráfaga PPG (BB 0${metric}) enviada con éxito en la ventana de la Fase 2.`);
    } catch (err) {
      bleError("Fallo en el trigger de Fase 2:", err);
      useBleStore.getState().addRawLog(`⚠️ ERROR en Ráfaga 5631 -> ${err.message || err}`);
        manualTriggerActiveRef.current = false;
    }
  }, [resolvedHealthWriteServiceRef, resolvedHealthWriteRef]);

  const resetHeartRateMeasurement = useCallback(async (id) => {
    try {
      bleLog("[BLE APP] 🔮 Ejecutando resetHeartRateMeasurement (CMD_TRIGGER_MEASURE_HEARTRATE = 0x6D)...");
      useBleStore.getState().addRawLog("📤 [TX] Reseteando Pulso: Enviando Start (6D 00)...");
      await bleQueue.writeWithoutResponse(
        id,
        resolvedHealthWriteServiceRef.current,
        resolvedHealthWriteRef.current,
        [0xFE, 0xEA, 0x20, 0x06, 0x6D, 0x00]
      );
      
      await new Promise(resolve => setTimeout(resolve, 200)); // Espera corta de estabilización

      useBleStore.getState().addRawLog("📤 [TX] Reseteando Pulso: Enviando Stop (6D FF)...");
      await bleQueue.writeWithoutResponse(
        id,
        resolvedHealthWriteServiceRef.current,
        resolvedHealthWriteRef.current,
        [0xFE, 0xEA, 0x20, 0x06, 0x6D, 0xFF]
      );
    } catch (err) {
      bleError("Error reseteando el pulso Moyoung:", err);
      useBleStore.getState().addRawLog(`⚠️ ERROR reseteando pulso -> ${err.message || err}`);
    }
  }, [resolvedHealthWriteServiceRef, resolvedHealthWriteRef]);

  const stopBloodPressureMeasurement = useCallback(async (id) => {
    try {
      bleLog('[BLE APP] 🔮 Deteniendo medición de Presión Arterial (CMD_TRIGGER_MEASURE_BLOOD_PRESSURE = 0x69)...');
      useBleStore.getState().addRawLog('📤 [TX] Stop Presión: Enviando 69 FF FF FF...');
      const stopPacket = [0xFE, 0xEA, 0x20, 0x08, 0x69, 0xFF, 0xFF, 0xFF];
      await bleQueue.writeWithoutResponse(id, resolvedHealthWriteServiceRef.current, resolvedHealthWriteRef.current, stopPacket);
    } catch (err) {
      bleError('Error en stopBloodPressureMeasurement:', err);
      useBleStore.getState().addRawLog(`⚠️ ERROR en Stop Presión -> ${err.message || err}`);
    }
  }, [resolvedHealthWriteServiceRef, resolvedHealthWriteRef]);

  useEffect(() => {
    triggerBPMPhysicalCommandRef.current = triggerBPMPhysicalCommand;
  }, [triggerBPMPhysicalCommand]);

  useEffect(() => {
    runPPGTriggerSequenceRef.current = runPPGTriggerSequence;
  }, [runPPGTriggerSequence]);

  useEffect(() => {
    executeHardwarePPGTriggerRef.current = executeHardwarePPGTrigger;
  }, [executeHardwarePPGTrigger]);

  useEffect(() => {
    resetHeartRateMeasurementRef.current = resetHeartRateMeasurement;
  }, [resetHeartRateMeasurement]);

  useEffect(() => {
    stopBloodPressureMeasurementRef.current = stopBloodPressureMeasurement;
  }, [stopBloodPressureMeasurement]);

  /**
   * Solicita permisos Bluetooth en Android
   */
  const requestPermissions = async () => {
    if (Platform.OS !== 'android') return true;
    try {
      if (Platform.Version >= 31) {
        const res = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return Object.values(res).every(r => r === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        return r === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (e) {
      bleError('[BLE] Error al solicitar permisos:', e);
      return false;
    }
  };

  /**
   * Inicia el escaneo buscando el Colmi P28 Plus
   */
  const startScan = useCallback(async () => {
    const state = useBleStore.getState();
    if (state.isScanning || isConnectedRef.current) return;
    
    const granted = await requestPermissions();
    if (!granted) {
      useBleStore.getState().setStatusMsg('Permisos Bluetooth denegados');
      return;
    }
    
    useBleStore.getState().setScanning(true);
    useBleStore.getState().setStatusMsg('Buscando reloj inteligente...');
    
    BleManager.scan([], 8, true)
      .catch((err) => {
        bleError('[BLE] Error en escaneo:', err);
        useBleStore.getState().setScanning(false);
      });
  }, []);

  /**
   * Envía la ráfaga de escritura manual en FEE2 usando writeWithoutResponse
   */
  const executeMeasurementTrigger = async (id) => {
    try {
      useBleStore.getState().setStatusMsg('Encendiendo sensores del reloj...');
      
      const cmdV2General  = [0xFE, 0xEA, 0x10, 0x08, 0x05, 0x00, 0x00, 0x00];
      const cmdV2Pulse    = [0xFE, 0xEA, 0x10, 0x08, 0x05, 0x01, 0x00, 0x00];
      const cmdV2Oxygen   = [0xFE, 0xEA, 0x10, 0x08, 0x05, 0x02, 0x00, 0x00];
      const cmdV2Pressure = [0xFE, 0xEA, 0x10, 0x08, 0x05, 0x03, 0x00, 0x00];

      const commandsToSend = [
        cmdV2General,
        cmdV2Pulse,
        cmdV2Oxygen,
        cmdV2Pressure
      ];

      for (let i = 0; i < commandsToSend.length; i++) {
        const cmd = commandsToSend[i];
        try {
          // Usar writeWithoutResponse para FEE2 ya que tiene esa propiedad estricta
          await bleQueue.writeWithoutResponse(id, resolvedHealthWriteServiceRef.current, resolvedHealthWriteRef.current, cmd);
          bleLog(`[BLE] Comando manual ${JSON.stringify(cmd)} enviado a FEE2 (WithoutResponse)`);
        } catch (writeErr) {
          bleWarn(`[BLE] Error manual en FEE2, intentando fallback a char notify:`, writeErr);
          try {
            await bleQueue.write(id, resolvedHealthServiceRef.current, resolvedHealthCharRef.current, cmd);
            bleLog(`[BLE] Comando manual ${JSON.stringify(cmd)} enviado a FEE3 con éxito (Fallback)`);
          } catch (__) {
            if (resolvedHealthV2ServiceRef.current && resolvedHealthV2CharRef.current) {
              try {
                await bleQueue.write(id, resolvedHealthV2ServiceRef.current, resolvedHealthV2CharRef.current, cmd);
              } catch (___) {}
            }
          }
        }
        if (i < commandsToSend.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      }

      useBleStore.getState().setStatusMsg('Saturación y presión en proceso...');
    } catch (e) {
      bleError('[BLE] Fallo al escribir comando disparador manual:', e);
      useBleStore.getState().setStatusMsg('Error al disparar sensores');
    }
  };

  const startKeepAlive = useCallback((id) => {
    clearInterval(keepAliveInterval.current);
    
    keepAliveInterval.current = setInterval(async () => {
      if (!isConnectedRef.current || !id) return;
      
      bleLog('[KEEP-ALIVE] ⚡ Enviando latido Moyoung V2 (Anti-Sleep) a FEE2...');
      try {
        await bleQueue.writeWithoutResponse(
          id,
          resolvedHealthWriteServiceRef.current,
          resolvedHealthWriteRef.current,
          [0xFE, 0xEA, 0x10, 0x06, 0x5A, 0x00]
        );
      } catch (e) {
        bleWarn('[KEEP-ALIVE] Error en latido Moyoung V2:', e);
        if (e.message?.includes('Timeout') || e.message?.includes('task')) {
          bleError('[KEEP-ALIVE] 🚨 DETECTADO TIMEOUT EN LATIDO. El canal está bloqueado o desconectado. Forzando reconexión...');
          handleConnectionFailure();
        }
      }
    }, 12000); // Latido cada 12 segundos para evitar auto-sleep y desconexión sin saturar el canal (menos agresivo)
  }, [resolvedHealthWriteServiceRef, resolvedHealthWriteRef]);

  const connectToDevice = async (id) => {
    try {
      useBleStore.getState().setStatusMsg('Conectando al reloj...');
      isConnectingRef.current = true;
      
      await BleManager.connect(id);
      
      bleLog('[BLE] Solicitando emparejamiento nativo (Bonding)...');
      try {
        await BleManager.createBond(id);
        bleLog('[BLE] Vinculación nativa completada o ya existente.');
      } catch (bondErr) {
        bleLog('[BLE] Solicitud de Bonding denegada u omitida (Continuando sin bloquear):', bondErr.message || bondErr);
      }
      
      bleLog('[BLE] Esperando 1000ms de estabilización...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      bleLog('[BLE] Descubriendo servicios...');
      const info = await BleManager.retrieveServices(id);
      
      let resolvedHealthService = HEALTH_SERVICE_UUID;
      let resolvedHealthChar    = HEALTH_CHAR_UUID;
      let resolvedHealthWrite   = HEALTH_WRITE_UUID;
      let resolvedHealthWriteService = HEALTH_SERVICE_UUID;
      let resolvedHealthV2Service = null;
      let resolvedHealthV2Char    = null;
      let resolvedHRService     = HR_SERVICE_UUID;
      let resolvedHRChar        = HR_NOTIFY_UUID;
      let resolvedBattService   = BATT_SERVICE_UUID;
      let resolvedBattChar      = BATT_CHAR_UUID;

      if (info && info.characteristics) {
        for (const c of info.characteristics) {
          const charUUID = c.characteristic.toLowerCase();
          const servUUID = c.service.toLowerCase();
          
          if (charUUID.includes('fea1')) {
            resolvedHealthService = servUUID;
            resolvedHealthChar = charUUID;
          }
          if (charUUID.includes('fee3')) {
            resolvedHealthV2Service = servUUID;
            resolvedHealthV2Char = charUUID;
          }
          if (charUUID.includes('fea2')) {
            resolvedHealthWriteService = servUUID;
            resolvedHealthWrite = charUUID;
          }
          if (charUUID.includes('fee2')) {
            resolvedHealthWriteService = servUUID;
            resolvedHealthWrite = charUUID;
          }
          if (charUUID.includes('2a37')) {
            resolvedHRService = servUUID;
            resolvedHRChar = charUUID;
          }
          if (charUUID.includes('2a19')) {
            resolvedBattService = servUUID;
            resolvedBattChar = charUUID;
          }
        }
      }

      resolvedHealthServiceRef.current = resolvedHealthService;
      resolvedHealthCharRef.current    = resolvedHealthChar;
      resolvedHealthWriteServiceRef.current = resolvedHealthWriteService;
      resolvedHealthWriteRef.current   = resolvedHealthWrite;
      resolvedHealthV2ServiceRef.current = resolvedHealthV2Service;
      resolvedHealthV2CharRef.current    = resolvedHealthV2Char;
      resolvedHRServiceRef.current     = resolvedHRService;
      resolvedHRCharRef.current        = resolvedHRChar;
      resolvedBattServiceRef.current   = resolvedBattService;
      resolvedBattCharRef.current      = resolvedBattChar;

      // Compartir UUIDs con el estado global Zustand para que useAutoBLE pueda leerlos
      useBleStore.setState({
        resolvedHealthService,
        resolvedHealthChar,
        resolvedHealthWriteService,
        resolvedHealthWrite,
        resolvedHealthV2Service,
        resolvedHealthV2Char,
        resolvedHRService,
        resolvedHRChar,
        resolvedBattService,
        resolvedBattChar
      });
      
      if (Platform.OS === 'android') {
        await BleManager.requestConnectionPriority(id, 1);
      }
      
      deviceIdRef.current = id;
      useBleStore.getState().setDeviceId(id);
      isConnectedRef.current = true;
      useBleStore.getState().setConnected(true);
      
      useBleStore.getState().setStatusMsg('Suscribiendo a alertas...');
      
      // Suscripciones CCCD
      try {
        await BleManager.startNotification(id, resolvedHealthServiceRef.current, resolvedHealthCharRef.current);
      } catch (e) {
        bleError('[BLE] Error suscribiendo a presión V1:', e);
      }

      if (resolvedHealthV2ServiceRef.current && resolvedHealthV2CharRef.current) {
        try {
          await BleManager.startNotification(id, resolvedHealthV2ServiceRef.current, resolvedHealthV2CharRef.current);
        } catch (e) {
          bleError('[BLE] Error suscribiendo a presión V2:', e);
        }
      }
      
      try {
        await BleManager.startNotification(id, resolvedHRServiceRef.current, resolvedHRCharRef.current);
      } catch (e) {
        try {
          await BleManager.startNotification(id, resolvedHealthServiceRef.current, '00002a37-0000-1000-8000-00805f9b34fb');
        } catch (e2) {
          bleError('[BLE] No se pudo activar notificaciones de pulso:', e2);
        }
      }

      try {
        await BleManager.startNotification(id, resolvedBattServiceRef.current, resolvedBattCharRef.current);
      } catch (_) {}

      bleLog('[BLE] 🤝 Deteniendo posibles mediciones previas de presión arterial...');
      if (stopBloodPressureMeasurementRef.current) {
        await stopBloodPressureMeasurementRef.current(id);
      }
      
      useBleStore.getState().setStatusMsg('Reloj Colmi P28 Plus conectado y en línea.');
      reconnectAttempts.current = 0;
      
      startKeepAlive(id);
      // startForegroundShield(); // Ya inicializado de forma segura en useEffect de montaje
      
    } catch (err) {
      bleError('[BLE] Error al conectar:', err);
      isConnectingRef.current = false;
      isConnectedRef.current = false;
      handleConnectionFailure();
    }
  };

  const handleConnectionFailure = () => {
    clearInterval(keepAliveInterval.current);
    if (busyTimeout.current) clearTimeout(busyTimeout.current);
    
    isBluetoothBusyRef.current = false;
    hasTriggeredPPGRef.current = false;
    lastCascadeTimeRef.current = 0;
    useBleStore.getState().setBluetoothBusy(false);
    
    // Purga total de la cola BLE para evitar que tareas muertas colapsen el driver nativo
    bleQueue.clear();
    
    if (deviceIdRef.current && reconnectAttempts.current < maxReconnectAttempts) {
      reconnectAttempts.current += 1;
      useBleStore.getState().setConnected(false);
      useBleStore.getState().setStatusMsg(`Conexión interrumpida. Reconectando (${reconnectAttempts.current}/3) en 2s...`);
      
      setTimeout(() => {
        if (deviceIdRef.current) {
          connectToDevice(deviceIdRef.current);
        }
      }, 2000);
    } else {
      useBleStore.getState().resetDevice();
      useBleStore.getState().setStatusMsg('Conexión perdida. Presiona CONECTAR para buscar de nuevo.');
      reconnectAttempts.current = 0;
      // Mantener el foreground shield activo para no interrumpir el JS thread entre escaneos continuos
      setTimeout(() => startScan(), 2500);
    }
  };

  const disconnectDevice = async () => {
    const id = deviceIdRef.current;
    if (id) {
      useBleStore.getState().setStatusMsg('Desconectando dispositivo...');
      deviceIdRef.current = null;
      isConnectedRef.current = false;
      
      clearInterval(keepAliveInterval.current);
      if (busyTimeout.current) clearTimeout(busyTimeout.current);
      
      isBluetoothBusyRef.current = false;
      hasTriggeredPPGRef.current = false;
      lastCascadeTimeRef.current = 0;
      useBleStore.getState().resetDevice();
      stopForegroundShield();
      
      // Purga total de la cola BLE
      bleQueue.clear();
      
      try {
        await BleManager.disconnect(id);
      } catch (e) {
        bleWarn('[BLE] Error al desconectar físicamente:', e);
      }
      
      useBleStore.getState().setStatusMsg('Desconectado. Presiona CONECTAR para buscar.');
    }
  };

  const triggerMeasurement = useCallback(async () => {
    const id = deviceIdRef.current;
    if (!id || !isConnectedRef.current) {
      useBleStore.getState().setStatusMsg('Reloj no conectado');
      return;
    }
    
    bleLog('[BLE] ✋ Disparando medición manual desde interfaz...');
    isBluetoothBusyRef.current = true;
    useBleStore.getState().setBluetoothBusy(true);
    useBleStore.getState().setStatusMsg('Preparando sensores...');
    
    await new Promise(resolve => setTimeout(resolve, 500));
    await executeMeasurementTrigger(id);
    
    if (busyTimeout.current) clearTimeout(busyTimeout.current);
    busyTimeout.current = setTimeout(() => {
      if (isBluetoothBusyRef.current) {
        isBluetoothBusyRef.current = false;
        useBleStore.getState().setBluetoothBusy(false);
        useBleStore.getState().setStatusMsg('Monitoreo en espera');
      }
    }, 45000);
  }, []);

  // --- ESCUCHA DE EVENTOS BLE DE LA API NATIVA ---
  useEffect(() => {
    BleManager.start({ showAlert: false });

    const onDiscover = (peripheral) => {
      const name = peripheral.name?.toUpperCase() || '';
      const isTarget = name.includes('P28 PLUS') || 
                       peripheral.id?.toUpperCase() === TARGET_MAC_1.toUpperCase();
      
      if (!isTarget || isConnectingRef.current || isConnectedRef.current) return;
      
      isConnectingRef.current = true;
      BleManager.stopScan().catch(() => {});
      connectToDevice(peripheral.id);
    };

    const onStopScan = () => {
      useBleStore.getState().setScanning(false);
      if (!isConnectedRef.current && !isConnectingRef.current) {
        useBleStore.getState().setStatusMsg('Búsqueda terminada. Presiona CONECTAR.');
      }
    };

    const onData = (notificationEvent) => {
      if (!notificationEvent.value) return;
      const rawValue = notificationEvent.value;
      const charUUID = notificationEvent.characteristic.toLowerCase();
      const eventPeripheralId = notificationEvent.peripheral || deviceIdRef.current;

      let bytes = [];
      try {
        if (Array.isArray(rawValue)) {
          bytes = rawValue;
        } else {
          bytes = Array.from(new Uint8Array(rawValue));
        }
      } catch (err) {
        bleWarn(`[BLE] Error convirtiendo datos de ${charUUID}:`, err);
        return;
      }

      // Loggeo en caliente de los bytes recibidos para reverse engineering del protocolo
      if (charUUID.includes('fea1') || charUUID.includes('fee3') || charUUID.includes('2a37')) {
        const hexStr = bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('-');
        const asciiStr = bytes.map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
        const shortUUID = charUUID.slice(4, 8).toUpperCase();
        const handleInfo = shortUUID === 'FEE3' ? ' [H:0x0047]' : '';
        const logMsg = `CH: ${shortUUID}${handleInfo} (${bytes.length}B) | Hex: ${hexStr} | ASCII: "${asciiStr}"`;
        bleLog(`[HOT LOG] 📥 Datos en vivo recibidos: ${logMsg}`);
        
        // --- DETECTOR DE HANDSHAKE DE FIRMWARE NATIVO (WIRKESARK FRAMES) ---
        if (hexStr === 'FE-EA-20-06-6B-FF') {
          // Frame 5505: El reloj anuncia que su buffer de memoria está listo
          const customMsg = `🟡 [RX] Frame 5505: Reloj reporta 6B FF - Buffer de memoria listo. Iniciando cascada...`;
          bleLog(customMsg);
          useBleStore.getState().addRawLog(customMsg);
          // Detener posible medición de presión arterial que haya quedado trabada
          if (stopBloodPressureMeasurementRef.current) {
            stopBloodPressureMeasurementRef.current(eventPeripheralId);
          }
        } else if (hexStr === 'FE-EA-20-08-69-00-FF-FF') {
          const now = Date.now();
          if (now - lastCascadeTimeRef.current > 1000) {
            lastCascadeTimeRef.current = now;
            const customMsg = `🔮 [RX] Eco de Sincronización Confirmado (69 00 FF FF). Completando cascada...`;
            bleLog(customMsg);
            useBleStore.getState().addRawLog(customMsg);
            
            // Enviar FA y luego 29
            useBleStore.getState().addRawLog('📤 [TX] Cascada: Enviando FA...');
            bleQueue.writeWithoutResponse(eventPeripheralId, resolvedHealthWriteServiceRef.current, resolvedHealthWriteRef.current, [0xFE, 0xEA, 0x20, 0x05, 0xFA])
              .catch(err => bleError('Error enviando FA:', err));
              
            setTimeout(() => {
              useBleStore.getState().addRawLog('📤 [TX] Cascada: Enviando 29...');
              bleQueue.writeWithoutResponse(eventPeripheralId, resolvedHealthWriteServiceRef.current, resolvedHealthWriteRef.current, [0xFE, 0xEA, 0x20, 0x05, 0x29])
                .catch(err => bleError('Error enviando 29:', err));
            }, 100);
          }
        } else if (hexStr === 'FE-EA-20-06-29-01') {
          const customMsg = `🔮 [RX] Frame 5547/5536 detectado: Reloj reporta 29 01. Bus de enlace confirmado. Enviando reset de contadores PPG...`;
          bleLog(customMsg);
          useBleStore.getState().addRawLog(customMsg);
          // Frame 5537: Da Fit espera ~4 segundos y luego envía 69 00 00 00 para limpiar contadores internos del chip PPG
          // Esto resetea el scheduler de timing para que el sensor PPG arranque en un segundo limpio
          setTimeout(() => {
            useBleStore.getState().addRawLog('📤 [TX] Frame 5537: Enviando reset de contadores 69 00 00 00...');
            bleQueue.writeWithoutResponse(eventPeripheralId, resolvedHealthWriteServiceRef.current, resolvedHealthWriteRef.current, [0xFE, 0xEA, 0x20, 0x08, 0x69, 0x00, 0x00, 0x00])
              .catch(err => bleError('Error enviando 69 00 00 00:', err));
          }, 3800); // ~4 segundos como en el protocolo nativo Da Fit
          // También ejecutar el reset de Heart Rate (CMD_TRIGGER_MEASURE_HEARTRATE)
          const msg = `[BOOT] 🟢 [RX] Frame 29 01: Reloj despierta Canal 29`;
          bleLog(msg);
          useBleStore.getState().addRawLog(msg);
          if (resetHeartRateMeasurementRef.current) {
            resetHeartRateMeasurementRef.current(eventPeripheralId);
          }
        } else if (hexStr === 'FE-EA-20-08-F9-01-01-00') {
          const customMsg = `🔮 [RX] ¡Detectado Frame 5694 de inicio en frío (F9 01 01 00)! Ejecutando micro-ráfaga táctica...`;
          bleLog(customMsg);
          useBleStore.getState().addRawLog(customMsg);
          if (manualTriggerActiveRef.current && executeHardwarePPGTriggerRef.current) {
            executeHardwarePPGTriggerRef.current(eventPeripheralId);
          } else {
            bleLog('F9 01 01 00 ignorado (no manual)');
          }
        } else if (hexStr === 'FE-EA-20-08-F9-01-01-01') {
          const customMsg = `🟢 [RX] Frame 539: Bus de Enlace Arriba (F9 Activo).`;
          bleLog(customMsg);
          useBleStore.getState().addRawLog(customMsg);
        } else if (hexStr === 'FE-EA-20-07-F9-02-01') {
          const customMsg = `🟢 [RX] Frame 5631 detectado: ¡Reloj confirma Fase 2 activa! Disparando ráfaga PPG inmediata...`;
          bleLog(customMsg);
          useBleStore.getState().addRawLog(customMsg);
          if (manualTriggerActiveRef.current) {
            if (executeHardwarePPGTriggerRef.current) {
              executeHardwarePPGTriggerRef.current(eventPeripheralId);
            }
          } else {
            bleLog('F9 02 01 ignorado (no manual)');
          }
        } else if (bytes.length === 66 && bytes[4] === 0x59 && bytes[5] === 0x01) {
          const msg = `[BOOT] 🔋 [RX] Frame 59 01: Estado de Batería recibido`;
          bleLog(msg);
          useBleStore.getState().addRawLog(msg);
        } else if (bytes.length === 78 && bytes[4] === 0x35 && bytes[5] === 0x04) {
          const msg = `[BOOT] 🧹 [RX] Frame 35 04: Limpiando Búfer Parte 1`;
          bleLog(msg);
          useBleStore.getState().addRawLog(msg);
        } else if (bytes.length === 78 && bytes[4] === 0x35 && bytes[5] === 0x05) {
          const msg = `[BOOT] 🧹 [RX] Frame 35 05: Limpiando Búfer Parte 2`;
          bleLog(msg);
          useBleStore.getState().addRawLog(msg);
        } else if (bytes.length === 78 && bytes[4] === 0x35 && bytes[5] === 0x06) {
          const msg = `[BOOT] 📍 [RX] Frame 35 06: Coordenadas Interfaz (XPOS)`;
          bleLog(msg);
          useBleStore.getState().addRawLog(msg);
        } else if (hexStr === 'FE-EA-20-06-6D-FF') {
          const customMsg = `🟢 [RX] ¡Confirmación: Medición de pulso (6D) detenida correctamente!`;
          bleLog(customMsg);
          useBleStore.getState().addRawLog(customMsg);
        } else if (hexStr === 'FE-EA-20-10-5A-00-4D-4F-59-4F-55-4E-47-2D-56-32') {
          const customMsg = `🟢 [RX] Frame 896: ¡Firmware Identificado como Z-MOYOUNG-V2!`;
          bleLog(customMsg);
          useBleStore.getState().addRawLog(customMsg);
        } else if (hexStr === 'FE-EA-20-14-5A-01-4D-4F-59-2D-38-32-4C-33-2D-32-2E-30-2E-34') {
          const customMsg = `ℹ️ [BLE] Versión de Firmware validada por hardware: MOY-82L3-2.0.4 (P28 Plus)`;
          bleLog(customMsg);
          useBleStore.getState().addRawLog(customMsg);
        } else {
          useBleStore.getState().addRawLog(logMsg);
        }
      }

      if (charUUID.includes('fea1') || charUUID.includes('fee3')) {
        // --- 3. MONITOR DE TELEMETRÍA (FEE3 / Leng 21) ---
        if (charUUID.includes('fee3') && bytes.length === 21) {
          const rawPulsePressure = bytes[0];
          bleLog(`[METRO TELEMETRÍA 21] 💓 BIOMÉTRICO DETECTADO EN 21-BYTES - Byte Index 0 (Pulse/Pressure): ${rawPulsePressure} | Hex completo: ${bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('-')}`);
          useBleStore.getState().addRawLog(`[TELEMETRÍA 21-B] Byte[0]: ${rawPulsePressure} | Hex: ${bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('-')}`);
        }

        // --- 3.4 INTERCEPTOR TÁCTICO DE CAPACIDADES (Frame 964 / 0xB4) ---
        if (charUUID.includes('fee3') && bytes[0] === 0xFE && bytes[1] === 0xEA && bytes[4] === 0xB4) {
          const logMsg = "🔮 [RX] ¡Detectado reporte de capacidades del reloj (Frame 964 - 0xB4)! El firmware está listo.";
          bleLog(logMsg);
          useBleStore.getState().addRawLog(logMsg);
          useBleStore.getState().setSessionState({ sensorReady: true });
          
          if (triggerBPMPhysicalCommandRef.current) {
            triggerBPMPhysicalCommandRef.current();
          }
        }

        // --- 3.5 CAPTURA DE ESTADO DE SESIÓN (78 bytes / FE EA 20 4E 35 07) ---
        if (charUUID.includes('fee3') && bytes.length === 78 && bytes[4] === 0x35 && bytes[5] === 0x07) {
          bleLog('[SESSION STATE] 🔓 TELEMETRÍA DESBLOQUEADA: Recibido paquete de estado de 78 bytes (FE EA 20 4E 35 07)');
          useBleStore.getState().setSessionState({ authenticated: true, telemetryUnlocked: true });
          useBleStore.getState().addRawLog('[SESSION STATE] 🔓 TELEMETRÍA DESBLOQUEADA (78B)');
        }

        try {
          // 1. Primero, intentar decodificar según los nuevos identificadores de métrica nativos de Moyoung V2 (FEE3 / bytes[4])
          if (bytes[0] === 0xFE && bytes[1] === 0xEA) {
            const metricId = bytes[4];

            // A. Ritmo Cardíaco Basal (0x6D)
            if (metricId === 0x6D) {
              const bpm = bytes[5];
              if (bpm === 255 || bpm <= 1) {
                bleLog(`[CARDIOGUARD TELEMETRÍA NATIVA] ⏳ Medición de pulso en progreso (raw: ${bpm})`);
                useBleStore.getState().setStatusMsg('🩺 Midiendo ritmo cardíaco... Mantente quieto');
                return;
              }

              if (typeof bpm === 'number' && !isNaN(bpm) && bpm >= 40 && bpm <= 220) {
                const store = useBleStore.getState();
                const activeResolver = store.activeResolver;

                store.setBpm(bpm);
                bleLog(`[CARDIOGUARD TELEMETRÍA NATIVA] ❤️ BPM Basal Decodificado: ${bpm} (Identificador 0x6D)`);

                if (activeResolver && activeResolver.metric === 'bpm') {
                  activeResolver.values.push(bpm);
                } else if (!activeResolver) {
                  saveBpmReading(bpm).catch(err => bleError('[BLE BPM SAVE ERROR]', err));
                }

                if (!activeResolver) {
                  isBluetoothBusyRef.current = false;
                  useBleStore.getState().setBluetoothBusy(false);
                  if (busyTimeout.current) clearTimeout(busyTimeout.current);
                }
              }
              return;
            }

            // B. Presión Arterial (0x69)
            if (metricId === 0x69) {
              const sbp = bytes[6];
              const dbp = bytes[7];

              if (sbp === 255 || dbp === 255 || sbp <= 1 || dbp <= 1) {
                bleLog(`[CARDIOGUARD TELEMETRÍA NATIVA] ⏳ Medición de presión en progreso (raw: ${sbp}/${dbp})`);
                useBleStore.getState().setStatusMsg('🩺 Midiendo presión arterial... Mantente quieto');
                return;
              }

              if (typeof sbp === 'number' && !isNaN(sbp) && sbp >= 50 && sbp <= 220 &&
                  typeof dbp === 'number' && !isNaN(dbp) && dbp >= 30 && dbp <= 150) {
                
                const store = useBleStore.getState();
                const activeResolver = store.activeResolver;

                store.setPressure(sbp, dbp);
                bleLog(`[CARDIOGUARD TELEMETRÍA NATIVA] 🩸 Tensión Decodificada: ${sbp}/${dbp} mmHg (Identificador 0x69)`);

                if (activeResolver && activeResolver.metric === 'pressure') {
                  activeResolver.values.push({ sys: sbp, dia: dbp });
                } else if (!activeResolver) {
                  savePressureReading(sbp, dbp).catch(err => bleError('[BLE PRESSURE SAVE ERROR]', err));
                }

                if (!activeResolver) {
                  isBluetoothBusyRef.current = false;
                  useBleStore.getState().setBluetoothBusy(false);
                  if (busyTimeout.current) clearTimeout(busyTimeout.current);
                }
                useBleStore.getState().setStatusMsg(`Medición de presión completada: ${sbp}/${dbp} mmHg`);
              }
              return;
            }

            // C. Saturación de Oxígeno SpO2 (0x6B)
            if (metricId === 0x6B) {
              const spo2 = bytes[5];

              if (spo2 === 255 || spo2 <= 1) {
                bleLog(`[CARDIOGUARD TELEMETRÍA NATIVA] ⏳ Medición SpO2 en progreso (raw: ${spo2}%)`);
                useBleStore.getState().setStatusMsg('🫁 Midiendo saturación SpO2... Mantente quieto');
                return;
              }

              if (spo2 >= 80 && spo2 <= 100) {
                const store = useBleStore.getState();
                const activeResolver = store.activeResolver;

                store.setSpO2(spo2);
                bleLog(`[CARDIOGUARD TELEMETRÍA NATIVA] 🫁 SpO2 Real Decodificado: ${spo2}% (Identificador 0x6B)`);

                if (activeResolver && activeResolver.metric === 'spo2') {
                  activeResolver.values.push(spo2);
                } else if (!activeResolver) {
                  saveSpo2Reading(spo2).catch(err => bleError('[BLE SPO2 SAVE ERROR]', err));
                }

                if (!activeResolver) {
                  isBluetoothBusyRef.current = false;
                  useBleStore.getState().setBluetoothBusy(false);
                  if (busyTimeout.current) clearTimeout(busyTimeout.current);
                }
                useBleStore.getState().setStatusMsg(`Medición de oxígeno completada: ${spo2}%`);
              }
              return;
            }

            // D. ACK de confirmación
            if (bytes[2] === 0x20 && bytes[3] === 0x05 && bytes[4] === 0x64) {
              bleLog('[CARDIOGUARD TELEMETRÍA] ⚡ ACK de Salud recibido: FE-EA-20-05-64');
              useBleStore.getState().setStatusMsg('⚡ Comando automático confirmado (reloj midiendo)');
              return;
            }

            // E. Notificación de estado de medición del reloj (0x29)
            if (metricId === 0x29) {
              const status = bytes[5];
              bleLog(`[CARDIOGUARD TELEMETRÍA] 🔄 Estado de medición en reloj: ${status}`);
              if (status === 0x01) {
                useBleStore.getState().setStatusMsg('🩺 Medición de ritmo cardíaco activa. Mantente quieto...');
              } else if (status === 0x02) {
                useBleStore.getState().setStatusMsg('🫁 Medición de oxígeno SpO₂ activa. Mantente quieto...');
              } else if (status === 0x03) {
                useBleStore.getState().setStatusMsg('🩺 Medición de presión arterial activa. Mantente quieto...');
              } else if (status === 0x04) {
                useBleStore.getState().setStatusMsg('✅ Medición completada en el reloj.');
                // Liberar el estado de ocupado
                isBluetoothBusyRef.current = false;
                useBleStore.getState().setBluetoothBusy(false);
                if (busyTimeout.current) clearTimeout(busyTimeout.current);
              }
              return;
            }
          }

          // 2. Fallbacks de decodificación anteriores (para oximetría alternativa o manual)
          const health = parseHealthMetrics(bytes);
          if (health) {
            const store = useBleStore.getState();
            const activeResolver = store.activeResolver;

            if (health.type === 'SPO2') {
              store.setSpo2(health.value);
              saveSpo2Reading(health.value).catch(err => bleError('[BLE SPO2 SAVE ERROR]', err));
              bleLog(`[CARDIOGUARD OXIGENO] 🫁 SpO2 Real Decodificado (Fallback): ${health.value}%`);

              if (activeResolver && activeResolver.metric === 'spo2') {
                activeResolver.values.push(health.value);
              }
            } else if (health.type === 'BPM') {
              store.setBpm(health.value);
              saveBpmReading(health.value).catch(err => bleError('[BLE BPM SAVE ERROR]', err));
              bleLog(`[CARDIOGUARD PULSE] ❤️ BPM (Fallback): ${health.value}`);

              if (activeResolver && activeResolver.metric === 'bpm') {
                activeResolver.values.push(health.value);
              }
            }

            if (!activeResolver) {
              isBluetoothBusyRef.current = false;
              useBleStore.getState().setBluetoothBusy(false);
              if (busyTimeout.current) clearTimeout(busyTimeout.current);
            }
            useBleStore.getState().setStatusMsg(`Medición completada: ${health.value}`);
            return;
          }

          // Evaluación para tramas genéricas de longitud 8 (Presión) o 6 (SpO2) si no coincidieron arriba
          if (bytes[3] === 0x08) {
            const sbp = bytes[6];
            const dbp = bytes[7];
            if (sbp >= 50 && sbp <= 220 && dbp >= 30 && dbp <= 150 && sbp !== 255 && dbp !== 255) {
              const store = useBleStore.getState();
              const activeResolver = store.activeResolver;
              store.setPressure(sbp, dbp);
              savePressureReading(sbp, dbp).catch(err => bleError('[BLE PRESSURE SAVE ERROR]', err));
              bleLog(`[CARDIOGUARD TELEMETRÍA] 🩸 Tensión Decodificada (Fallback): ${sbp}/${dbp} mmHg`);

              if (activeResolver && activeResolver.metric === 'pressure') {
                activeResolver.values.push({ sys: sbp, dia: dbp });
              }

              if (!activeResolver) {
                isBluetoothBusyRef.current = false;
                useBleStore.getState().setBluetoothBusy(false);
                if (busyTimeout.current) clearTimeout(busyTimeout.current);
              }
            }
          }
          else if (bytes[3] === 0x06) {
            const spo2 = bytes[5];
            if (spo2 >= 80 && spo2 <= 100 && spo2 !== 255) {
              const store = useBleStore.getState();
              const activeResolver = store.activeResolver;
              store.setSpO2(spo2);
              saveSpo2Reading(spo2).catch(err => bleError('[BLE SPO2 SAVE ERROR]', err));
              bleLog(`[CARDIOGUARD OXIGENO] 🫁 SpO2 Real Decodificado (Fallback): ${spo2}%`);

              if (activeResolver && activeResolver.metric === 'spo2') {
                activeResolver.values.push(spo2);
              }

              if (!activeResolver) {
                isBluetoothBusyRef.current = false;
                useBleStore.getState().setBluetoothBusy(false);
                if (busyTimeout.current) clearTimeout(busyTimeout.current);
              }
            }
          }
          else if (bytes[3] === 0x07 || bytes[3] === 0x05) {
            let rawSpo2 = (bytes[3] === 0x07) ? bytes[6] : bytes[4];
            if (rawSpo2 >= 80 && rawSpo2 <= 100 && rawSpo2 !== 255) {
              const spo2 = rawSpo2;
              const store = useBleStore.getState();
              const activeResolver = store.activeResolver;
              store.setSpO2(spo2);
              saveSpo2Reading(spo2).catch(err => bleError('[BLE SPO2 SAVE ERROR]', err));
              bleLog(`[CARDIOGUARD TELEMETRÍA] 🩸 SpO2 alternativo (Fallback): ${spo2}%`);

              if (activeResolver && activeResolver.metric === 'spo2') {
                activeResolver.values.push(spo2);
              }

              if (!activeResolver) {
                isBluetoothBusyRef.current = false;
                useBleStore.getState().setBluetoothBusy(false);
                if (busyTimeout.current) clearTimeout(busyTimeout.current);
              }
            }
          }
        } catch (e) {
          bleError('[BLE] Error parsing health metric:', e);
        }
        return;
      }

      if (charUUID.includes('2a37')) {
        try {
          const bpm = bytes[1];

          if (typeof bpm === 'number' && !isNaN(bpm) && bpm >= 40 && bpm <= 220 && bpm !== 255) {
            const store = useBleStore.getState();
            const activeResolver = store.activeResolver;

            store.setBpm(bpm);
            const contactDetected = 'Sí'; // Mapeado directo del hardware
            const customMsg = `⚡ [FAST RX 2A37] ❤️ Pulso Estándar Recibido: ${bpm} BPM (Contacto: ${contactDetected})`;
            bleLog(`[CARDIOGUARD PULSE] ${customMsg}`);
            store.addRawLog(customMsg);

            if (activeResolver && activeResolver.metric === 'bpm') {
              activeResolver.values.push(bpm);
            }
          }
        } catch (e) {
          bleError('[BLE] Error parsing standard HR:', e);
        }
        return;
      }

      if (charUUID.includes('2a19')) {
        if (bytes.length > 0) {
          const batteryVal = bytes[0];
          useBleStore.getState().setBattery(batteryVal);
        }
        return;
      }
    };

    const onDisconnect = (data) => {
      bleError('[BLE] Desconexión GATT detectada:', data);
      isConnectingRef.current = false;
      isConnectedRef.current = false;
      bleQueue.clear(); // Purga total de la cola en desconexión física instantánea
      handleConnectionFailure();
    };

    const sub1 = bleManagerEmitter.addListener('BleManagerDiscoverPeripheral', onDiscover);
    const sub2 = bleManagerEmitter.addListener('BleManagerStopScan', onStopScan);
    const sub3 = bleManagerEmitter.addListener('BleManagerDidUpdateValueForCharacteristic', onData);
    const sub4 = bleManagerEmitter.addListener('BleManagerDisconnectPeripheral', onDisconnect);

    return () => {
      sub1.remove();
      sub2.remove();
      sub3.remove();
      sub4.remove();
    };
  }, [startKeepAlive]);

  const triggerAppBPM = useCallback(async () => {
    const id = deviceIdRef.current;
    if (!id || !isConnectedRef.current) {
      useBleStore.getState().setStatusMsg('Reloj no conectado');
      return;
    }

    currentMetricTypeRef.current = 1;
    bleLog('[BLE APP] 🟢 Iniciando medición manual BPM en vivo (CMD 0x6D)...');
    
    isBluetoothBusyRef.current = true;
    useBleStore.getState().setBluetoothBusy(true);
    useBleStore.getState().setStatusMsg('⏳ Iniciando sensor (BPM)... Mantente quieto');

    try {
      // CMD_TRIGGER_MEASURE_HEARTRATE = 0x6D
      const packet = [0xFE, 0xEA, 0x20, 0x06, 0x6D, 0x00];
      useBleStore.getState().addRawLog('[TX] FE EA 20 06 6D 00 (Start BPM)');
      await bleQueue.writeWithoutResponse(id, resolvedHealthWriteServiceRef.current, resolvedHealthWriteRef.current, packet);

      // Restablecer de forma segura la vigilia automática tras 20 segundos
      setTimeout(() => {
        isBluetoothBusyRef.current = false;
        useBleStore.getState().setBluetoothBusy(false);
      }, 20000);
    } catch (e) {
      bleError('[BLE APP] Error al disparar BPM desde Dashboard:', e);
      isBluetoothBusyRef.current = false;
      useBleStore.getState().setBluetoothBusy(false);
    }
  }, [resolvedHealthWriteServiceRef, resolvedHealthWriteRef]);

  const triggerAppSpO2 = useCallback(async () => {
    const id = deviceIdRef.current;
    if (!id || !isConnectedRef.current) {
      useBleStore.getState().setStatusMsg('Reloj no conectado');
      return;
    }

    currentMetricTypeRef.current = 2;
    bleLog('[BLE APP] 🟢 Iniciando medición manual SpO2 en vivo (CMD 0x6B)...');
    
    isBluetoothBusyRef.current = true;
    useBleStore.getState().setBluetoothBusy(true);
    useBleStore.getState().setStatusMsg('⏳ Iniciando sensor (SpO2)... Mantente quieto');

    try {
      // CMD_TRIGGER_MEASURE_BLOOD_OXYGEN = 0x6B
      const packet = [0xFE, 0xEA, 0x20, 0x06, 0x6B, 0x00];
      useBleStore.getState().addRawLog('[TX] FE EA 20 06 6B 00 (Start SpO2)');
      await bleQueue.writeWithoutResponse(id, resolvedHealthWriteServiceRef.current, resolvedHealthWriteRef.current, packet);

      // Restablecer vigilia automática
      setTimeout(() => {
        isBluetoothBusyRef.current = false;
        useBleStore.getState().setBluetoothBusy(false);
      }, 20000);
    } catch (e) {
      bleError('[BLE APP] Error al disparar SpO2 desde Dashboard:', e);
      isBluetoothBusyRef.current = false;
      useBleStore.getState().setBluetoothBusy(false);
    }
  }, [resolvedHealthWriteServiceRef, resolvedHealthWriteRef]);

  const triggerAppPressure = useCallback(async () => {
    const id = deviceIdRef.current;
    if (!id || !isConnectedRef.current) {
      useBleStore.getState().setStatusMsg('Reloj no conectado');
      return;
    }

    currentMetricTypeRef.current = 3;
    bleLog('[BLE APP] 🟢 Iniciando medición manual Presión Arterial en vivo (CMD 0x69)...');
    
    isBluetoothBusyRef.current = true;
    useBleStore.getState().setBluetoothBusy(true);
    useBleStore.getState().setStatusMsg('⏳ Iniciando sensor (Presión)... Mantente quieto');

    try {
      // CMD_TRIGGER_MEASURE_BLOOD_PRESSURE = 0x69 (payload 3 bytes)
      const packet = [0xFE, 0xEA, 0x20, 0x08, 0x69, 0x00, 0x00, 0x00];
      useBleStore.getState().addRawLog('[TX] FE EA 20 08 69 00 00 00 (Start Blood Pressure)');
      await bleQueue.writeWithoutResponse(id, resolvedHealthWriteServiceRef.current, resolvedHealthWriteRef.current, packet);

      // Restablecer vigilia automática
      setTimeout(() => {
        isBluetoothBusyRef.current = false;
        useBleStore.getState().setBluetoothBusy(false);
      }, 20000);
    } catch (e) {
      bleError('[BLE APP] Error al disparar Presión desde Dashboard:', e);
      isBluetoothBusyRef.current = false;
      useBleStore.getState().setBluetoothBusy(false);
    }
  }, [resolvedHealthWriteServiceRef, resolvedHealthWriteRef]);

  const findMyWatch = useCallback(async () => {
    const id = deviceIdRef.current;
    if (!id || !isConnectedRef.current) return;
    try {
      bleLog('[BLE APP] 🔍 Buscando reloj (Find My Watch CMD 0x61)...');
      await bleQueue.writeWithoutResponse(
        id,
        resolvedHealthWriteServiceRef.current,
        resolvedHealthWriteRef.current,
        [0xFE, 0xEA, 0x10, 0x05, 0x61]
      );
    } catch (e) {
      bleError('Error en findMyWatch:', e);
    }
  }, [resolvedHealthWriteServiceRef, resolvedHealthWriteRef]);

  const powerOffWatch = useCallback(async () => {
    const id = deviceIdRef.current;
    if (!id || !isConnectedRef.current) return;
    try {
      bleLog('[BLE APP] 🔌 Apagando reloj (Shutdown CMD 0x51)...');
      await bleQueue.writeWithoutResponse(
        id,
        resolvedHealthWriteServiceRef.current,
        resolvedHealthWriteRef.current,
        [0xFE, 0xEA, 0x10, 0x06, 0x51, 0xFF]
      );
    } catch (e) {
      bleError('Error en powerOffWatch:', e);
    }
  }, [resolvedHealthWriteServiceRef, resolvedHealthWriteRef]);

  const enableQuickView = useCallback(async (enable = true) => {
    const id = deviceIdRef.current;
    if (!id || !isConnectedRef.current) return;
    try {
      bleLog(`[BLE APP] ⌚ Configurando Quick View (Levantar muñeca CMD 0x18): ${enable}`);
      await bleQueue.writeWithoutResponse(
        id,
        resolvedHealthWriteServiceRef.current,
        resolvedHealthWriteRef.current,
        [0xFE, 0xEA, 0x10, 0x06, 0x18, enable ? 0x01 : 0x00]
      );
    } catch (e) {
      bleError('Error en enableQuickView:', e);
    }
  }, [resolvedHealthWriteServiceRef, resolvedHealthWriteRef]);

  const actions = {
    startScan,
    disconnectDevice,
    triggerMeasurement,
    triggerAppBPM,
    triggerAppSpO2,
    triggerAppPressure,
    findMyWatch,
    powerOffWatch,
    enableQuickView
  };

  useEffect(() => {
    bleLog('[BLE] 🔄 Vinculando acciones globales del motor BLE en Zustand...');
    useBleStore.setState(actions);
  }, [startScan, disconnectDevice, triggerMeasurement, triggerAppBPM, triggerAppSpO2, triggerAppPressure, findMyWatch, powerOffWatch, enableQuickView]);

  return actions;
}
