import { Vehicle } from '../entities/Vehicle';

// src/domain/repositories/IVehicleRepository.ts
export interface IVehicleRepository {
  create(vehicle: Vehicle): Promise<void>;
  update(vehicle: Vehicle): Promise<void>;
  findById(id: string): Promise<Vehicle | null>;
  findAll(): Promise<Vehicle[]>;
  delete(id: string): Promise<void>;
}