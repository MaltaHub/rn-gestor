import { VehicleDTO, VehicleSchema } from '../../dtos/VehicleDTO';
import { IVehicleRepository } from '../../../domain/repositories/IVehicleRepository';

/**
 * Caso de uso: criar um novo veículo.
 */
export class CreateVehicle {
  constructor(private readonly repo: IVehicleRepository) {}

  async execute(input: unknown): Promise<VehicleDTO> {
    // Validação e parsing
    const dto = VehicleSchema.parse(input);

    // Persiste no repositório
    await this.repo.create(dto);

    return dto;
  }
}
