import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { db } from "../db";
import { ErrorNegocio } from "../errores";
import { borrarImagenes, guardarImagenes } from "../imagenes";
import {
  PRODUCTO_COLUMNS,
  aProducto,
  leerOError,
  obtenerIdParametro,
  validarProducto,
} from "../models/producto.model";

export function listarProductos(_req: Request, res: Response) {
  const filas = db
    .prepare(`SELECT ${PRODUCTO_COLUMNS} FROM productos ORDER BY creado_en, rowid`)
    .all() as Array<{
      id: string;
      nombre: string;
      descripcion: string;
      precio: number;
      stock: number;
      categoria: string;
      imagenes: string;
    }>;
  res.json(filas.map(aProducto));
}

export function crearProducto(req: Request, res: Response) {
  const datos = validarProducto(req.body);
  const imagenes = guardarImagenes(datos.imagenes);
  const id = randomUUID();

  try {
    db.prepare(
      `INSERT INTO productos (id, nombre, descripcion, precio, stock, categoria, imagenes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      datos.nombre,
      datos.descripcion,
      datos.precio,
      datos.stock,
      datos.categoria,
      JSON.stringify(imagenes)
    );
  } catch (error) {
    borrarImagenes(imagenes);
    throw error;
  }

  res.status(201).json(aProducto(leerOError(id)));
}

export function editarProducto(req: Request, res: Response) {
  const actual = leerOError(obtenerIdParametro(req.params.id));
  const datos = validarProducto(req.body);
  const anteriores = JSON.parse(actual.imagenes) as string[];
  const imagenes = guardarImagenes(datos.imagenes);

  try {
    db.prepare(
      `UPDATE productos
       SET nombre = ?, descripcion = ?, precio = ?, stock = ?, categoria = ?, imagenes = ?
       WHERE id = ?`
    ).run(
      datos.nombre,
      datos.descripcion,
      datos.precio,
      datos.stock,
      datos.categoria,
      JSON.stringify(imagenes),
      actual.id
    );
  } catch (error) {
    borrarImagenes(imagenes.filter((u) => !anteriores.includes(u)));
    throw error;
  }

  borrarImagenes(anteriores.filter((u) => !imagenes.includes(u)));
  res.json(aProducto(leerOError(actual.id)));
}

export function ajustarStock(req: Request, res: Response) {
  const id = obtenerIdParametro(req.params.id);
  const delta = req.body?.delta;
  if (!Number.isInteger(delta) || Math.abs(delta) > 100000) {
    throw new ErrorNegocio("El ajuste de stock no es válido");
  }

  const resultado = db
    .prepare("UPDATE productos SET stock = MAX(0, stock + ?) WHERE id = ?")
    .run(delta, id);
  if (resultado.changes === 0) {
    throw new ErrorNegocio("Producto no encontrado", 404);
  }

  res.json(aProducto(leerOError(id)));
}

export function eliminarProducto(req: Request, res: Response) {
  const actual = leerOError(obtenerIdParametro(req.params.id));
  db.prepare("DELETE FROM productos WHERE id = ?").run(actual.id);
  borrarImagenes(JSON.parse(actual.imagenes) as string[]);
  res.status(204).end();
}
