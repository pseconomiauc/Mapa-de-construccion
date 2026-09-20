// ==============================================================================
// TIPOS DE DATOS: CADENA DE LA CONSTRUCCIÓN EN CARABOBO
// ==============================================================================

export type TipoActor = 'F' | 'D' | 'C' | 'S' | 'A';

export const DESCRIPCION_ACTORES: Record<TipoActor, string> = {
  F: 'Fabricante',
  D: 'Distribuidor',
  C: 'Contratista',
  S: 'Servicio profesional',
  A: 'Alquiler / logística'
};

export const MUNICIPIOS_CARABOBO = [
  'Bejuma',
  'Carlos Arvelo',
  'Diego Ibarra',
  'Guacara',
  'Juan José Mora',
  'Libertador',
  'Los Guayos',
  'Miranda',
  'Montalbán',
  'Naguanagua',
  'Puerto Cabello',
  'San Diego',
  'San Joaquín',
  'Valencia'
] as const;

export type MunicipioCarabobo = (typeof MUNICIPIOS_CARABOBO)[number];

export interface Categoria {
  slug: string;
  codigo?: string;
  rama_id: number;
  rama_codigo?: string;
  rama_nombre: string;
  grupo_id?: number;
  grupo_codigo?: string;
  grupo: string;
  id?: number;
  nombre: string;
  actores: TipoActor[];
  orden: number;
}

export interface Empresa {
  id: string;
  nombre: string;
  direccion?: string | null;
  municipio?: MunicipioCarabobo | null;
  lat?: number | null;
  lng?: number | null;
  productos?: string | null;
  productos_original?: string | null;
  servicios?: string | null;
  marca?: string | null;
  telefono?: string | null;
  whatsapp?: string | null;
  correo?: string | null;
  revisar?: boolean;
  nota_revision?: string | null;
  direccion_precisa?: boolean;
  contacto_verificado?: boolean;
  fuente?: string | null;
  tipo_registro?: 'empresa' | 'referencia_generica';
  creado_en: string;
  actualizado_en: string;
  creado_por?: string | null;
}

export interface EmpresaCategoria {
  empresa_id: string;
  categoria_slug: string;
  creado_en?: string;
}

export interface UserRole {
  user_id: string;
  role: 'editor' | 'admin';
  creado_en: string;
}
