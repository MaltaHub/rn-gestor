import { IVehicleRepository } from "../repositories/IVehicleRepository";
import { Vehicle } from "../entities/Vehicle";
import { PlateValidationService } from "./PlateValidationService";
import { PriceCalculationService } from "./PriceCalculationService";

export class VehicleDomainService {
  private plateValidator = new PlateValidationService(this.vehicleRepo);
  private priceCalculator = new PriceCalculationService();

  constructor(private vehicleRepo: IVehicleRepository) {}

  /**
   * Atualiza veículo aplicando todas as regras de domínio:
   * 1) Validação de placas únicas
   * 2) Recalcula preço final
   */
  async update(vehicle: Vehicle): Promise<Vehicle> {
    await this.plateValidator.ensureUnique(vehicle.plates);
    const finalPrice = this.priceCalculator.calculateFinalPrice(vehicle);
    vehicle.setFinalPrice(finalPrice);  // supondo método no entity
    return this.vehicleRepo.update(vehicle);
  }

  // aqui você pode adicionar outros métodos, ex: create, delete, etc.
}
