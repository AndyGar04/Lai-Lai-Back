# Lai-Lai Backend

Backend de la tienda/servicio Lai-Lai, construido con Node.js, TypeScript y Express. Gestiona autenticación de administrador, catálogo de productos, pedidos, stock y despacho con flete opcional.

## Descripción general

Este proyecto expone una API REST para:

- Autenticar al administrador con JWT.
- Administrar productos (listar, crear, editar, ajustar stock, eliminar).
- Registrar y consultar pedidos del cliente.
- Cambiar estado de pedidos.
- Generar datos de flete para envíos y calcular ruta con OpenRouteService.

## Stack

- Node.js
- TypeScript
- Express
- SQLite (better-sqlite3)
- JWT
- bcryptjs
- express-rate-limit

## Estructura del proyecto

```text
Lai-Lai-Back/
├─ data/
├─ docs/
│  └─ uml.md
├─ src/
│  ├─ controllers/
│  ├─ db/
│  ├─ models/
│  ├─ routes/
│  ├─ services/
│  ├─ auth.ts
│  ├─ config.ts
│  ├─ errores.ts
│  ├─ imagenes.ts
│  ├─ index.ts
│  └─ migraciones.ts
├─ uploads/
├─ .env
├─ .env.example
├─ package.json
├─ tsconfig.json
├─ README.md
└─ ...
```

## Requisitos

- Node.js 18 o superior
- npm
- Archivo `.env` configurado con variables mínimas

## Instalación

1. Clonar el repositorio.
2. Instalar dependencias:

```bash
npm install
```

3. Crear el archivo `.env` a partir del ejemplo:

```bash
cp .env.example .env
```

4. Completar las variables necesarias:

```env
PORT=3001
JWT_SECRET=tu_clave_secreta_muy_larga
ADMIN_USER=admin
ADMIN_PASSWORD=tu_password_seguro
```

Opcionales para fletes:

```env
ORS_API_KEY=tu_clave_openrouteservice
LOCAL_DIRECCION=Av. Siempre Viva 123, Buenos Aires, AR
PAIS_GEOCODIFICACION=AR
FLETE_TARIFA_BASE=1200
FLETE_PRECIO_KM=210
FLETE_TELEFONO=5491123456789
```

## Scripts

```bash
npm run dev
npm start
npm run typecheck
```

- `npm run dev`: inicia el servidor en modo watch con `tsx`.
- `npm start`: ejecuta la aplicación en modo normal.
- `npm run typecheck`: valida tipos de TypeScript sin generar salida.

## API

### Autenticación

- `POST /api/auth/login`
  - Body: `{ usuario, clave }`
  - Devuelve un JWT si las credenciales son válidas.

- `GET /api/auth/verificar`
  - Requiere token Bearer.
  - Verifica la sesión activa.

### Productos

- `GET /api/productos`
- `POST /api/productos` (admin)
- `PUT /api/productos/:id` (admin)
- `PATCH /api/productos/:id/stock` (admin)
- `DELETE /api/productos/:id` (admin)

### Pedidos

- `POST /api/pedidos`
- `GET /api/pedidos` (admin)
- `GET /api/pedidos/:id`
- `PATCH /api/pedidos/:id` (admin)
- `PATCH /api/pedidos/:id/flete` (admin)

### Salud

- `GET /api/salud`

## Base de datos

La app usa SQLite con la base ubicada en `data/lailai.db`.

Tablas principales:

- `productos`
- `pedidos`
- `pedido_items`
- `admins`
- `fletes`

## Archivos importantes

- `src/index.ts`: arranque del servidor.
- `src/config.ts`: carga y validación de variables de entorno.
- `src/db/index.ts`: conexión y creación de tablas.
- `src/controllers/*.ts`: lógica de cada endpoint.
- `src/models/*.ts`: validaciones y mapeos de modelos.
- `src/services/*.ts`: lógica de rutas y fletes.
- `src/errores.ts`: errores de negocio centralizados.

## Diagrama UML

El diagrama de clases del sistema está en:

- `docs/uml.md`

Puedes abrirlo también aquí:

[Diagrama UML](./docs/uml.md)

## Observaciones

- Los productos se almacenan con imágenes en la carpeta `uploads/`.
- La API devuelve errores de negocio con códigos HTTP estandarizados.
- El token de sesión tiene duración de 8 horas.

## Estado del proyecto

Este backend está en fase de desarrollo y evolución, con una estructura modular pensada para escalar con nuevos módulos y servicios.
