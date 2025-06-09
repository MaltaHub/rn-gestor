import { VehicleDTO } from "@/application/dtos/VehicleDTO";
import { Vehicle } from "@/domain/entities/Vehicle";
import { VehicleId } from "@/domain/value-objects/VehicleId";
import { Plate } from "@/domain/value-objects/Plate";

export class VehicleMapper {
  static toEntity(dto: VehicleDTO): Vehicle {
    return new Vehicle(
      new VehicleId(dto.id),
      new Plate(dto.plate),
      dto.model,
      dto.year,
      dto.mileage,
      dto.price,
      dto.store,
      dto.status,
      dto.local,
      dto.documentacao,
      dto.fotos_roberto,
      dto.fotos_rn
    );
  }

  static toDTO(entity: Vehicle): VehicleDTO {
    return {
      id: entity.id.value,
      plate: entity.plate.value,
      model: entity.model,
      year: entity.year,
      mileage: entity.mileage,
      price: entity.price,
      store: entity.store,
      status: entity.status,
      local: entity.local,
      documentacao: entity.documentacao,
      fotos_roberto: entity.fotos_roberto,
      fotos_rn: entity.fotos_rn
    };
  }
}
