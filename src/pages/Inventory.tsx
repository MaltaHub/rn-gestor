
import React from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, SlidersHorizontal, ArrowDownUp, LayoutGrid, List } from "lucide-react";
import { useVehicles } from "@/contexts/VehicleContext";
import { Vehicle } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";

const InventoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { 
    filteredVehicles, 
    viewMode, 
    setViewMode, 
    sortOption, 
    setSortOption,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    isLoading
  } = useVehicles();
  
  const sortOptions = [
    { value: 'price_asc', label: 'Preço (menor para maior)' },
    { value: 'price_desc', label: 'Preço (maior para menor)' },
    { value: 'addedAt_desc', label: 'Data (mais recente)' },
    { value: 'addedAt_asc', label: 'Data (mais antigo)' },
    { value: 'mileage_asc', label: 'Quilometragem (menor para maior)' },
    { value: 'mileage_desc', label: 'Quilometragem (maior para menor)' },
  ];

  const statusOptions = [
    { value: 'all', label: 'Todos' },
    { value: 'available', label: 'Disponíveis' },
    { value: 'reserved', label: 'Reservados' },
    { value: 'sold', label: 'Vendidos' },
  ];

  const handleViewVehicle = (vehicleId: string) => {
    navigate(`/vehicle/${vehicleId}`);
  };

  return (
    <div className="content-container py-6">
      <div className="floating-box mb-6">
        <div className="p-4 border-b flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Pesquisar por modelo, placa ou cor..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <ArrowDownUp className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {sortOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => setSortOption(option.value)}
                    className={sortOption === option.value ? "bg-muted" : ""}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {statusOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => setStatusFilter(option.value)}
                    className={statusFilter === option.value ? "bg-muted" : ""}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setViewMode(viewMode === 'compact' ? 'detailed' : 'compact')}
            >
              {viewMode === 'compact' ? (
                <LayoutGrid className="h-4 w-4" />
              ) : (
                <List className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="p-4">
          {isLoading ? (
            <div className={`grid gap-4 ${viewMode === 'compact' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
              {[1, 2, 3, 4, 5].map((item) => (
                <Card key={item} className="overflow-hidden">
                  <CardContent className="p-0">
                    {viewMode === 'compact' ? (
                      <div className="flex items-center">
                        <Skeleton className="h-24 w-24 sm:h-28 sm:w-28" />
                        <div className="flex-1 p-3 space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                          <div className="flex items-center justify-between mt-2">
                            <Skeleton className="h-3 w-28" />
                            <Skeleton className="h-4 w-16" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Skeleton className="h-48 w-full" />
                        <div className="p-4 space-y-2">
                          <div className="flex justify-between">
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="h-5 w-20" />
                          </div>
                          <Skeleton className="h-4 w-20" />
                          <div className="grid grid-cols-2 gap-2 pt-3 mt-3 border-t">
                            <Skeleton className="h-3 w-20" />
                            <Skeleton className="h-3 w-20" />
                            <Skeleton className="h-3 w-20" />
                            <Skeleton className="h-3 w-20" />
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredVehicles.length === 0 ? (
            <div className="text-center py-8">
              <h3 className="text-xl font-medium text-gray-600">Nenhum veículo encontrado</h3>
              <p className="mt-2 text-gray-500">Tente ajustar sua pesquisa ou adicionar novos veículos</p>
            </div>
          ) : (
            <div className={`grid gap-4 ${viewMode === 'compact' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
              {filteredVehicles.map((vehicle) => (
                viewMode === 'compact' ? (
                  <CompactVehicleCard 
                    key={vehicle.id}
                    vehicle={vehicle}
                    onClick={() => handleViewVehicle(vehicle.id)}
                  />
                ) : (
                  <DetailedVehicleCard 
                    key={vehicle.id}
                    vehicle={vehicle}
                    onClick={() => handleViewVehicle(vehicle.id)}
                  />
                )
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface VehicleCardProps {
  vehicle: Vehicle;
  onClick: () => void;
}

const CompactVehicleCard: React.FC<VehicleCardProps> = ({ vehicle, onClick }) => {
  return (
    <Card className="overflow-hidden hover:shadow-md cursor-pointer transition-shadow" onClick={onClick}>
      <CardContent className="p-0">
        <div className="flex items-center">
          <div className="h-24 w-24 sm:h-28 sm:w-28 flex-shrink-0">
            <img
              src={vehicle.imageUrl}
              alt={vehicle.model}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex-1 p-3">
            <div className="flex items-start justify-between">
              <h3 className="font-bold text-black text-lg">{vehicle.model}</h3>
              <StatusBadge status={vehicle.status} />
            </div>
            <p className="text-vehicleApp-mediumGray text-sm">{vehicle.plate}</p>
            <div className="flex items-center justify-between mt-2">
              <div className="text-sm text-vehicleApp-mediumGray">
                {vehicle.year} • {vehicle.mileage.toLocaleString()} km
              </div>
              <div className={`font-bold ${
                vehicle.status === 'available' ? 'text-vehicleApp-red' : 'text-vehicleApp-darkGray'
              }`}>
                R$ {vehicle.price.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const DetailedVehicleCard: React.FC<VehicleCardProps> = ({ vehicle, onClick }) => {
  return (
    <Card className="overflow-hidden hover:shadow-md cursor-pointer transition-shadow" onClick={onClick}>
      <CardContent className="p-0">
        <div className="relative h-48">
          <img
            src={vehicle.imageUrl}
            alt={vehicle.model}
            className="h-full w-full object-cover"
          />
          <div className="absolute top-2 right-2">
            <StatusBadge status={vehicle.status} />
          </div>
        </div>
        <div className="p-4">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-black text-lg">{vehicle.model}</h3>
            <div className={`font-bold ${
              vehicle.status === 'available' ? 'text-vehicleApp-red' : 'text-vehicleApp-darkGray'
            }`}>
              R$ {vehicle.price.toLocaleString()}
            </div>
          </div>
          <p className="text-vehicleApp-mediumGray text-sm">{vehicle.plate}</p>
          
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center text-vehicleApp-darkGray">
              <span className="font-medium">Ano:</span>
              <span className="ml-1">{vehicle.year}</span>
            </div>
            <div className="flex items-center text-vehicleApp-darkGray">
              <span className="font-medium">Cor:</span>
              <span className="ml-1">{vehicle.color}</span>
            </div>
            <div className="flex items-center text-vehicleApp-darkGray">
              <span className="font-medium">KM:</span>
              <span className="ml-1">{vehicle.mileage.toLocaleString()}</span>
            </div>
            {vehicle.specifications?.engine && (
              <div className="flex items-center text-vehicleApp-darkGray">
                <span className="font-medium">Motor:</span>
                <span className="ml-1">{vehicle.specifications.engine}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const StatusBadge: React.FC<{ status: Vehicle['status'] }> = ({ status }) => {
  let color: "default" | "secondary" | "destructive" = "default";
  let label = "";
  
  switch (status) {
    case "available":
      color = "default";
      label = "Disponível";
      break;
    case "reserved":
      color = "secondary";
      label = "Reservado";
      break;
    case "sold":
      color = "destructive";
      label = "Vendido";
      break;
  }
  
  return <Badge variant={color}>{label}</Badge>;
};

export default InventoryPage;
