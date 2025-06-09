import { z } from 'zod';

/**
 * Schema de validação e parsing de um veículo.
 * Usa Zod para garantir que todo campo
 * esteja no formato esperado em runtime.
 */
export const VehicleSchema = z.object({
  id: z
    .string()
    .uuid('ID inválido')
    .describe('Identificador único do veículo'),
  plate: z
    .string()
    .regex(/^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/, 'Placa inválida')
    .describe('Placa no formato Mercosul, ex: ABC1D23'),
  model: z.string().min(1, 'Modelo obrigatório'),
  year: z
    .number()
    .int('Ano deve ser inteiro')
    .gte(1900, 'Ano mínimo é 1900')
    .lte(new Date().getFullYear(), 'Ano não pode ser no futuro'),
  mileage: z
    .number()
    .int('Quilometragem deve ser inteiro')
    .nonnegative('Quilometragem não pode ser negativa'),
  price: z.number().nonnegative('Preço não pode ser negativo'),
  status: z.enum(['available', 'reserved', 'sold']),
  /**
   * Lo ja onde o veículo está armazenado.
   * Para multi-tenant futuro, troque para enum dinâmico ou
   * z.enum(['Roberto Automóveis','OutraLoja'])
   */
  store: z.string().min(1, 'Loja obrigatória'),
  local: z.string().optional(),
  documentacao: z.string().optional(),
  fotos_roberto: z.boolean().optional(),
  fotos_rn: z.boolean().optional(),
});

export type VehicleDTO = z.infer<typeof VehicleSchema>;