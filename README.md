# Cardioguard - Prototipo BLE en React Native (Expo)

Cardioguard es un prototipo de aplicación móvil diseñado para conectarse a relojes inteligentes (Smartwatches/Smartbands) a través de Bluetooth Low Energy (BLE), con el objetivo de monitorizar la frecuencia cardíaca (BPM) en tiempo real y alertar al usuario si se detectan anomalías.

## 🚀 Características Implementadas

1. **Interfaz Premium "Dark Mode":** 
   - Diseño moderno con un fondo oscuro (`#0f172a`).
   - Animación de "pulso" en la pantalla principal que late sincronizada con los BPM.
   - Indicadores dinámicos de conexión y estado.

2. **Lógica de Lectura (Bluetooth BLE):**
   - Lógica preparada para usar `react-native-ble-manager`.
   - Búsqueda (Scan) y conexión a periféricos.
   - Lectura cíclica (cada 5 segundos) del servicio Heart Rate (`180D`) y característica de Medición (`2A37`).

3. **Alerta Visual de Emergencia:**
   - Si los BPM superan los 110 o bajan de 50, se activa una alerta visual roja parpadeante de **¡EMERGENCIA!** y el fondo se oscurece a un tono carmesí.

4. **Modo Demo (Web/Simulador):**
   - Funcionalidad para probar la UI y las alertas sin tener un reloj emparejado.
   - Genera valores aleatorios entre 40 y 130 BPM cada 5 segundos para forzar las alertas.

---

## 🛠️ Resumen Técnico: Lo que se hizo

A lo largo del proceso, se realizaron los siguientes pasos en este entorno:

1. **Configuración del Entorno:**
   - Se habilitaron los permisos de ejecución de scripts en PowerShell (`Set-ExecutionPolicy RemoteSigned`) para permitir el uso del comando `npx`.
   - Se inicializó un nuevo proyecto de Expo vacío (Template Blank).

2. **Desarrollo de `App.js`:**
   - Se construyó el componente principal de React Native usando `Animated` para las alertas y el pulso.
   - Se reemplazó temporalmente el módulo nativo `react-native-ble-manager` por un **Mock Object** interno. Esto se hizo porque los módulos de Bluetooth requieren código nativo (Java/Swift) y no funcionan en la web ni en la app estándar de Expo Go.

3. **Adaptación para Web:**
   - Se instalaron las dependencias para poder ver la app en el navegador web:
     `npx expo install react-dom react-native-web @expo/metro-runtime`
   - Se inició el servidor web de Expo (`npx expo start --web`) para ver el "Modo Demo" funcionando en `localhost`.

---

## 💻 ¿Cómo ejecutarlo?

### Para probar la Interfaz (Modo Demo en Navegador)
1. Abre una terminal en esta carpeta (`c:\appexpo`).
2. Ejecuta: `npm run web` (o `npx expo start --web`).
3. Abre la dirección `http://localhost:8081` en tu navegador.
4. Presiona **"Iniciar Modo Demo"**.

### Para conectar un Reloj Real (Requiere compilación Nativa)
Para usar el botón "Escanear Reloj" con un dispositivo BLE real, debes:
1. Borrar el código "MOCK para modo demo / web" en la línea 12 de `App.js`.
2. Descomentar (o agregar) la importación nativa real:
   ```javascript
   import BleManager from 'react-native-ble-manager';
   import { NativeEventEmitter, NativeModules } from 'react-native';
   const BleManagerModule = NativeModules.BleManager;
   const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);
   ```
3. Instalar la librería: `npm install react-native-ble-manager`.
4. Instalar Dev Client: `npx expo install expo-dev-client`.
5. Compilar la aplicación en tu celular físico por USB usando:
   `npx expo run:android` o `npx expo run:ios`.
