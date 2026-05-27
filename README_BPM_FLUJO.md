# Flujo de Comunicación BLE y Medición de BPM (Proyecto APPEXPO)

Este documento detalla el flujo exacto y continuo de cómo la aplicación se comunica con el reloj inteligente (Colmi P28 Plus / Firmware Moyoung V2) para iniciar, mantener y recibir las mediciones biométricas, específicamente el Ritmo Cardíaco (BPM), sin omitir la participación de las tramas (frames) específicas descubiertas mediante ingeniería inversa.

---

## 1. Arranque y Conexión Inicial

1. **Escaneo y Conexión:**
   - La app invoca `startScan()`, solicitando permisos de Bluetooth/Ubicación en Android.
   - Al detectar el dispositivo objetivo (por nombre "P28 PLUS" o MAC Address), se detiene el escaneo y se llama a `connectToDevice()`.
   - Se establece la conexión y se realiza un "Bonding" nativo (emparejamiento) para asegurar el canal.

2. **Descubrimiento de Servicios UUIDs:**
   - Se mapean los servicios y características esenciales:
     - **FEEA** (Servicio Propietario Moyoung V2)
     - **FEE3** (Notificaciones/Telemetría desde el reloj a la app) -> *Escucha continua.*
     - **FEE2** (Escritura de comandos desde la app al reloj) -> *Comandos tácticos.*

3. **Suscripción y Mantenimiento (Keep-Alive):**
   - Se inician las notificaciones nativas en `FEE3` para recibir telemetría.
   - Se arranca un "Latido" (`Keep-Alive`): Cada 12 segundos la app envía `[FE, EA, 10, 06, 5A, 00]` al canal de escritura `FEE2` para evitar que el reloj entre en "Deep Sleep" y cierre la conexión.

---

## 2. El "Baile" de Sincronización en Cascada (Handshake)

Para que el reloj empiece a enviar métricas de salud reales, se necesita un intercambio complejo de tramas (frames). Aquí es donde entran en juego los frames que hemos ido implementando:

1. **Inicio de Cascada (`startCascadeHandshake`):**
   - La app envía la petición inicial de cascada: `FE EA 20 08 69 FF FF FF`.
2. **Eco de Sincronización:**
   - El reloj responde confirmando la recepción (`FE EA 20 08 69 00 FF FF`).
   - Al recibir esto, la app responde inmediatamente enviando `FA` y luego `29` para confirmar que está atenta.

---

## 3. Intervención de los Frames Descubiertos (Tu aporte al código)

Los "frames" o "líneas" que extrajimos de los logs de Da Fit han sido vitales para que el reloj no ignore a la app. Así los estamos utilizando en tiempo real cuando llegan a través de `FEE3`:

- **Frame 5505 (`6B FF`):** 
  - *Qué hace:* El reloj anuncia que su búfer de memoria está listo.
  - *Acción de la App:* Dispara la sincronización en cascada automáticamente si no se había hecho.
- **Frame 5547 / 5536 (`29 01`):**
  - *Qué hace:* Confirmación de que el "Bus de enlace" está abierto.
  - *Acción de la App:* Ejecuta `prepareMoyoungBus()` enviando comandos de limpieza `6D 00` y luego forzando apertura `6D FF`. Además, espera ~4 segundos y envía `[FE, EA, 20, 08, 69, 00, 00, 00]` para **resetear los contadores internos del chip PPG** (para un arranque limpio).
- **Eco Confirmado (`6D FF`):**
  - *Qué hace:* El reloj responde "Bus abierto al 100%".
- **Frame 896:**
  - *Qué hace:* Identifica positivamente el firmware `Z-MOYOUNG-V2`.
- **Frame 964 (`B4`):**
  - *Qué hace:* Reporte de capacidades. El firmware indica que los sensores están completamente listos y desbloqueados.
- **Frame 5694 (`F9 01 01 00` - Inicio en frío):**
  - *Acción de la App:* Si hay una medición manual activa, dispara la "micro-ráfaga táctica" para activar directamente el láser.
- **Frame 5631 (`F9 02 01` - Fase 2 activa):**
  - *Acción de la App:* El reloj confirma la fase 2. Se inyecta la ráfaga PPG final y obligatoria para forzar la luz verde del sensor de pulso.

---

## 4. ¿Qué estamos enviando para solicitar mediciones biométricas?

Cuando iniciamos una medición (sea automática post-cascada o manual via `executeHardwarePPGTrigger` / `runPPGTriggerSequence`), no enviamos un comando genérico. Enviamos una ráfaga secuencial específica hacia `FEE2`:

1. **Limpieza del canal PPG:**
   `[0xFE, 0xEA, 0x20, 0x06, 0x35, 0x07]`
2. **Inyección de la orden de lectura PPG (Ejemplo para BPM, donde `metric = 1`):**
   `[0xFE, 0xEA, 0x20, 0x0B, 0xBB, 0x01, 0x00, 0x83, 0xB9, 0xFF, 0xFF]`
   - *Nota:* Si el `metric` cambia a 2 es SpO2, si cambia a 3 es Presión Arterial.

Además, en el trigger manual tradicional (`executeMeasurementTrigger`), se mandan los comandos V2 puros como "Plan B":
- **Pulso:** `[0xFE, 0xEA, 0x10, 0x08, 0x05, 0x01, 0x00, 0x00]`
- **SpO2:** `[0xFE, 0xEA, 0x10, 0x08, 0x05, 0x02, 0x00, 0x00]`
- **Presión:** `[0xFE, 0xEA, 0x10, 0x08, 0x05, 0x03, 0x00, 0x00]`

---

## 5. Recepción de Mediciones en Flujo Continuo (El decodificador)

Una vez que la luz verde del reloj está encendida, el reloj empezará a enviar una avalancha de datos por el canal de notificaciones `FEE3`.

El flujo que la app realiza de forma ininterrumpida es el siguiente:
1. Recibe un array de bytes.
2. Si los bytes inician con `[0xFE, 0xEA]`, mira el quinto byte (el índice `4`) para saber qué está informando:
   - **Métrica Identificada como `0x6D` (Pulso / BPM):**
     - El valor del pulso viene en el byte índice `5`.
     - Si el valor es `255` o `<= 1`, significa "Estoy calculando / Calibrando el sensor / Mantente quieto". No es un valor final.
     - Si el valor está entre `40` y `220`, ¡Bingo! Es una medición válida.
     - La app actualiza el estado global de Zustand (`store.setBpm(bpm)`) para reflejarlo en la interfaz.
     - Guarda el valor en el almacenamiento interno mediante `saveBpmReading(bpm)`.
   
   - **Métrica Identificada como `0x69` (Presión):**
     - Índice `6` es SBP (Sistólica).
     - Índice `7` es DBP (Diastólica).
     - Se ignora si son `255`, y se guarda si están dentro del rango lógico.

---

### Resumen del ciclo de vida (En una frase):
La app se conecta, engaña al reloj haciendo el baile de Handshake (Frames 5505, 5547) para que crea que somos Da Fit, mantiene vivo el canal inyectando `5A 00` cada 12 segundos, dispara la luz verde con la ráfaga `BB 01`, y luego intercepta ininterrumpidamente los bytes `0x6D` para extraer la medición final real sin perder la conexión en ningún momento. Todo basado en las secuencias de Da Fit integradas de manera nativa.
