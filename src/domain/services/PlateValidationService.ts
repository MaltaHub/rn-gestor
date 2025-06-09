import { IVehicleRepository } from "../repositories/IVehicleRepository";

export class PlateValidationService {
  constructor(private vehicleRepo: IVehicleRepository) {}

  /**  
   * Garante que nenhuma das placas já exista em anúncio ativo  
   * @throws Error se encontrar duplicidade  
   */
  async ensureUnique(plates: string[]): Promise<void> {
    for (const plate of plates) {
      const existing = await this.vehicleRepo.findByPlate(plate);
      if (existing) {
        throw new Error(`Já existe um anúncio com a placa ${plate}`);
      }
    }
  }
}
