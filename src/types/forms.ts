
import { Vehicle } from "@/types";

export type VehicleFormData = Omit<Vehicle, 'id' | 'addedAt' | 'status'>;
