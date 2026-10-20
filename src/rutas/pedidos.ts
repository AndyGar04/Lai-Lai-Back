import { Router } from "express";
import { randomInt, randomUUID } from "node:crypto";
import { db } from "../db";
import { requerirAdmin } from "../auth";
import { ErrorNegocio } from "../errores";
import { LOCAL_DIRECCION } from "../config";
import { calcularRuta, type Ruta } from "../servicios/mapas";
import {
  aFlete,
  calcularGanancia,
  generarCodigoFlete,
  generarToken,
  type FilaFlete,
} from "../servicios/flete";

export const rutasPedidos = Router();

const METODOS = ["efectivo", "tarjeta"] as const;
const ESTADOS = ["pendiente", "pagado", "cancelado"] as const;
type Metodo = (typeof METODOS)[number];
type Estado = (typeof ESTADOS)[number];
type Entrega = "retiro" | "envio";

interface FilaPedido {
  id: string;
  codigo: string;
  fecha: string;
  comprador_nombre: string;
  comprador_telefono: string;
  comprador_direccion: string;
  total: number;
  metodo_pago: Metodo;
  estado: Estado;
  tarjeta_ultimos4: string | null;
  entrega: Entrega;
}

interface FilaItem {
  producto_id: string;
  nombre: string;
  precio: number;
  cantidad: number;
}

const COLUMNAS = `id, codigo, fecha, comprador_nombre, comprador_telefono,
  comprador_direccion, total, metodo_pago, estado, tarjeta_ultimos4, entrega`;

const itemsDe = db.prepare(
  "SELECT producto_id, nombre, precio, cantidad FROM pedido_items WHERE pedido_id = ? ORDER BY id"
);
const obtenerFlete = db.prepare("SELECT * FROM fletes WHERE pedido_id = ?");

// Misma forma que el tipo Pedido del frontend. Los datos del flete
// (ganancia, etc.) solo se incluyen en las respuestas del admin.
function aPedido(f: FilaPedido, conFlete = false) {
  const items = itemsDe.all(f.id) as FilaItem[];
  const flete = conFlete
    ? (obtenerFlete.get(f.id) as FilaFlete | undefined)
    : undefined;

  return {
    id: f.id,
    codigo: f.codigo,
    fecha: f.fecha,
    comprador: {
      nombre: f.comprador_nombre,
      telefono: f.comprador_telefono,
      direccion: f.comprador_direccion,
    },
    items: items.map((i) => ({
      productoId: i.producto_id,
      nombre: i.nombre,
      precio: i.precio,
      cantidad: i.cantidad,
    })),
    total: f.total,
    metodoPago: f.metodo_pago,
    estado: f.estado,
    entrega: f.entrega,
    ...(f.tarjeta_ultimos4 ? { tarjetaUltimos4: f.tarjeta_ultimos4 } : {}),
    ...(flete
      ? {
          flete: aFlete(
            flete,
            {
              total: f.total,
              metodoPago: f.metodo_pago,
              nombre: f.comprador_nombre,
              telefono: f.comprador_telefono,
            },
            items
          ),
        }
      : {}),
  };
}

function leerPedido(id: string): FilaPedido {
  const fila = db
    .prepare(`SELECT ${COLUMNAS} FROM pedidos WHERE id = ?`)
    .get(id) as FilaPedido | undefined;
  if (!fila) throw new ErrorNegocio("Pedido no encontrado", 404);
  return fila;
}

/* ---------- Crear pedido ---------- */

interface DatosPedido {
  nombre: string;
  telefono: string;
  direccion: string;
  entrega: Entrega;
  items: { productoId: string; cantidad: number }[];
  metodo: Metodo;
  ultimos4: string | null;
}

const texto = (valor: unknown, max: number) =>
  typeof valor === "string" ? valor.trim().slice(0, max) : "";

function validarPedido(body: unknown): DatosPedido {
  const b = (body ?? {}) as Record<string, unknown>;
  const comprador = (b.comprador ?? {}) as Record<string, unknown>;

  const nombre = texto(comprador.nombre, 100);
  const telefono = texto(comprador.telefono, 40);
  const entrega: Entrega = b.entrega === "envio" ? "envio" : "retiro";
  const direccion = entrega === "envio" ? texto(comprador.direccion, 200) : "";

  if (!nombre || !telefono) {
    throw new ErrorNegocio("Nombre y teléfono son obligatorios");
  }
  if (entrega === "envio" && direccion.length < 5) {
    throw new ErrorNegocio("Ingresá la dirección de entrega");
  }

  if (!Array.isArray(b.items) || b.items.length === 0 || b.items.length > 50) {
    throw new ErrorNegocio("El pedido no tiene productos");
  }

  // Si un mismo producto viene repetido, sumamos las cantidades
  const acumulado = new Map<string, number>();
  for (const item of b.items as Record<string, unknown>[]) {
    const productoId = typeof item?.productoId === "string" ? item.productoId : "";
    const cantidad = item?.cantidad;
    if (
      !productoId ||
      !Number.isInteger(cantidad) ||
      (cantidad as number) < 1 ||
      (cantidad as number) > 999
    ) {
      throw new ErrorNegocio("Los productos del pedido no son válidos");
    }
    acumulado.set(productoId, (acumulado.get(productoId) ?? 0) + (cantidad as number));
  }

  if (!METODOS.includes(b.metodoPago as Metodo)) {
    throw new ErrorNegocio("Forma de pago no válida");
  }
  const metodo = b.metodoPago as Metodo;

  // DEMO: el pago con tarjeta se simula en el frontend. Con una pasarela
  // real (Mercado Pago), el servidor confirmaría el pago por su cuenta.
  let ultimos4: string | null = null;
  if (metodo === "tarjeta") {
    if (typeof b.tarjetaUltimos4 !== "string" || !/^\d{4}$/.test(b.tarjetaUltimos4)) {
      throw new ErrorNegocio("Falta confirmar el pago con tarjeta");
    }
    ultimos4 = b.tarjetaUltimos4;
  }

  return {
    nombre,
    telefono,
    direccion,
    entrega,
    items: [...acumulado].map(([productoId, cantidad]) => ({ productoId, cantidad })),
    metodo,
    ultimos4,
  };
}

const obtenerProducto = db.prepare(
  "SELECT nombre, precio, stock FROM productos WHERE id = ?"
);
const descontar = db.prepare("UPDATE productos SET stock = stock - ? WHERE id = ?");
const reponer = db.prepare("UPDATE productos SET stock = stock + ? WHERE id = ?");
const existeCodigo = db.prepare("SELECT 1 FROM pedidos WHERE codigo = ?");
const insertarPedido = db.prepare(
  `INSERT INTO pedidos
   (id, codigo, fecha, comprador_nombre, comprador_telefono, comprador_direccion,
    total, metodo_pago, estado, tarjeta_ultimos4, entrega)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertarItem = db.prepare(
  `INSERT INTO pedido_items (pedido_id, producto_id, nombre, precio, cantidad)
   VALUES (?, ?, ?, ?, ?)`
);
const insertarFlete = db.prepare(
  `INSERT INTO fletes
   (id, pedido_id, codigo, token, origen_direccion, destino_direccion,
    destino_lat, destino_lng, distancia_km, ganancia, estado, creado_en)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`
);

// Sin letras ni números ambiguos (0/O, 1/I) para que sea fácil de dictar
function generarCodigo(): string {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let codigo: string;
  do {
    codigo = "LL-";
    for (let i = 0; i < 6; i++) codigo += letras[randomInt(letras.length)];
  } while (existeCodigo.get(codigo));
  return codigo;
}

// Todo dentro de una transacción: o se guarda todo, o no se guarda nada
const crearPedido = db.transaction(
  (datos: DatosPedido, ruta: Ruta | null): string => {
    let total = 0;
    const lineas = datos.items.map((it) => {
      const producto = obtenerProducto.get(it.productoId) as
        | { nombre: string; precio: number; stock: number }
        | undefined;
      if (!producto) {
        throw new ErrorNegocio("Un producto del carrito ya no está disponible", 409);
      }
      if (producto.stock < it.cantidad) {
        throw new ErrorNegocio(`Stock insuficiente para ${producto.nombre}`, 409);
      }
      descontar.run(it.cantidad, it.productoId);
      total += producto.precio * it.cantidad; // el precio sale de la base
      return {
        productoId: it.productoId,
        nombre: producto.nombre,
        precio: producto.precio,
        cantidad: it.cantidad,
      };
    });

    const id = randomUUID();
    const ahora = new Date().toISOString();

    insertarPedido.run(
      id,
      generarCodigo(),
      ahora,
      datos.nombre,
      datos.telefono,
      datos.direccion,
      total,
      datos.metodo,
      datos.metodo === "tarjeta" ? "pagado" : "pendiente",
      datos.ultimos4,
      datos.entrega
    );
    for (const l of lineas) {
      insertarItem.run(id, l.productoId, l.nombre, l.precio, l.cantidad);
    }

    // Con envío, se crea el viaje del flete junto con el pedido
    if (datos.entrega === "envio") {
      const km = ruta?.km ?? null;
      insertarFlete.run(
        randomUUID(),
        id,
        generarCodigoFlete(),
        generarToken(),
        LOCAL_DIRECCION,
        datos.direccion,
        ruta?.destino?.lat ?? null,
        ruta?.destino?.lng ?? null,
        km,
        calcularGanancia(km),
        ahora
      );
    }

    return id;
  }
);

// Público: lo usa el cliente al comprar
rutasPedidos.post("/", async (req, res, next) => {
  try {
    const datos = validarPedido(req.body);
    // La distancia se calcula antes de la transacción (es una consulta externa)
    const ruta = datos.entrega === "envio" ? await calcularRuta(datos.direccion) : null;
    const id = crearPedido(datos, ruta);
    res.status(201).json(aPedido(leerPedido(id)));
  } catch (error) {
    next(error);
  }
});

/* ---------- Consultar ---------- */

// Admin: historial con filtros (estado, metodo, desde, hasta, q)
rutasPedidos.get("/", requerirAdmin, (req, res) => {
  const { estado, metodo, desde, hasta, q } = req.query;
  const where: string[] = [];
  const params: string[] = [];

  if (typeof estado === "string" && ESTADOS.includes(estado as Estado)) {
    where.push("estado = ?");
    params.push(estado);
  }
  if (typeof metodo === "string" && METODOS.includes(metodo as Metodo)) {
    where.push("metodo_pago = ?");
    params.push(metodo);
  }

  const aIso = (v: unknown) =>
    typeof v === "string" && !Number.isNaN(Date.parse(v))
      ? new Date(v).toISOString()
      : null;
  const fechaDesde = aIso(desde);
  const fechaHasta = aIso(hasta);
  if (fechaDesde) {
    where.push("fecha >= ?");
    params.push(fechaDesde);
  }
  if (fechaHasta) {
    where.push("fecha < ?"); // "hasta" no incluye el instante exacto
    params.push(fechaHasta);
  }

  if (typeof q === "string" && q.trim()) {
    where.push("(codigo LIKE ? OR comprador_nombre LIKE ?)");
    const like = `%${q.trim()}%`;
    params.push(like, like);
  }

  const sql = `SELECT ${COLUMNAS} FROM pedidos
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY fecha DESC LIMIT 500`;
  const filas = db.prepare(sql).all(...params) as FilaPedido[];
  res.json(filas.map((f) => aPedido(f, true)));
});

// Público por id: lo usa el cliente para ver su comprobante. El id es un
// UUID imposible de adivinar, por eso alcanza como "llave" del comprobante.
// Nunca incluye los datos del flete.
rutasPedidos.get("/:id", (req, res) => {
  res.json(aPedido(leerPedido(req.params.id)));
});

/* ---------- Cambiar estado (admin) ---------- */

const cancelar = db.transaction((id: string) => {
  const items = db
    .prepare("SELECT producto_id, cantidad FROM pedido_items WHERE pedido_id = ?")
    .all(id) as { producto_id: string; cantidad: number }[];
  for (const item of items) reponer.run(item.cantidad, item.producto_id);
  db.prepare("UPDATE pedidos SET estado = 'cancelado' WHERE id = ?").run(id);
  db.prepare(
    "UPDATE fletes SET estado = 'cancelado' WHERE pedido_id = ? AND estado <> 'entregado'"
  ).run(id);
});

rutasPedidos.patch("/:id", requerirAdmin, (req, res) => {
  const actual = leerPedido(
    Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  );
  const nuevo = req.body?.estado;

  if (nuevo === "pagado") {
    if (actual.estado === "cancelado") {
      throw new ErrorNegocio(
        "Un pedido cancelado no se puede marcar como pagado",
        409
      );
    }
    db.prepare("UPDATE pedidos SET estado = 'pagado' WHERE id = ?").run(actual.id);
  } else if (nuevo === "cancelado") {
    if (actual.estado !== "cancelado") cancelar(actual.id); // repone el stock
  } else {
    throw new ErrorNegocio("Estado no válido");
  }

  res.json(aPedido(leerPedido(actual.id), true));
});

/* ---------- Viaje del flete (admin) ---------- */

// Cambios posibles: { estado: "enviado" | "entregado", ganancia: número }
rutasPedidos.patch("/:id/flete", requerirAdmin, (req, res) => {
  const pedido = leerPedido(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const flete = obtenerFlete.get(pedido.id) as FilaFlete | undefined;
  if (!flete) throw new ErrorNegocio("Este pedido no tiene envío", 404);

  const { estado, ganancia } = req.body ?? {};
  const cerrado = flete.estado === "entregado" || flete.estado === "cancelado";
  const ahora = new Date().toISOString();

  if (ganancia !== undefined) {
    if (!Number.isInteger(ganancia) || ganancia < 0 || ganancia > 100_000_000) {
      throw new ErrorNegocio("La ganancia debe ser un número entero, 0 o más");
    }
    if (cerrado) throw new ErrorNegocio("Este viaje ya no se puede modificar", 409);
    db.prepare("UPDATE fletes SET ganancia = ? WHERE id = ?").run(ganancia, flete.id);
  }

  if (estado !== undefined) {
    if (estado !== "enviado" && estado !== "entregado") {
      throw new ErrorNegocio("Estado no válido");
    }
    if (flete.estado === "cancelado") {
      throw new ErrorNegocio("Este viaje está cancelado", 409);
    }
    if (estado === "enviado" && flete.estado === "pendiente") {
      db.prepare("UPDATE fletes SET estado = 'enviado', enviado_en = ? WHERE id = ?").run(
        ahora,
        flete.id
      );
    }
    if (estado === "entregado") {
      db.prepare(
        "UPDATE fletes SET estado = 'entregado', entregado_en = ? WHERE id = ?"
      ).run(ahora, flete.id);
    }
  }

  res.json(aPedido(leerPedido(pedido.id), true));
});