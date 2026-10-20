import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { requerirAdmin } from "../auth";
import { ErrorNegocio } from "../errores";
import { borrarImagenes, guardarImagenes } from "../imagenes";

export const rutasProductos = Router();

const COLUMNAS = "id, nombre, descripcion, precio, stock, categoria, imagenes";

interface FilaProducto {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  stock: number;
  categoria: string;
  imagenes: string; // JSON
}

interface DatosProducto {
  nombre: string;
  descripcion: string;
  precio: number;
  stock: number;
  categoria: string;
  imagenes: string[];
}

const aProducto = (f: FilaProducto) => ({
  ...f,
  imagenes: JSON.parse(f.imagenes) as string[],
});

function leerOError(id: string): FilaProducto {
  const fila = db
    .prepare(`SELECT ${COLUMNAS} FROM productos WHERE id = ?`)
    .get(id) as FilaProducto | undefined;
  if (!fila) throw new ErrorNegocio("Producto no encontrado", 404);
  return fila;
}

function obtenerIdParametro(id: string | string[]): string {
  return typeof id === "string" ? id : (id[0] ?? "");
}

function validar(body: unknown): DatosProducto {
  const b = (body ?? {}) as Record<string, unknown>;

  const nombre = typeof b.nombre === "string" ? b.nombre.trim() : "";
  const categoria = typeof b.categoria === "string" ? b.categoria.trim() : "";
  const descripcion =
    typeof b.descripcion === "string" ? b.descripcion.trim() : "";

  if (!nombre || !categoria) {
    throw new ErrorNegocio("Nombre y categoría son obligatorios");
  }
  if (nombre.length > 120 || categoria.length > 60 || descripcion.length > 1000) {
    throw new ErrorNegocio("Alguno de los textos es demasiado largo");
  }
  if (!Number.isInteger(b.precio) || (b.precio as number) <= 0) {
    throw new ErrorNegocio("El precio debe ser un número entero mayor a 0");
  }
  if (!Number.isInteger(b.stock) || (b.stock as number) < 0) {
    throw new ErrorNegocio("El stock debe ser un número entero, 0 o más");
  }

  const imagenes = b.imagenes ?? [];
  if (
    !Array.isArray(imagenes) ||
    imagenes.length > 5 ||
    !imagenes.every((i) => typeof i === "string")
  ) {
    throw new ErrorNegocio("Imágenes no válidas (máximo 5 por producto)");
  }

  return {
    nombre,
    categoria,
    descripcion,
    precio: b.precio as number,
    stock: b.stock as number,
    imagenes: imagenes as string[],
  };
}

// Público: el catálogo
rutasProductos.get("/", (_req, res) => {
  const filas = db
    .prepare(`SELECT ${COLUMNAS} FROM productos ORDER BY creado_en, rowid`)
    .all() as FilaProducto[];
  res.json(filas.map(aProducto));
});

// Crear (admin)
rutasProductos.post("/", requerirAdmin, (req, res) => {
  const datos = validar(req.body);
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
});

// Editar (admin)
rutasProductos.put("/:id", requerirAdmin, (req, res) => {
  const actual = leerOError(obtenerIdParametro(req.params.id));
  const datos = validar(req.body);
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

  // Borramos del disco las fotos que se quitaron
  borrarImagenes(anteriores.filter((u) => !imagenes.includes(u)));
  res.json(aProducto(leerOError(actual.id)));
});

// Ajustar stock sumando o restando (admin). Es atómico: no pisa las
// ventas que hayan ocurrido mientras el dueño tenía la pantalla abierta.
rutasProductos.patch("/:id/stock", requerirAdmin, (req, res) => {
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
});

// Eliminar (admin)
rutasProductos.delete("/:id", requerirAdmin, (req, res) => {
  const actual = leerOError(obtenerIdParametro(req.params.id));
  db.prepare("DELETE FROM productos WHERE id = ?").run(actual.id);
  borrarImagenes(JSON.parse(actual.imagenes) as string[]);
  res.status(204).end();
});