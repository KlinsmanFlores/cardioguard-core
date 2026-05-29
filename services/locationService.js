import * as Location from 'expo-location';

let locationSubscription = null;
let lastKnownLocation    = null;

/**
 * Solicita permisos de ubicación al sistema operativo
 * @returns {Promise<boolean>}
 */
export const requestLocationPermission = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    console.log('[GPS] Permiso de ubicación:', status);
    return status === 'granted';
  } catch (e) {
    console.error('[GPS] Error solicitando permiso:', e);
    return false;
  }
};

/**
 * Obtiene la ubicación actual del dispositivo (una sola vez)
 * Incluye geocodificación inversa para obtener la dirección legible
 * @returns {Promise<{lat, lng, address, accuracy} | null>}
 */
export const getCurrentLocation = async () => {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      const granted = await requestLocationPermission();
      if (!granted) return null;
    }

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const { latitude: lat, longitude: lng, accuracy } = pos.coords;

    // Geocodificación inversa (dirección legible)
    let address = null;
    try {
      const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (place) {
        const parts = [
          place.street,
          place.streetNumber ? `#${place.streetNumber}` : null,
          place.district || place.subregion,
          place.city,
          place.region,
        ].filter(Boolean);
        address = parts.join(', ');
      }
    } catch (_) {
      console.warn('[GPS] No se pudo obtener la dirección');
    }

    const location = { lat, lng, address, accuracy };
    lastKnownLocation = location;

    console.log(`[GPS] 📍 ${lat.toFixed(5)}, ${lng.toFixed(5)} | ${address || 'sin dirección'}`);
    return location;

  } catch (e) {
    console.error('[GPS] Error obteniendo ubicación:', e);
    return lastKnownLocation; // Devuelve la última conocida como fallback
  }
};

/**
 * Calcula la distancia en metros entre dos coordenadas (Haversine)
 */
const getDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371e3; // Radio de la Tierra en metros
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

/**
 * Inicia un watcher que actualiza la ubicación continuamente
 * @param {function} onUpdate - Callback con {lat, lng, address, accuracy}
 * @returns {Promise<void>}
 */
export const startLocationWatch = async (onUpdate) => {
  await stopLocationWatch(); // Limpiar watcher anterior

  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return;

    locationSubscription = await Location.watchPositionAsync(
      {
        accuracy:          Location.Accuracy.Balanced,
        timeInterval:      180000,  // Cada 3 minutos (180,000 ms)
        distanceInterval:  10,      // O si se mueve más de 10 metros
      },
      async (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        let address = lastKnownLocation?.address || null;

        // Solo re-geocodificar si cambió más de 50 metros o no tiene dirección previa
        const dist = lastKnownLocation 
          ? getDistance(lastKnownLocation.lat, lastKnownLocation.lng, lat, lng)
          : Infinity;

        if (dist > 50 || !address) {
          try {
            const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
            if (place) {
              const parts = [
                place.street,
                place.streetNumber ? `#${place.streetNumber}` : null,
                place.district || place.subregion,
                place.city,
              ].filter(Boolean);
              address = parts.join(', ');
            }
          } catch (_) {}
        }

        const location = { lat, lng, address, accuracy };
        lastKnownLocation = location;
        onUpdate(location);
      }
    );

    console.log('[GPS] 🔄 Watcher de ubicación iniciado');
  } catch (e) {
    console.error('[GPS] Error iniciando watcher:', e);
  }
};

/**
 * Detiene el watcher de ubicación
 */
export const stopLocationWatch = async () => {
  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
    console.log('[GPS] Watcher detenido');
  }
};

/**
 * Devuelve la última ubicación conocida (sin hacer petición nueva)
 */
export const getLastKnownLocation = () => lastKnownLocation;

/**
 * Verifica si los servicios de ubicación están habilitados en el dispositivo
 */
export const isLocationEnabled = async () => {
  try {
    return await Location.hasServicesEnabledAsync();
  } catch (_) {
    return false;
  }
};
