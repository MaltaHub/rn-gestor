import { z } from 'zod';
import { IVehicleRepository } from '../../../domain/repositories/IVehicleRepository';

/**
 * Caso de uso: excluir um veículo por ID.
 */
const DeleteVehicleSchema = z.object({
  id: z.string().uuid('ID inválido'),
});
export type DeleteVehicleInput = z.infer<typeof DeleteVehicleSchema>;

export class DeleteVehicle {
  constructor(private readonly repo: IVehicleRepository) {}

  async execute(input: unknown): Promise<void> {
    const { id } = DeleteVehicleSchema.parse(input);
    await this.repo.delete(id);
  }
}
