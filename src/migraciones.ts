import { db } from "./db";

function agregarColumnaSiFalta(
  tabla: string,
  columna: string,
  definicion: string
) {
  const columnas = db.prepare(`PRAGMA table_info(${tabla})`).all() as {
    name: string;
  }[];
  if (!columnas.some((c) => c.name === columna)) {
    db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
  }
}

// Los pedidos pueden ser para retirar en el local o para enviar
agregarColumnaSiFalta("pedidos", "entrega", "TEXT NOT NULL DEFAULT 'retiro'");

// Un viaje de flete por cada pedido con envío
db.exec(`
  CREATE TABLE IF NOT EXISTS fletes (
    id                TEXT PRIMARY KEY,
    pedido_id         TEXT NOT NULL UNIQUE REFERENCES pedidos(id) ON DELETE CASCADE,
    codigo            TEXT NOT NULL UNIQUE,
    token             TEXT NOT NULL UNIQUE,
    origen_direccion  TEXT NOT NULL DEFAULT '',
    destino_direccion TEXT NOT NULL,
    destino_lat       REAL,
    destino_lng       REAL,
    distancia_km      REAL,
    ganancia          INTEGER NOT NULL DEFAULT 0,
    estado            TEXT NOT NULL CHECK (estado IN ('pendiente', 'enviado', 'entregado', 'cancelado')),
    creado_en         TEXT NOT NULL,
    enviado_en        TEXT,
    entregado_en      TEXT
  );
`);