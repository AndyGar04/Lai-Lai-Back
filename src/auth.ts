import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { Router, type NextFunction, type Request, type Response } from "express";
import { db } from "./db";
import { ADMIN_PASSWORD, ADMIN_USER, JWT_SECRET } from "./config";

interface FilaAdmin {
  id: number;
  clave_hash: string;
}

// La contraseña del admin se define en .env y se sincroniza al arrancar
export function sincronizarAdmin() {
  const fila = db
    .prepare("SELECT id, clave_hash FROM admins WHERE usuario = ?")
    .get(ADMIN_USER) as FilaAdmin | undefined;

  if (!fila) {
    db.prepare("INSERT INTO admins (usuario, clave_hash) VALUES (?, ?)").run(
      ADMIN_USER,
      bcrypt.hashSync(ADMIN_PASSWORD, 10)
    );
  } else if (!bcrypt.compareSync(ADMIN_PASSWORD, fila.clave_hash)) {
    db.prepare("UPDATE admins SET clave_hash = ? WHERE id = ?").run(
      bcrypt.hashSync(ADMIN_PASSWORD, 10),
      fila.id
    );
  }
}

export function requerirAdmin(req: Request, res: Response, next: NextFunction) {
  const cabecera = req.headers.authorization ?? "";
  const token = cabecera.startsWith("Bearer ") ? cabecera.slice(7) : "";
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Sesión inválida o vencida" });
  }
}

const limitarLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Probá de nuevo en unos minutos." },
});

export const rutasAuth = Router();

rutasAuth.post("/login", limitarLogin, (req, res) => {
  const { usuario, clave } = req.body ?? {};
  if (typeof usuario !== "string" || typeof clave !== "string") {
    res.status(400).json({ error: "Faltan datos" });
    return;
  }

  const fila = db
    .prepare("SELECT id, clave_hash FROM admins WHERE usuario = ?")
    .get(usuario) as FilaAdmin | undefined;

  if (!fila || !bcrypt.compareSync(clave, fila.clave_hash)) {
    res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    return;
  }

  const token = jwt.sign({ sub: usuario }, JWT_SECRET, { expiresIn: "8h" });
  res.json({ token });
});

// Para que el frontend compruebe si su token sigue siendo válido
rutasAuth.get("/verificar", requerirAdmin, (_req, res) => {
  res.json({ ok: true });
});