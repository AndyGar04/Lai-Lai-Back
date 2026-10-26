import { Router } from "express";
import {
  actualizarFletePedido,
  cambiarEstadoPedido,
  crearPedido,
  detallePedido,
  listarPedidos,
} from "../controllers/pedidos.controller";
import { requerirAdmin } from "../controllers/auth.controller";

export const rutasPedidos = Router();

rutasPedidos.post("/", crearPedido);
rutasPedidos.get("/", requerirAdmin, listarPedidos);
rutasPedidos.get("/:id", detallePedido);
rutasPedidos.patch("/:id", requerirAdmin, cambiarEstadoPedido);
rutasPedidos.patch("/:id/flete", requerirAdmin, actualizarFletePedido);