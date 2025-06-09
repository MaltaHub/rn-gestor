import { Vehicle } from "../entities/Vehicle";

export class PriceCalculationService {
  /**  
   * Exemplo: adiciona 5% de comissão sobre o preço bruto  
   */
  calculateFinalPrice(vehicle: Vehicle): number {
    const commissionRate = 0.05;
    return vehicle.price + vehicle.price * commissionRate;
  }
}
