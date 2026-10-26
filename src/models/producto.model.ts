import { db } from "../db";
import { ErrorNegocio } from "../errores";

export const PRODUCTO_COLUMNS = "id, nombre, descripcion, precio, stock, categoria, imagenes";

export interface FilaProducto {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  stock: number;
  categoria: string;
  imagenes: string;
}

export interface DatosProducto {
  nombre: string;
  descripcion: string;
  precio: number;
  stock: number;
  categoria: string;
  imagenes: string[];
}

export function aProducto(f: FilaProducto) {
  return {
    ...f,
    imagenes: JSON.parse(f.imagenes) as string[],
  };
}

export function leerOError(id: string): FilaProducto {
  const fila = db
    .prepare(`SELECT ${PRODUCTO_COLUMNS} FROM productos WHERE id = ?`)
    .get(id) as FilaProducto | undefined;
  if (!fila) throw new ErrorNegocio("Producto no encontrado", 404);
  return fila;
}

export function obtenerIdParametro(id: string | string[]): string {
  return typeof id === "string" ? id : (id[0] ?? "");
}

export function validarProducto(body: unknown): DatosProducto {
  const b = (body ?? {}) as Record<string, unknown>;

  const nombre = typeof b.nombre === "string" ? b.nombre.trim() : "";
  const categoria = typeof b.categoria === "string" ? b.categoria.trim() : "";
  const descripcion = typeof b.descripcion === "string" ? b.descripcion.trim() : "";

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
