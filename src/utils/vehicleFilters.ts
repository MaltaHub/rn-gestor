
import { Vehicle } from "@/types";

export const filterVehicles = (
  vehicles: Vehicle[], 
  searchTerm: string, 
  statusFilter: string,
  sortOption: string
): Vehicle[] => {
  let filtered = [...vehicles];

  // Apply status filter
  if (statusFilter !== 'all') {
    filtered = filtered.filter(vehicle => vehicle.status === statusFilter);
  }

  // Apply search filter
  if (searchTerm) {
    const lowerSearchTerm = searchTerm.toLowerCase();
    filtered = filtered.filter(vehicle => 
      vehicle.model.toLowerCase().includes(lowerSearchTerm) || 
      vehicle.plate.toLowerCase().includes(lowerSearchTerm) ||
      vehicle.color.toLowerCase().includes(lowerSearchTerm)
    );
  }

  // Apply sorting
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
};
