import { z } from 'zod';
import { IVehicleRepository } from '../../../domain/repositories/IVehicleRepository';
import type { Vehicle } from '../../../domain/entities/Vehicle';

const FindVehicleSchema = z.object({
  id: z.string().uuid('ID inválido'),
});
export type FindVehicleInput = z.infer<typeof FindVehicleSchema>;

/**
 * Caso de uso: buscar um veículo por ID.
 */
export class FindVehicle {
  constructor(private readonly repo: IVehicleRepository) {}

  async execute(input: unknown): Promise<Vehicle | null> {
    const { id } = FindVehicleSchema.parse(input);
    return await this.repo.findById(id);
  }
}
