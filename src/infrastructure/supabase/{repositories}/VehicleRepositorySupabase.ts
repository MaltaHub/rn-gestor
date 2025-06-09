import { supabase } from '../../supabase/client';
import type { IVehicleRepository } from '../../../domain/repositories/IVehicleRepository';
import { Vehicle } from "@/domain/entities/Vehicle";
import { VehicleId } from '../../../domain/value-objects/VehicleId';
import { Plate } from '../../../domain/value-objects/Plate';
import type { VehicleDTO } from '../../../application/dtos/VehicleDTO';

export class VehicleRepositorySupabase implements IVehicleRepository {
  async findById(id: string): Promise<Vehicle | null> {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return this.mapRowToEntity(data);
  }

  async findAll(): Promise<Vehicle[]> {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*');

    if (error) throw new Error(error.message);

    return data.map(row => this.mapRowToEntity(row));
  }

  async create(vehicle: Vehicle): Promise<void> {
    const { error } = await supabase
      .from("vehicles")
      .insert([vehicle.toPrimitives()]);

    if (error) throw new Error(error.message);
  }

  async update(vehicle: Vehicle): Promise<void> {
    const { error } = await supabase
      .from("vehicles")
      .update(vehicle.toPrimitives())
      .eq("id", vehicle.id.value);

    if (error) throw new Error(error.message);
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  }

  /** 
   * Converte a linha bruta do Supabase em uma instância de Vehicle
   */
  private mapRowToEntity(row: any): Vehicle {
    return new Vehicle(
      new VehicleId(row.id),
      new Plate(row.plate),
      row.model,
      row.year,
      row.mileage,
      row.price,
      row.store,
      row.status,
      row.local ?? undefined,
      row.documentacao ?? undefined,
      row.fotos_roberto ?? false,
      row.fotos_rn ?? false
    );
  }
}
