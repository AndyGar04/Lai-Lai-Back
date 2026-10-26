import type { NextFunction, Request, Response } from "express";
import { db } from "../db";
import { ErrorNegocio } from "../errores";
import { calcularRuta } from "../services/mapas";
import { type FilaFlete } from "../services/flete";
import {
  aPedido,
  cancelarPedido,
  crearPedidoTransaction,
  ESTADOS,
  leerPedido,
  METODOS,
  type Estado,
  type FilaPedido,
  type Metodo,
  PEDIDO_COLUMNS,
  validarPedido,
} from "../models/pedido.model";

export async function crearPedido(req: Request, res: Response, next: NextFunction) {
  try {
    const datos = validarPedido(req.body);
    const ruta = datos.entrega === "envio" ? await calcularRuta(datos.direccion) : null;
    const id = crearPedidoTransaction(db, datos, ruta);
    res.status(201).json(aPedido(leerPedido(id)));
  } catch (error) {
    next(error);
  }
}

export function listarPedidos(req: Request, res: Response) {
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
    where.push("fecha < ?");
    params.push(fechaHasta);
  }
  if (typeof q === "string" && q.trim()) {
    where.push("(codigo LIKE ? OR comprador_nombre LIKE ?)");
    const like = `%${q.trim()}%`;
    params.push(like, like);
  }

  const sql = `SELECT ${PEDIDO_COLUMNS} FROM pedidos
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY fecha DESC LIMIT 500`;
  const filas = db.prepare(sql).all(...params) as FilaPedido[];
  res.json(filas.map((f) => aPedido(f, true)));
}

export function detallePedido(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  res.json(aPedido(leerPedido(id)));
}

export function cambiarEstadoPedido(req: Request, res: Response) {
  const actual = leerPedido(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const nuevo = req.body?.estado;

  if (nuevo === "pagado") {
    if (actual.estado === "cancelado") {
      throw new ErrorNegocio("Un pedido cancelado no se puede marcar como pagado", 409);
    }
    db.prepare("UPDATE pedidos SET estado = 'pagado' WHERE id = ?").run(actual.id);
  } else if (nuevo === "cancelado") {
    if (actual.estado !== "cancelado") cancelarPedido(actual.id);
  } else {
    throw new ErrorNegocio("Estado no válido");
  }

  res.json(aPedido(leerPedido(actual.id), true));
}

export function actualizarFletePedido(req: Request, res: Response) {
  const pedido = leerPedido(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const obtenerFlete = db.prepare("SELECT * FROM fletes WHERE pedido_id = ?");
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
}
