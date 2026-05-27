// Override global console methods to format all logs with [HH:MM:SS.mmm]
const originalLog = console.log;
console.log = (...args) => {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  const timestamp = `[${hh}:${mm}:${ss}.${ms}]`;
  originalLog(timestamp, ...args);
};

const originalWarn = console.warn;
console.warn = (...args) => {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  const timestamp = `[${hh}:${mm}:${ss}.${ms}]`;
  originalWarn(timestamp, ...args);
};

const originalError = console.error;
console.error = (...args) => {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  const timestamp = `[${hh}:${mm}:${ss}.${ms}]`;
  originalError(timestamp, ...args);
};

import { registerRootComponent } from 'expo';
import './services/background/foregroundShield';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
