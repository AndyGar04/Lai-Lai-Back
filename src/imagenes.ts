import { randomUUID } from "node:crypto";
import { unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { UPLOADS_DIR } from "./db";
import { ErrorNegocio } from "./errores";

const PREFIJO = "/uploads/";
const RE_URL = /^\/uploads\/[A-Za-z0-9-]+\.(jpg|png|webp)$/;
const RE_DATA = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
const EXTENSIONES: Record<string, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
};
const MAX_BYTES = 2 * 1024 * 1024;

export function borrarImagenes(urls: string[]) {
  for (const url of urls) {
    if (!RE_URL.test(url)) continue;
    try {
      unlinkSync(resolve(UPLOADS_DIR, url.slice(PREFIJO.length)));
    } catch {
      // el archivo ya no existe: no pasa nada
    }
  }
}

// Recibe una lista mezclada: rutas que ya existen ("/uploads/...") e
// imágenes nuevas en base64. Devuelve la lista final de rutas.
export function guardarImagenes(entradas: string[]): string[] {
  const resultado: string[] = [];
  const nuevas: string[] = [];

  try {
    for (const entrada of entradas) {
      if (RE_URL.test(entrada)) {
        resultado.push(entrada);
        continue;
      }

      const m = entrada.match(RE_DATA);
      if (!m) throw new ErrorNegocio("Formato de imagen no válido");

      const buffer = Buffer.from(m[2], "base64");
      if (buffer.length > MAX_BYTES) {
        throw new ErrorNegocio("Una de las imágenes supera los 2 MB");
      }

      const url = `${PREFIJO}${randomUUID()}.${EXTENSIONES[m[1]]}`;
      writeFileSync(resolve(UPLOADS_DIR, url.slice(PREFIJO.length)), buffer);
      nuevas.push(url);
      resultado.push(url);
    }
  } catch (error) {
    borrarImagenes(nuevas); // no dejamos archivos huérfanos
    throw error;
  }

  return resultado;
}