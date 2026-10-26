import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = resolve(raiz, "data");
export const UPLOADS_DIR = resolve(raiz, "uploads");

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(UPLOADS_DIR, { recursive: true });

export const db = new Database(resolve(DATA_DIR, "lailai.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS productos (
    id          TEXT PRIMARY KEY,
    nombre      TEXT NOT NULL,
    descripcion TEXT NOT NULL DEFAULT '',
    precio      INTEGER NOT NULL CHECK (precio > 0),
    stock       INTEGER NOT NULL CHECK (stock >= 0),
    categoria   TEXT NOT NULL,
    imagenes    TEXT NOT NULL DEFAULT '[]',
    creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id                  TEXT PRIMARY KEY,
    codigo              TEXT NOT NULL UNIQUE,
    fecha               TEXT NOT NULL,
    comprador_nombre    TEXT NOT NULL,
    comprador_telefono  TEXT NOT NULL,
    comprador_direccion TEXT NOT NULL DEFAULT '',
    total               INTEGER NOT NULL,
    metodo_pago         TEXT NOT NULL CHECK (metodo_pago IN ('efectivo', 'tarjeta')),
    estado              TEXT NOT NULL CHECK (estado IN ('pendiente', 'pagado', 'cancelado')),
    tarjeta_ultimos4    TEXT
  );

  -- Cada línea guarda nombre y precio al momento de la compra, así el
  -- historial no cambia aunque después se edite o elimine el producto.
  CREATE TABLE IF NOT EXISTS pedido_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id   TEXT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id TEXT NOT NULL,
    nombre      TEXT NOT NULL,
    precio      INTEGER NOT NULL,
    cantidad    INTEGER NOT NULL CHECK (cantidad > 0)
  );

  CREATE TABLE IF NOT EXISTS admins (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario    TEXT NOT NULL UNIQUE,
    clave_hash TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_pedidos_fecha ON pedidos(fecha);
  CREATE INDEX IF NOT EXISTS idx_items_pedido ON pedido_items(pedido_id);
`);

// Productos de ejemplo, solo la primera vez que se crea la base
if (db.pragma("user_version", { simple: true }) === 0) {
  const insertar = db.prepare(
    `INSERT INTO productos (id, nombre, descripcion, precio, stock, categoria)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  insertar.run(
    randomUUID(),
    "Set de palillos",
    "Pack de 10 pares de palillos de bambú",
    3500,
    25,
    "Cocina"
  );
  insertar.run(
    randomUUID(),
    "Taza de cerámica",
    "Taza con diseño de dragón",
    5200,
    12,
    "Cocina"
  );
  db.pragma("user_version = 1");
}