import ReactNativeForegroundService from '@supersami/rn-foreground-service';

// Bandera Maestra de Rollback Seguro
export const IS_SHIELD_ENABLED = true;

// Registra la tarea que se ejecutará en background (El Headless JS)
try {
  ReactNativeForegroundService.register({
    config: {
      alert: false,
      onServiceErrorCallBack: () => {}
    }
  });
} catch (e) {
  console.error('[BACKGROUND] Error fatal al registrar Foreground Service:', e);
}

export const startForegroundShield = () => {
  if (!IS_SHIELD_ENABLED) return;
  
  try {
    ReactNativeForegroundService.add_task(
      () => {
        // En FASE A, la tarea está vacía intencionalmente.
        // Simplemente tener el Headless Task registrado mantiene vivo
        // el thread de JavaScript y evita que Android mate los setIntervals
        // que ya tenemos en useBLE.js
        console.log('[BACKGROUND] 🛡️ FOREGROUND_STARTED - Escudo Activo');
      },
      {
        delay: 5000,
        onLoop: true,
        taskId: 'cardioguard_watchdog',
        onError: (e) => console.log('[BACKGROUND] Error:', e),
      }
    );

    ReactNativeForegroundService.start({
      id: 111,
      title: 'CardioGuard Monitoring Active',
      message: 'Conectado a Watch 8 - Protegiendo proceso BLE',
      icon: 'ic_launcher',
      button: false,
      setOnlyAlertOnce: true,
      color: '#dc2626',
    });
    console.log('[BACKGROUND] ✅ Foreground Service Arrancado exitosamente');
  } catch (err) {
    console.error('[BACKGROUND] 🔴 Fallo al arrancar Foreground Service:', err);
  }
};

export const stopForegroundShield = () => {
  if (!IS_SHIELD_ENABLED) return;
  try {
    ReactNativeForegroundService.remove_task('cardioguard_watchdog');
    ReactNativeForegroundService.stop();
    console.log('[BACKGROUND] 🛑 Escudo Desactivado');
  } catch (err) {
    console.log(err);
  }
};
