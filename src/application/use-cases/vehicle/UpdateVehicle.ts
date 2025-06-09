import { VehicleDTO, VehicleSchema } from '../../dtos/VehicleDTO';
import { IVehicleRepository } from '../../../domain/repositories/IVehicleRepository';
import { ZodError } from 'zod';

/**
 * Caso de uso: atualizar dados de um veículo.
 * Faz validação via Zod e delega à camada de repositório.
 */
export class UpdateVehicle {
  constructor(private readonly repo: IVehicleRepository) {}

  /**
   * @param input Dados brutos (por ex. do REST/RPC).
   * @throws ZodError se os dados não estiverem conformes o schema.
   */
  async execute(input: unknown): Promise<VehicleDTO> {
    // valida e faz parse automático
    const dto: VehicleDTO = VehicleSchema.parse(input);

    // persiste no repositório
    await this.repo.update(dto.id, dto);

    // devolve o objeto validado
    return dto;
  }
}