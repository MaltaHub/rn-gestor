
export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  color: string;
  mileage: number;
  imageUrl: string;
  price: number;
  year: number;
  description?: string;
  specifications?: {
    engine?: string;
    transmission?: string;
    fuel?: string;
  };
  status: 'available' | 'sold' | 'reserved';
  addedAt: string;
  user_id?: string;
}

export interface Notification {
  id: string;
  vehicleId: string;
  vehicle_plate: string;
  message: string;
  details: string;
  is_read: boolean;
  created_at: string;
  user_id?: string;
}
