import { Vehicle } from '../entities/Vehicle';

export interface IVehicleRepository {
  findById(id: string): Promise<Vehicle | null>;
  findAll(): Promise<Vehicle[]>;
  create(vehicle: Vehicle): Promise<void>;
  update(id: string, vehicle: Partial<Vehicle>): Promise<void>;
  delete(id: string): Promise<void>;
}