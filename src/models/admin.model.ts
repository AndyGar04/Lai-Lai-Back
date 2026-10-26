import bcrypt from "bcryptjs";
import { db } from "../db";
import { ADMIN_PASSWORD, ADMIN_USER } from "../config";

export interface FilaAdmin {
  id: number;
  clave_hash: string;
}

export function sincronizarAdmin() {
  const fila = db
    .prepare("SELECT id, clave_hash FROM admins WHERE usuario = ?")
    .get(ADMIN_USER) as FilaAdmin | undefined;

  if (!fila) {
    db.prepare("INSERT INTO admins (usuario, clave_hash) VALUES (?, ?)").run(
      ADMIN_USER,
      bcrypt.hashSync(ADMIN_PASSWORD, 10)
    );
    return;
  }

  if (!bcrypt.compareSync(ADMIN_PASSWORD, fila.clave_hash)) {
    db.prepare("UPDATE admins SET clave_hash = ? WHERE id = ?").run(
      bcrypt.hashSync(ADMIN_PASSWORD, 10),
      fila.id
    );
  }
}

export function buscarAdminPorUsuario(usuario: string) {
  return db
    .prepare("SELECT id, clave_hash FROM admins WHERE usuario = ?")
    .get(usuario) as FilaAdmin | undefined;
}

export function validarCredenciales(usuario: string, clave: string) {
  const fila = buscarAdminPorUsuario(usuario);
  return !!fila && bcrypt.compareSync(clave, fila.clave_hash);
}
