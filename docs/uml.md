# Diagrama UML del backend Lai-Lai

Este diagrama resume las principales entidades y los módulos que interactúan entre sí en la API del backend.

```mermaid
classDiagram
    class App {
      +express()
      +mountRoutes()
      +errorHandler()
    }

    class Config {
      +PORT
      +JWT_SECRET
      +ADMIN_USER
      +ADMIN_PASSWORD
      +ORS_API_KEY
      +LOCAL_DIRECCION
      +FLETE_TARIFA_BASE
      +FLETE_PRECIO_KM
    }

    class Database {
      +productos
      +pedidos
      +pedido_items
      +admins
      +fletes
      +pragma()
      +prepare()
    }

    class ErrorNegocio {
      +message
      +estado
    }

    class AdminModel {
      +sincronizarAdmin()
      +buscarAdminPorUsuario()
      +validarCredenciales()
    }

    class ProductoModel {
      +PRODUCTO_COLUMNS
      +FilaProducto
      +DatosProducto
      +aProducto()
      +leerOError()
      +obtenerIdParametro()
      +validarProducto()
    }

    class PedidoModel {
      +PEDIDO_COLUMNS
      +FilaPedido
      +FilaItem
      +DatosPedido
      +texto()
      +validarPedido()
      +generarCodigoPedido()
      +crearPedidoTransaction()
      +cancelarPedido
      +aPedido()
    }

    class AuthController {
      +requerirAdmin()
      +limitarLogin
      +login()
      +verificar()
    }

    class ProductosController {
      +listarProductos()
      +crearProducto()
      +editarProducto()
      +ajustarStock()
      +eliminarProducto()
    }

    class PedidosController {
      +crearPedido()
      +listarPedidos()
      +detallePedido()
      +cambiarEstadoPedido()
      +actualizarFletePedido()
    }

    class RouterAuth {
      +POST /login
      +GET /verificar
    }

    class RouterProductos {
      +GET /
      +POST /
      +PUT /:id
      +PATCH /:id/stock
      +DELETE /:id
    }

    class RouterPedidos {
      +POST /
      +GET /
      +GET /:id
      +PATCH /:id
      +PATCH /:id/flete
    }

    class MapasService {
      +Punto
      +Ruta
      +calcularRuta()
      +geocodificar()
    }

    class FleteService {
      +EstadoFlete
      +FilaFlete
      +InfoPedido
      +calcularGanancia()
      +generarCodigoFlete()
      +generarToken()
      +aFlete()
    }

    App --> RouterAuth
    App --> RouterProductos
    App --> RouterPedidos

    RouterAuth --> AuthController
    RouterProductos --> ProductosController
    RouterPedidos --> PedidosController

    AuthController --> AdminModel
    AuthController --> Config

    ProductosController --> ProductoModel
    ProductosController --> Database
    ProductosController --> ErrorNegocio

    PedidosController --> PedidoModel
    PedidosController --> MapasService
    PedidosController --> ErrorNegocio

    PedidoModel --> Database
    PedidoModel --> ErrorNegocio
    PedidoModel --> FleteService

    AdminModel --> Database
    AdminModel --> Config

    ProductoModel --> Database
    ProductoModel --> ErrorNegocio

    FleteService --> Database
    FleteService --> Config

    Database --> Config
    MapasService --> Config

    class Pedido {
      +id
      +codigo
      +fecha
      +comprador_nombre
      +comprador_telefono
      +comprador_direccion
      +total
      +metodo_pago
      +estado
      +tarjeta_ultimos4
      +entrega
    }

    class Producto {
      +id
      +nombre
      +descripcion
      +precio
      +stock
      +categoria
      +imagenes
    }

    class Admin {
      +id
      +usuario
      +clave_hash
    }

    class Flete {
      +id
      +pedido_id
      +codigo
      +token
      +origen_direccion
      +destino_direccion
      +destino_lat
      +destino_lng
      +distancia_km
      +ganancia
      +estado
      +creado_en
    }

    Database "1" --> "many" Producto
    Database "1" --> "many" Pedido
    Database "1" --> "many" Admin
    Database "1" --> "many" Flete
```

## Comentario de diseño

- El servidor Express monta tres grupos de rutas principales: autenticación, productos y pedidos.
- Los controladores encapsulan la lógica HTTP y delegan validaciones y persistencia a los modelos.
- Los modelos interactúan con la base SQLite para leer, validar y transformar los datos.
- Los servicios `mapas` y `flete` manejan la geolocalización, cálculo de ruta y datos del envío.
- La clase `ErrorNegocio` centraliza los errores de dominio para devolver respuestas consistentes al cliente.
