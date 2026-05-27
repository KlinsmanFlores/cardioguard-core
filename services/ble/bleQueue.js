import BleManager from 'react-native-ble-manager';

class BleQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
  }

  enqueue(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;
    
    const { task, resolve, reject } = this.queue.shift();
    try {
      const timeoutPromise = new Promise((_, rej) => setTimeout(() => rej(new Error("BLE Task Timeout")), 5000));
      const result = await Promise.race([task(), timeoutPromise]);
      await new Promise(r => setTimeout(r, 150)); // Mutex GATT breather
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.isProcessing = false;
      this.processQueue();
    }
  }

  clear() {
    console.log(`[BLE QUEUE] 🗑️ Limpiando cola de tareas. Tareas descartadas: ${this.queue.length}`);
    while (this.queue.length > 0) {
      const taskObj = this.queue.shift();
      if (taskObj && taskObj.reject) {
        taskObj.reject(new Error("Queue cleared due to disconnection"));
      }
    }
    this.isProcessing = false;
  }

  write(id, service, characteristic, data) {
    return this.enqueue(() => BleManager.write(id, service, characteristic, data));
  }
  writeWithoutResponse(id, service, characteristic, data) {
    return this.enqueue(() => BleManager.writeWithoutResponse(id, service, characteristic, data));
  }
  read(id, service, characteristic) {
    return this.enqueue(() => BleManager.read(id, service, characteristic));
  }
}

export const bleQueue = new BleQueue();
