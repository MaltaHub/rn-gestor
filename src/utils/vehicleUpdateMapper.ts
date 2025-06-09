
import { Vehicle, VehicleWithIndicators } from "@/types";

// Função para mapear VehicleWithIndicators para Vehicle, filtrando apenas campos válidos da tabela vehicles
export const mapVehicleWithIndicatorsToVehicle = (vehicleWithIndicators: Partial<VehicleWithIndicators>): Partial<Vehicle> => {
  // Campos que existem na tabela vehicles (baseado no schema do banco)
  const validVehicleFields: (keyof Vehicle)[] = [
    'id',
    'plate',
    'model', 
    'color',
    'mileage',
    'image_url',
    'price',
    'year',
    'description',
    'specifications',
    'status',
    'added_at',
    'user_id',
    'store',
    'local',
    'documentacao',
    'fotos_roberto',
    'fotos_rn'
  ];

  const filteredVehicle: Partial<Vehicle> = {};

  // Filtrar apenas os campos válidos que existem na tabela vehicles
  validVehicleFields.forEach(field => {
    if (vehicleWithIndicators.hasOwnProperty(field)) {
      (filteredVehicle as any)[field] = vehicleWithIndicators[field];
    }
  });

  return filteredVehicle;
};
