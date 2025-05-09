
import React, { createContext, useContext, useState, useEffect } from "react";
import { Vehicle, Notification } from "../types";
import { useAuth } from "./AuthContext";
import { toast } from "@/components/ui/sonner";

// Sample data for demonstration
const SAMPLE_VEHICLES: Vehicle[] = [
  {
    id: "1",
    plate: "ABC1234",
    model: "Toyota Corolla",
    color: "Prata",
    mileage: 45000,
    imageUrl: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=800&auto=format&fit=crop",
    price: 75000,
    year: 2020,
    description: "Carro em excelente estado, único dono.",
    specifications: {
      engine: "2.0",
      transmission: "Automático",
      fuel: "Flex"
    },
    status: "available",
    addedAt: "2023-11-15T10:30:00Z"
  },
  {
    id: "2",
    plate: "DEF5678",
    model: "Honda Civic",
    color: "Preto",
    mileage: 30000,
    imageUrl: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&auto=format&fit=crop",
    price: 88000,
    year: 2021,
    description: "Completo, com apenas 30 mil KM rodados.",
    specifications: {
      engine: "1.8",
      transmission: "Automático",
      fuel: "Flex"
    },
    status: "available",
    addedAt: "2023-12-05T14:45:00Z"
  },
  {
    id: "3",
    plate: "GHI9012",
    model: "Volkswagen Golf",
    color: "Branco",
    mileage: 60000,
    imageUrl: "https://images.unsplash.com/photo-1533106418989-88406c7cc8ca?w=800&auto=format&fit=crop",
    price: 65000,
    year: 2019,
    description: "Versão GTI, esportivo e econômico.",
    specifications: {
      engine: "2.0 Turbo",
      transmission: "Automático",
      fuel: "Gasolina"
    },
    status: "reserved",
    addedAt: "2023-10-20T09:15:00Z"
  },
  {
    id: "4",
    plate: "JKL3456",
    model: "Fiat Toro",
    color: "Vermelho",
    mileage: 75000,
    imageUrl: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&auto=format&fit=crop",
    price: 92000,
    year: 2021,
    description: "Picape em ótimo estado, revisada recentemente.",
    specifications: {
      engine: "2.0 Diesel",
      transmission: "Automático",
      fuel: "Diesel"
    },
    status: "sold",
    addedAt: "2023-09-10T16:20:00Z"
  },
  {
    id: "5",
    plate: "MNO7890",
    model: "Jeep Compass",
    color: "Cinza",
    mileage: 25000,
    imageUrl: "https://images.unsplash.com/photo-1606016159991-dfe4f2746ad5?w=800&auto=format&fit=crop",
    price: 140000,
    year: 2022,
    description: "SUV premium com baixa quilometragem.",
    specifications: {
      engine: "2.0 Turbo",
      transmission: "Automático",
      fuel: "Flex"
    },
    status: "available",
    addedAt: "2024-01-05T11:10:00Z"
  }
];

const SAMPLE_NOTIFICATIONS: Notification[] = [
  {
    id: "1",
    vehicleId: "4",
    vehiclePlate: "JKL3456",
    message: "Status do veículo alterado para Vendido",
    details: "O status do Fiat Toro foi alterado de Disponível para Vendido",
    isRead: false,
    createdAt: "2024-05-01T10:30:00Z"
  },
  {
    id: "2",
    vehicleId: "3",
    vehiclePlate: "GHI9012",
    message: "Status do veículo alterado para Reservado",
    details: "O status do Volkswagen Golf foi alterado de Disponível para Reservado",
    isRead: false,
    createdAt: "2024-04-28T15:45:00Z"
  },
  {
    id: "3",
    vehicleId: "5",
    vehiclePlate: "MNO7890",
    message: "Novo veículo adicionado ao estoque",
    details: "Jeep Compass foi adicionado ao estoque",
    isRead: true,
    createdAt: "2024-01-05T11:10:00Z"
  }
];

interface VehicleContextType {
  vehicles: Vehicle[];
  notifications: Notification[];
  addVehicle: (vehicle: Omit<Vehicle, 'id' | 'addedAt'>) => void;
  updateVehicle: (id: string, updates: Partial<Vehicle>) => void;
  deleteVehicle: (id: string) => void;
  getVehicle: (id: string) => Vehicle | undefined;
  markAllNotificationsAsRead: () => void;
  unreadNotificationsCount: number;
  viewMode: 'compact' | 'detailed';
  setViewMode: (mode: 'compact' | 'detailed') => void;
  sortOption: string;
  setSortOption: (option: string) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filteredVehicles: Vehicle[];
}

const VehicleContext = createContext<VehicleContextType | undefined>(undefined);

export const VehicleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>('compact');
  const [sortOption, setSortOption] = useState<string>('addedAt_desc');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const { user } = useAuth();

  useEffect(() => {
    // Load data from localStorage if available, otherwise use sample data
    const storedVehicles = localStorage.getItem('vehicles');
    const storedNotifications = localStorage.getItem('notifications');
    
    if (storedVehicles) {
      try {
        setVehicles(JSON.parse(storedVehicles));
      } catch (e) {
        console.error('Failed to parse stored vehicles', e);
        setVehicles(SAMPLE_VEHICLES);
      }
    } else {
      setVehicles(SAMPLE_VEHICLES);
    }
    
    if (storedNotifications) {
      try {
        setNotifications(JSON.parse(storedNotifications));
      } catch (e) {
        console.error('Failed to parse stored notifications', e);
        setNotifications(SAMPLE_NOTIFICATIONS);
      }
    } else {
      setNotifications(SAMPLE_NOTIFICATIONS);
    }
  }, []);

  useEffect(() => {
    // Save data to localStorage whenever it changes
    if (vehicles.length > 0) {
      localStorage.setItem('vehicles', JSON.stringify(vehicles));
    }
    if (notifications.length > 0) {
      localStorage.setItem('notifications', JSON.stringify(notifications));
    }
  }, [vehicles, notifications]);

  const addVehicle = (vehicle: Omit<Vehicle, 'id' | 'addedAt'>) => {
    const newVehicle = {
      ...vehicle,
      id: String(Date.now()),
      addedAt: new Date().toISOString(),
    };

    setVehicles(prev => [...prev, newVehicle]);

    // Create notification for new vehicle
    const notification: Notification = {
      id: String(Date.now()),
      vehicleId: newVehicle.id,
      vehiclePlate: newVehicle.plate,
      message: "Novo veículo adicionado ao estoque",
      details: `${newVehicle.model} foi adicionado ao estoque`,
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    setNotifications(prev => [notification, ...prev]);
    toast.success("Veículo adicionado com sucesso!");
  };

  const updateVehicle = (id: string, updates: Partial<Vehicle>) => {
    const vehicleToUpdate = vehicles.find(v => v.id === id);
    
    if (!vehicleToUpdate) {
      toast.error("Veículo não encontrado");
      return;
    }

    // Check if status has changed to create a notification
    if (updates.status && updates.status !== vehicleToUpdate.status) {
      const notification: Notification = {
        id: String(Date.now()),
        vehicleId: id,
        vehiclePlate: vehicleToUpdate.plate,
        message: `Status do veículo alterado para ${
          updates.status === 'available' ? 'Disponível' : 
          updates.status === 'reserved' ? 'Reservado' : 'Vendido'
        }`,
        details: `O status do ${vehicleToUpdate.model} foi alterado de ${
          vehicleToUpdate.status === 'available' ? 'Disponível' : 
          vehicleToUpdate.status === 'reserved' ? 'Reservado' : 'Vendido'
        } para ${
          updates.status === 'available' ? 'Disponível' : 
          updates.status === 'reserved' ? 'Reservado' : 'Vendido'
        }`,
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      setNotifications(prev => [notification, ...prev]);
    }

    setVehicles(prev => 
      prev.map(vehicle => 
        vehicle.id === id ? { ...vehicle, ...updates } : vehicle
      )
    );
    
    toast.success("Veículo atualizado com sucesso!");
  };

  const deleteVehicle = (id: string) => {
    setVehicles(prev => prev.filter(vehicle => vehicle.id !== id));
    toast.success("Veículo removido com sucesso!");
  };

  const getVehicle = (id: string) => {
    return vehicles.find(vehicle => vehicle.id === id);
  };

  const markAllNotificationsAsRead = () => {
    setNotifications(prev => 
      prev.map(notification => ({ ...notification, isRead: true }))
    );
  };

  const unreadNotificationsCount = notifications.filter(n => !n.isRead).length;

  // Sort and filter vehicles
  const filteredVehicles = React.useMemo(() => {
    let filtered = [...vehicles];

    // Apply search filter
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(vehicle => 
        vehicle.model.toLowerCase().includes(lowerSearchTerm) || 
        vehicle.plate.toLowerCase().includes(lowerSearchTerm) ||
        vehicle.color.toLowerCase().includes(lowerSearchTerm)
      );
    }

    // Apply sort
    const [sortField, sortDirection] = sortOption.split('_');
    
    return filtered.sort((a, b) => {
      if (sortField === 'price') {
        return sortDirection === 'asc' ? a.price - b.price : b.price - a.price;
      } else if (sortField === 'mileage') {
        return sortDirection === 'asc' ? a.mileage - b.mileage : b.mileage - a.mileage;
      } else if (sortField === 'addedAt') {
        return sortDirection === 'asc' 
          ? new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime()
          : new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
      }
      return 0;
    });
  }, [vehicles, searchTerm, sortOption]);

  return (
    <VehicleContext.Provider 
      value={{
        vehicles,
        notifications,
        addVehicle,
        updateVehicle,
        deleteVehicle,
        getVehicle,
        markAllNotificationsAsRead,
        unreadNotificationsCount,
        viewMode,
        setViewMode,
        sortOption,
        setSortOption,
        searchTerm,
        setSearchTerm,
        filteredVehicles
      }}
    >
      {children}
    </VehicleContext.Provider>
  );
};

export const useVehicles = () => {
  const context = useContext(VehicleContext);
  if (context === undefined) {
    throw new Error('useVehicles must be used within a VehicleProvider');
  }
  return context;
};
