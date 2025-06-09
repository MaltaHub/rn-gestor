import { VehicleId } from "@/domain/value-objects/VehicleId";
import { Plate } from "@/domain/value-objects/Plate";

export class Vehicle {
  constructor(
    public readonly id: VehicleId,
    public plate: Plate,
    public model: string,
    public year: number,
    public mileage: number,
    public price: number,
    public store: string,
    public status: "available" | "reserved" | "sold",
    public local?: string,
    public documentacao?: string,
    public fotos_roberto?: boolean,
    public fotos_rn?: boolean
  ) {}

  toPrimitives(): Record<string, any> {
    return {
      id: this.id.value,
      plate: this.plate.value,
      model: this.model,
      year: this.year,
      mileage: this.mileage,
      price: this.price,
      store: this.store,
      status: this.status,
      local: this.local,
      documentacao: this.documentacao,
      fotos_roberto: this.fotos_roberto,
      fotos_rn: this.fotos_rn
    };
  }
}
