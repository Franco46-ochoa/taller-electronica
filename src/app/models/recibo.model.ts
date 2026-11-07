export interface Cliente {
  nombre: string;
  direccion: string;
  telefono: string;
}

export interface Aparato {
  tipo: string;
  marca: string;
  modelo: string;
  numSerie: string;
}

export type EstadoRecibo = 'Pendiente' | 'Entregado';

export interface Presupuesto {
  diagnostico: string;
  costo: number;
  fecha: string;
}

export interface Recibo {
  id: string;
  fecha: Date;
  cliente: Cliente;
  aparato: Aparato;
  observaciones: string;
  estado: EstadoRecibo;
  costoReparacion: number;
  presupuesto?: Presupuesto;
  fechaEntrega?: Date;
}

export interface Balance {
  totalIngresados: number;
  totalPendientes: number;
  totalEntregados: number;
  gananciasTotales: number;
}