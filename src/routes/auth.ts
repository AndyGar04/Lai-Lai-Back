import { Router } from "express";
import { login, requerirAdmin, sincronizarAdmin, verificar, limitarLogin } from "../controllers/auth.controller";

export const rutasAuth = Router();

rutasAuth.post("/login", limitarLogin, login);
rutasAuth.get("/verificar", requerirAdmin, verificar);

export { sincronizarAdmin };
