import { randomInt, randomUUID } from "node:crypto";
import { db } from "../db";
import { ErrorNegocio } from "../errores";
import { LOCAL_DIRECCION } from "../config";
import { calcularGanancia, generarCodigoFlete, generarToken, type FilaFlete } from "../services/flete";
import { type Ruta } from "../services/mapas";

export const METODOS = ["efectivo", "tarjeta"] as const;
export const ESTADOS = ["pendiente", "pagado", "cancelado"] as const;
export type Metodo = (typeof METODOS)[number];
export type Estado = (typeof ESTADOS)[number];
export type Entrega = "retiro" | "envio";

export interface FilaPedido {
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

export interface FilaItem {
  producto_id: string;
  nombre: string;
  precio: number;
  cantidad: number;
}

export const PEDIDO_COLUMNS = `id, codigo, fecha, comprador_nombre, comprador_telefono,
  comprador_direccion, total, metodo_pago, estado, tarjeta_ultimos4, entrega`;

export interface DatosPedido {
  nombre: string;
  telefono: string;
  direccion: string;
  entrega: Entrega;
  items: { productoId: string; cantidad: number }[];
  metodo: Metodo;
  ultimos4: string | null;
}

export function texto(valor: unknown, max: number) {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}

export function validarPedido(body: unknown): DatosPedido {
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

export const obtenerProducto = db.prepare(
  "SELECT nombre, precio, stock FROM productos WHERE id = ?"
);
export const descontar = db.prepare("UPDATE productos SET stock = stock - ? WHERE id = ?");
export const reponer = db.prepare("UPDATE productos SET stock = stock + ? WHERE id = ?");
export const existeCodigo = db.prepare("SELECT 1 FROM pedidos WHERE codigo = ?");
export const insertarPedido = db.prepare(
  `INSERT INTO pedidos
   (id, codigo, fecha, comprador_nombre, comprador_telefono, comprador_direccion,
    total, metodo_pago, estado, tarjeta_ultimos4, entrega)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
export const insertarItem = db.prepare(
  `INSERT INTO pedido_items (pedido_id, producto_id, nombre, precio, cantidad)
   VALUES (?, ?, ?, ?, ?)`
);
export const insertarFlete = db.prepare(
  `INSERT INTO fletes
   (id, pedido_id, codigo, token, origen_direccion, destino_direccion,
    destino_lat, destino_lng, distancia_km, ganancia, estado, creado_en)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`
);

export function generarCodigoPedido(): string {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let codigo: string;
  do {
    codigo = "LL-";
    for (let i = 0; i < 6; i++) codigo += letras[randomInt(letras.length)];
  } while (existeCodigo.get(codigo));
  return codigo;
}

export function leerPedido(id: string): FilaPedido {
  const fila = db
    .prepare(`SELECT ${PEDIDO_COLUMNS} FROM pedidos WHERE id = ?`)
    .get(id) as FilaPedido | undefined;
  if (!fila) throw new ErrorNegocio("Pedido no encontrado", 404);
  return fila;
}

export function crearPedidoTransaction(
  dbInstance: typeof db,
  datos: DatosPedido,
  ruta: Ruta | null
): string {
  return dbInstance.transaction((pedidoDatos: DatosPedido, rutaDatos: Ruta | null): string => {
    let total = 0;
    const lineas = pedidoDatos.items.map((it) => {
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
      total += producto.precio * it.cantidad;
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
      generarCodigoPedido(),
      ahora,
      pedidoDatos.nombre,
      pedidoDatos.telefono,
      pedidoDatos.direccion,
      total,
      pedidoDatos.metodo,
      pedidoDatos.metodo === "tarjeta" ? "pagado" : "pendiente",
      pedidoDatos.ultimos4,
      pedidoDatos.entrega
    );

    for (const linea of lineas) {
      insertarItem.run(id, linea.productoId, linea.nombre, linea.precio, linea.cantidad);
    }

    if (pedidoDatos.entrega === "envio") {
      const km = rutaDatos?.km ?? null;
      insertarFlete.run(
        randomUUID(),
        id,
        generarCodigoFlete(),
        generarToken(),
        LOCAL_DIRECCION,
        pedidoDatos.direccion,
        rutaDatos?.destino?.lat ?? null,
        rutaDatos?.destino?.lng ?? null,
        km,
        calcularGanancia(km),
        ahora
      );
    }

    return id;
  })(datos, ruta);
}

export const cancelarPedido = db.transaction((id: string) => {
  const items = db
    .prepare("SELECT producto_id, cantidad FROM pedido_items WHERE pedido_id = ?")
    .all(id) as { producto_id: string; cantidad: number }[];
  for (const item of items) reponer.run(item.cantidad, item.producto_id);
  db.prepare("UPDATE pedidos SET estado = 'cancelado' WHERE id = ?").run(id);
  db.prepare(
    "UPDATE fletes SET estado = 'cancelado' WHERE pedido_id = ? AND estado <> 'entregado'"
  ).run(id);
});

export function aPedido(f: FilaPedido, conFlete = false) {
  const items = db
    .prepare(
      "SELECT producto_id, nombre, precio, cantidad FROM pedido_items WHERE pedido_id = ? ORDER BY id"
    )
    .all(f.id) as FilaItem[];
  const flete = conFlete
    ? (db.prepare("SELECT * FROM fletes WHERE pedido_id = ?").get(f.id) as FilaFlete | undefined)
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

function aFlete(
  flete: FilaFlete,
  pedido: { total: number; metodoPago: string; nombre: string; telefono: string },
  items: { nombre: string; cantidad: number }[]
) {
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
    mensaje: "",
    urlWhatsApp: "",
    urlMapa: "",
  };
}
