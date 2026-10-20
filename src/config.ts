import { config } from "dotenv";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Siempre lee server/.env, sin importar desde qué carpeta se ejecute
const rutaEnv = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".env"
);

if (!existsSync(rutaEnv)) {
  console.error(`No existe el archivo ${rutaEnv}`);
  process.exit(1);
}
if (statSync(rutaEnv).size === 0) {
  console.error(`El archivo ${rutaEnv} está vacío`);
  process.exit(1);
}

config({ path: rutaEnv, override: true });

const NOMBRES = ["JWT_SECRET", "ADMIN_USER", "ADMIN_PASSWORD"] as const;
const faltantes = NOMBRES.filter((n) => !process.env[n]?.trim());
if (faltantes.length > 0) {
  console.error(
    `Faltan variables en ${rutaEnv}: ${faltantes.join(", ")} (sin valor después del "=")`
  );
  process.exit(1);
}

export const PORT = Number(process.env.PORT ?? 3001);
export const JWT_SECRET = process.env.JWT_SECRET!.trim();
export const ADMIN_USER = process.env.ADMIN_USER!.trim();
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!.trim();

if (JWT_SECRET.length < 16) {
  console.error("JWT_SECRET tiene que tener al menos 16 caracteres");
  process.exit(1);
}

/* ---------- Envíos con flete (todo opcional) ---------- */

const numero = (nombre: string, porDefecto: number) => {
  const crudo = process.env[nombre]?.trim();
  const valor = Number(crudo);
  return crudo && Number.isFinite(valor) && valor >= 0 ? valor : porDefecto;
};

export const ORS_API_KEY = process.env.ORS_API_KEY?.trim() ?? "";
export const LOCAL_DIRECCION = process.env.LOCAL_DIRECCION?.trim() ?? "";
export const PAIS_GEOCODIFICACION =
  process.env.PAIS_GEOCODIFICACION?.trim() || "AR";
export const FLETE_TELEFONO = (process.env.FLETE_TELEFONO ?? "").replace(
  /\D/g,
  ""
);
export const FLETE_TARIFA_BASE = numero("FLETE_TARIFA_BASE", 0);
export const FLETE_PRECIO_KM = numero("FLETE_PRECIO_KM", 0);