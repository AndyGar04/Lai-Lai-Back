import {
  LOCAL_DIRECCION,
  ORS_API_KEY,
  PAIS_GEOCODIFICACION,
} from "../config";

const BASE = "https://api.openrouteservice.org";
const TIMEOUT_MS = 4000;

export interface Punto {
  lat: number;
  lng: number;
}

export interface Ruta {
  destino: Punto | null;
  km: number | null;
}

async function consultar(
  ruta: string,
  params: Record<string, string>
): Promise<unknown> {
  const consulta = new URLSearchParams({ api_key: ORS_API_KEY, ...params });
  const respuesta = await fetch(`${BASE}${ruta}?${consulta}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // No se incluye la URL en el error para no filtrar la clave en los logs
  if (!respuesta.ok) {
    throw new Error(`OpenRouteService respondió ${respuesta.status}`);
  }
  return respuesta.json();
}

async function geocodificar(texto: string): Promise<Punto | null> {
  try {
    const datos = (await consultar("/geocode/search", {
      text: texto,
      size: "1",
      "boundary.country": PAIS_GEOCODIFICACION,
    })) as { features?: { geometry: { coordinates: [number, number] } }[] };

    const c = datos.features?.[0]?.geometry.coordinates;
    return c ? { lat: c[1], lng: c[0] } : null;
  } catch (error) {
    console.error(
      "No se pudo ubicar una dirección:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

// El local no cambia: se ubica una sola vez
let origenCache: Punto | null = null;
async function obtenerOrigen(): Promise<Punto | null> {
  if (!origenCache) origenCache = await geocodificar(LOCAL_DIRECCION);
  return origenCache;
}

// Devuelve el destino y los km por ruta. Si no hay clave o algo falla,
// devuelve lo que pudo (o nulls) y la compra sigue su curso.
export async function calcularRuta(direccionDestino: string): Promise<Ruta> {
  if (!ORS_API_KEY) return { destino: null, km: null };

  const destino = await geocodificar(direccionDestino);
  if (!destino || !LOCAL_DIRECCION) return { destino, km: null };

  const origen = await obtenerOrigen();
  if (!origen) return { destino, km: null };

  try {
    const datos = (await consultar("/v2/directions/driving-car", {
      start: `${origen.lng},${origen.lat}`,
      end: `${destino.lng},${destino.lat}`,
    })) as {
      features?: { properties: { summary: { distance: number } } }[];
    };
    const metros = datos.features?.[0]?.properties.summary.distance;
    return {
      destino,
      km: typeof metros === "number" ? Math.round(metros / 100) / 10 : null,
    };
  } catch (error) {
    console.error(
      "No se pudo calcular la ruta:",
      error instanceof Error ? error.message : error
    );
    return { destino, km: null };
  }
}