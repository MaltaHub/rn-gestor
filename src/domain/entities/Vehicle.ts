import { VehicleId } from '../value-objects/VehicleId.ts';
import { Plate } from '../value-objects/Plate.ts';
import { StoreType } from '@/types/store.ts';

export class Vehicle {
  constructor(
    public readonly id: VehicleId,
    public plate: Plate,
    public model: string,
    public year: number,
    public mileage: number,
    public price: number,
    public store: StoreType,
    public status: 'available' | 'reserved' | 'sold',
    public local?: string,
    public documentacao?: string,
    public fotos_roberto?: boolean,
    public fotos_rn?: boolean,
  ) {}

  updateData(data: Partial<Omit<Vehicle, 'id' | 'plate'>>): void {
    Object.assign(this, data);
  }

  transferTo(newStore: StoreType): void {
    this.store = newStore;
  }

  markAsSold(): void {
    this.status = 'sold';
  }

  markAsReserved(): void {
    this.status = 'reserved';
  }

  markAsAvailable(): void {
    this.status = 'available';
  }
}