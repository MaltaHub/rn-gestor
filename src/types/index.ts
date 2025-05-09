
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
}

export interface Notification {
  id: string;
  vehicleId: string;
  vehiclePlate: string;
  message: string;
  details: string;
  isRead: boolean;
  createdAt: string;
}
