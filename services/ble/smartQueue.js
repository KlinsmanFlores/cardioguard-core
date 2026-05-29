import { useBleStore } from '../../store/bleStore';

/**
 * Espera de forma segura a que el Bluetooth se libere.
 * Observa el estado global de Zustand (isBluetoothBusy).
 */
const waitForBluetoothFree = (timeoutMs = 60000) => {
  return new Promise((resolve) => {
    if (!useBleStore.getState().isBluetoothBusy) {
      resolve();
      return;
    }
    let timeoutId;
    const unsub = useBleStore.subscribe((state, prevState) => {
      if (!state.isBluetoothBusy) {
        clearTimeout(timeoutId);
        unsub();
        resolve();
      }
    });
    timeoutId = setTimeout(() => {
      unsub();
      console.warn('[SmartQueue] Timeout esperando liberación del Bluetooth');
      resolve(); // Resuelve para no bloquear infinitamente
    }, timeoutMs);
  });
};

class SmartQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.autoLoopActive = false;
    this.loopTimer = null;
  }

  /**
   * Encola una tarea de medición. 
   * Si es manual, se pone al principio de la cola para que sea la siguiente.
   */
  enqueueTask(type, taskFn, isManual = false) {
    console.log(`[SmartQueue] Encolando tarea ${type} (Manual: ${isManual})`);
    
    if (isManual) {
      // Prioridad máxima: insertar al frente
      this.queue.unshift({ type, taskFn, isManual });
    } else {
      // Prioridad normal (Automático): insertar al final
      this.queue.push({ type, taskFn, isManual });
    }
    
    this.processQueue();
  }

  /**
   * Procesa la cola secuencialmente, esperando a que el BLE se desocupe entre cada una.
   */
  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const taskObj = this.queue.shift();
      console.log(`[SmartQueue] Procesando tarea: ${taskObj.type}`);
      
      // 1. Esperar que el reloj no esté ocupado
      if (useBleStore.getState().isBluetoothBusy) {
        useBleStore.getState().setStatusMsg(`Esperando para medir ${taskObj.type}...`);
        await waitForBluetoothFree(45000);
      }

      // 2. Ejecutar la medición
      try {
        await taskObj.taskFn();
        // La ejecución pondrá isBluetoothBusy = true
        // 3. Esperar a que el hardware complete (hasta 45s)
        await waitForBluetoothFree(60000);
      } catch (err) {
        console.error(`[SmartQueue] Error en tarea ${taskObj.type}:`, err);
      }

      // 4. Descanso entre tareas (para que el GATT no colapse y el usuario respire)
      console.log(`[SmartQueue] Descanso post-tarea de 10s...`);
      await new Promise(r => setTimeout(r, 10000));
    }

    this.isProcessing = false;
    console.log(`[SmartQueue] Cola vacía.`);

    if (this.autoLoopActive) {
      console.log(`[SmartQueue] Iniciando descanso de 5 minutos antes del próximo ciclo completo...`);
      if (this.loopTimer) clearTimeout(this.loopTimer);
      this.loopTimer = setTimeout(() => {
        if (this.autoLoopActive) {
          this._triggerAutoCycle();
        }
      }, 300000); // 5 minutos de descanso
    }
  }

  /**
   * Control del ciclo Automático de 5 Minutos.
   */
  setAutoMode(isActive) {
    this.autoLoopActive = isActive;
    console.log(`[SmartQueue] Modo Automático: ${isActive ? 'ACTIVADO' : 'DESACTIVADO'}`);

    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }

    if (isActive) {
      // Ejecutar la primera ronda de inmediato
      this._triggerAutoCycle();
    } else {
      // Si se apaga, limpiar tareas automáticas de la cola (dejar solo manuales)
      this.queue = this.queue.filter(t => t.isManual);
    }
  }

  _triggerAutoCycle() {
    const store = useBleStore.getState();
    if (!store.isConnected) {
       // Si no hay conexión, reintentar en 30 segundos
       this.loopTimer = setTimeout(() => {
         if (this.autoLoopActive) this._triggerAutoCycle();
       }, 30000);
       return;
    }

    console.log('[SmartQueue] Disparando ciclo Automático 24/7...');
    
    // Encolar las 3 métricas en orden (false = no es manual, va al fondo)
    if (store.triggerAppBPM) this.enqueueTask('Auto-BPM', store.triggerAppBPM, false);
    if (store.triggerAppSpO2) this.enqueueTask('Auto-SpO2', store.triggerAppSpO2, false);
    if (store.triggerAppPressure) this.enqueueTask('Auto-Pressure', store.triggerAppPressure, false);
  }
}

export const smartQueue = new SmartQueue();
