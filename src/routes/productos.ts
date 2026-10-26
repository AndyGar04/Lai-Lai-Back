import { Router } from "express";
import { requerirAdmin } from "../controllers/auth.controller";
import {
  ajustarStock,
  crearProducto,
  editarProducto,
  eliminarProducto,
  listarProductos,
} from "../controllers/productos.controller";

export const rutasProductos = Router();

rutasProductos.get("/", listarProductos);
rutasProductos.post("/", requerirAdmin, crearProducto);
rutasProductos.put("/:id", requerirAdmin, editarProducto);
rutasProductos.patch("/:id/stock", requerirAdmin, ajustarStock);
rutasProductos.delete("/:id", requerirAdmin, eliminarProducto);