import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { PORT } from "./config";
import { UPLOADS_DIR } from "./db";
import { rutasAuth, sincronizarAdmin } from "./auth";
import { rutasProductos } from "./rutas/productos";
import { rutasPedidos } from "./rutas/pedidos";
import { ErrorNegocio } from "./errores";

sincronizarAdmin();

const app = express();
app.disable("x-powered-by");

// Las fotos subidas (los nombres son únicos, se pueden cachear)
app.use("/uploads", express.static(UPLOADS_DIR, { maxAge: "7d", immutable: true }));

// Cada grupo de rutas tiene su límite de tamaño: solo los productos
// reciben imágenes y necesitan uno más grande.
app.use("/api/auth", express.json({ limit: "10kb" }), rutasAuth);
app.use("/api/productos", express.json({ limit: "15mb" }), rutasProductos);
app.use("/api/pedidos", express.json({ limit: "100kb" }), rutasPedidos);

app.get("/api/salud", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "No encontrado" });
});

// Manejo de errores: cualquier throw de las rutas termina acá
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ErrorNegocio) {
    res.status(err.estado).json({ error: err.message });
    return;
  }

  const estado = (err as { status?: number })?.status;
  if (estado === 413) {
    res.status(413).json({ error: "El contenido enviado es demasiado grande" });
    return;
  }
  if (estado === 400) {
    res.status(400).json({ error: "Solicitud no válida" });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
});

app.listen(PORT, () => {
  console.log(`Servidor de Lai Lai escuchando en http://localhost:${PORT}`);
});