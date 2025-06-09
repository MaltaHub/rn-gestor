// src/infrastructure/di.ts

import { VehicleRepositorySupabase } from './supabase/repositories/VehicleRepositorySupabase';
import { CreateVehicle } from '../application/use-cases/vehicle/CreateVehicle';
import { UpdateVehicle } from '../application/use-cases/vehicle/UpdateVehicle';
import { DeleteVehicle } from '../application/use-cases/vehicle/DeleteVehicle';
import { FindVehicle } from '../application/use-cases/vehicle/FindVehicle';
import type { IVehicleRepository } from '../domain/repositories/IVehicleRepository';

// 1. Instanciar o repositório concreto
const vehicleRepo: IVehicleRepository = new VehicleRepositorySupabase();

// 2. Exportar instâncias dos casos de uso, já “injetadas”
export const createVehicleUseCase = new CreateVehicle(vehicleRepo);
export const updateVehicleUseCase = new UpdateVehicle(vehicleRepo);
export const deleteVehicleUseCase = new DeleteVehicle(vehicleRepo);
export const findVehicleUseCase   = new FindVehicle(vehicleRepo);
