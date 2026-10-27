import { Router } from "express";
import {
  actualizarFletePedido,
  cambiarEstadoPedido,
  crearPedido,
  detallePedido,
  listarPedidos,
  resumenVentasPorDia,
} from "../controllers/pedidos.controller";
import { requerirAdmin } from "../controllers/auth.controller";

export const rutasPedidos = Router();

rutasPedidos.post("/", crearPedido);
rutasPedidos.get("/", requerirAdmin, listarPedidos);
rutasPedidos.get("/resumen-dia", requerirAdmin, resumenVentasPorDia);
rutasPedidos.get("/:id", detallePedido);
rutasPedidos.patch("/:id", requerirAdmin, cambiarEstadoPedido);
rutasPedidos.patch("/:id/flete", requerirAdmin, actualizarFletePedido);