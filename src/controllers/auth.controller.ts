import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { type NextFunction, type Request, type Response } from "express";
import { ADMIN_PASSWORD, ADMIN_USER, JWT_SECRET } from "../config";
import { buscarAdminPorUsuario, sincronizarAdmin } from "../models/admin.model";

export { sincronizarAdmin };

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

export const limitarLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Probá de nuevo en unos minutos." },
});

export function login(req: Request, res: Response) {
  const { usuario, clave } = req.body ?? {};
  if (typeof usuario !== "string" || typeof clave !== "string") {
    res.status(400).json({ error: "Faltan datos" });
    return;
  }

  const fila = buscarAdminPorUsuario(usuario);
  if (!fila || !bcrypt.compareSync(clave, fila.clave_hash)) {
    res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    return;
  }

  const token = jwt.sign({ sub: usuario }, JWT_SECRET, { expiresIn: "8h" });
  res.json({ token });
}

export function verificar(_req: Request, res: Response) {
  res.json({ ok: true });
}

export function sincronizarAdminDeInicio() {
  sincronizarAdmin();
}
