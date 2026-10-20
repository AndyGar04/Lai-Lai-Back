// Error "esperable" (datos inválidos, sin stock, no encontrado...)
// que se devuelve al cliente con su código HTTP.
export class ErrorNegocio extends Error {
  estado: number;

  constructor(mensaje: string, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}