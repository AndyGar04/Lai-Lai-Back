import "../migraciones"; // asegura que la tabla de fletes exista
import { randomBytes, randomInt } from "node:crypto";
import {
  FLETE_PRECIO_KM,
  FLETE_TARIFA_BASE,
  FLETE_TELEFONO,
} from "../config";
import { db } from "../db";

export type EstadoFlete = "pendiente" | "enviado" | "entregado" | "cancelado";

export interface FilaFlete {
  id: string;
  pedido_id: string;
  codigo: string;
  token: string;
  origen_direccion: string;
  destino_direccion: string;
  destino_lat: number | null;
  destino_lng: number | null;
  distancia_km: number | null;
  ganancia: number;
  estado: EstadoFlete;
}

export interface InfoPedido {
  total: number;
  metodoPago: string;
  nombre: string;
  telefono: string;
}

export const calcularGanancia = (km: number | null) =>
  Math.round(FLETE_TARIFA_BASE + (km ?? 0) * FLETE_PRECIO_KM);

const existeCodigo = db.prepare("SELECT 1 FROM fletes WHERE codigo = ?");

// Código corto de 4 caracteres (ej. HGXR), sin letras ni números ambiguos
export function generarCodigoFlete(): string {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let codigo: string;
  do {
    codigo = "";
    for (let i = 0; i < 4; i++) codigo += letras[randomInt(letras.length)];
  } while (existeCodigo.get(codigo));
  return codigo;
}

// Para la página pública del flete (próxima etapa): imposible de adivinar
export const generarToken = () => randomBytes(16).toString("hex");

const moneda = (n: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);

// Ruta en Google Maps desde el local hasta el cliente
function urlMapaDe(flete: FilaFlete): string {
  const destino =
    flete.destino_lat !== null && flete.destino_lng !== null
      ? `${flete.destino_lat},${flete.destino_lng}`
      : flete.destino_direccion;
  const params = new URLSearchParams({
    api: "1",
    destination: destino,
    travelmode: "driving",
  });
  if (flete.origen_direccion) params.set("origin", flete.origen_direccion);
  return `https://www.google.com/maps/dir/?${params}`;
}

function armarMensaje(
  flete: FilaFlete,
  pedido: InfoPedido,
  items: { nombre: string; cantidad: number }[],
  urlMapa: string
): string {
  const productos = items.map((i) => `• ${i.cantidad} × ${i.nombre}`).join("\n");
  const km =
    flete.distancia_km !== null
      ? `${flete.distancia_km.toLocaleString("es-AR", { maximumFractionDigits: 1 })} km`
      : "a confirmar";
  const cobro =
    pedido.metodoPago === "tarjeta"
      ? "✅ Ya pagado con tarjeta (no cobrar)"
      : `💵 Cobrar al entregar: ${moneda(pedido.total)}`;

  return [
    `🚚 *Nuevo viaje · ${flete.codigo}*`,
    "",
    "📦 *Productos a retirar:*",
    productos,
    "",
    ...(flete.origen_direccion ? [`📍 Retiro: ${flete.origen_direccion}`] : []),
    `🏠 Entrega: ${flete.destino_direccion}`,
    `👤 Cliente: ${pedido.nombre} · ${pedido.telefono}`,
    `📏 Distancia: ${km}`,
    `💰 Ganancia del viaje: ${moneda(flete.ganancia)}`,
    cobro,
    "",
    `🗺️ Ruta: ${urlMapa}`,
  ].join("\n");
}

// Lo que ve el dueño en el panel (nunca se devuelve a los clientes)
export function aFlete(
  flete: FilaFlete,
  pedido: InfoPedido,
  items: { nombre: string; cantidad: number }[]
) {
  const urlMapa = urlMapaDe(flete);
  const mensaje = armarMensaje(flete, pedido, items, urlMapa);
  const destinoWhatsApp = FLETE_TELEFONO
    ? `https://wa.me/${FLETE_TELEFONO}`
    : "https://wa.me/"; // sin número configurado: el dueño elige el contacto

  return {
    id: flete.id,
    codigo: flete.codigo,
    estado: flete.estado,
    distanciaKm: flete.distancia_km,
    ganancia: flete.ganancia,
    destino: {
      direccion: flete.destino_direccion,
      lat: flete.destino_lat,
      lng: flete.destino_lng,
    },
    mensaje,
    urlWhatsApp: `${destinoWhatsApp}?text=${encodeURIComponent(mensaje)}`,
    urlMapa,
  };
}