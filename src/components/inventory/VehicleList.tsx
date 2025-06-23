import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Car, 
  MapPin, 
  Calendar, 
  Gauge, 
  DollarSign,
  Eye,
  Edit,
  CheckCircle2,
  Clock,
  AlertCircle,
  Image as ImageIcon
} from "lucide-react";

interface VehicleListProps {
  isLoading: boolean;
  filteredVehicles: any[];
  viewMode: 'table' | 'compact' | 'detailed';
  onVehicleClick: (vehicleId: string) => void;
  selectedVehicles: string[];
  onToggleSelect: (vehicleId: string) => void;
}

export const VehicleList: React.FC<VehicleListProps> = ({
  isLoading,
  filteredVehicles,
  viewMode,
  onVehicleClick,
  selectedVehicles,
  onToggleSelect
}) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'available':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'reserved':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'sold':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Car className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'reserved':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'sold':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  // Função para obter a imagem de capa do veículo
  const getVehicleCoverImage = (vehicle: any) => {
    // Debug: log das informações do veículo
    console.log('Vehicle data:', {
      id: vehicle.id,
      model: vehicle.model,
      coverImage: vehicle.coverImage,
      images: vehicle.images,
      image_url: vehicle.image_url
    });

    // Primeiro, verifica se tem uma imagem de capa definida
    if (vehicle.coverImage) {
      console.log('Using coverImage:', vehicle.coverImage.image_url);
      return vehicle.coverImage.image_url;
    }
    
    // Se não tem coverImage, verifica se tem imagens na galeria
    if (vehicle.images && vehicle.images.length > 0) {
      console.log('Using first gallery image:', vehicle.images[0].image_url);
      return vehicle.images[0].image_url;
    }
    
    // Verifica se tem uma imagem específica de capa
    if (vehicle.cover_image) {
      console.log('Using cover_image:', vehicle.cover_image);
      return vehicle.cover_image;
    }
    
    // Verifica se tem uma imagem principal
    if (vehicle.main_image) {
      console.log('Using main_image:', vehicle.main_image);
      return vehicle.main_image;
    }
    
    // Fallback para image_url básico
    if (vehicle.image_url) {
      console.log('Using fallback image_url:', vehicle.image_url);
      return vehicle.image_url;
    }
    
    console.log('No image found for vehicle:', vehicle.id);
    return null;
  };

  // Componente para renderizar a imagem do veículo
  const VehicleImage = ({ vehicle, className = "" }: { vehicle: any; className?: string }) => {
    const coverImageUrl = getVehicleCoverImage(vehicle);
    
    if (coverImageUrl) {
      return (
        <div className={`relative overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-700 ${className}`}>
          <img
            src={coverImageUrl}
            alt={`${vehicle.model} - ${vehicle.plate}`}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              console.error('Image failed to load:', coverImageUrl);
              // Fallback para ícone se a imagem falhar
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              target.nextElementSibling?.classList.remove('hidden');
            }}
            onLoad={() => {
              console.log('Image loaded successfully:', coverImageUrl);
            }}
          />
          <div className="hidden absolute inset-0 flex items-center justify-center bg-slate-200 dark:bg-slate-700">
            <Car className="h-8 w-8 text-slate-500" />
          </div>
        </div>
      );
    }

    // Fallback para ícone quando não há imagem
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 rounded-lg ${className}`}>
        <Car className="h-8 w-8 text-slate-500" />
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className={viewMode === 'detailed' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'space-y-4'}>
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="h-12 w-12 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (filteredVehicles.length === 0) {
    return (
      <div className="text-center py-12">
        <Car className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
          Nenhum veículo encontrado
        </h3>
        <p className="text-gray-500 dark:text-gray-400">
          Tente ajustar os filtros ou adicionar novos veículos ao estoque.
        </p>
      </div>
    );
  }

  // Debug: log do número de veículos
  console.log('Rendering vehicles:', filteredVehicles.length);

  // Modo detalhado (grid)
  if (viewMode === 'detailed') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredVehicles.map((vehicle) => {
          const isSelected = selectedVehicles.includes(vehicle.id);
          
          return (
            <Card 
              key={vehicle.id} 
              className={`overflow-hidden transition-all duration-200 hover:shadow-lg cursor-pointer group ${
                isSelected 
                  ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                  : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'
              }`}
              onClick={() => onVehicleClick(vehicle.id)}
            >
              <div className="relative">
                {/* Checkbox de seleção */}
                <div 
                  className="absolute top-2 left-2 z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect(vehicle.id);
                  }}
                >
                  <Checkbox 
                    checked={isSelected}
                    className="bg-white/90 backdrop-blur-sm"
                  />
                </div>

                {/* Imagem do veículo */}
                <VehicleImage 
                  vehicle={vehicle} 
                  className="h-32 w-full"
                />

                {/* Status badge */}
                <div className="absolute top-2 right-2">
                  <Badge className={getStatusColor(vehicle.status)}>
                    {getStatusIcon(vehicle.status)}
                    <span className="ml-1 capitalize">{vehicle.status}</span>
                  </Badge>
                </div>

                {/* Indicador de múltiplas imagens */}
                {vehicle.images && vehicle.images.length > 1 && (
                  <div className="absolute bottom-2 right-2">
                    <Badge variant="secondary" className="bg-black/70 text-white text-xs">
                      <ImageIcon className="h-3 w-3 mr-1" />
                      +{vehicle.images.length - 1}
                    </Badge>
                  </div>
                )}
              </div>

              <CardContent className="p-4">
                <div className="space-y-3">
                  <div>
                    <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                      {vehicle.model}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 font-mono">
                      {vehicle.plate}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                      <Calendar className="h-3 w-3" />
                      <span>{vehicle.year}</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                      <Gauge className="h-3 w-3" />
                      <span>{vehicle.mileage}km</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-green-600 dark:text-green-400 font-semibold">
                      <DollarSign className="h-4 w-4" />
                      <span>{vehicle.price.toLocaleString('pt-BR')}</span>
                    </div>
                    
                    <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                      <MapPin className="h-3 w-3" />
                      <span className="text-xs">{vehicle.store}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onVehicleClick(vehicle.id);
                      }}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      Ver
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        // Implementar edição
                      }}
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Editar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  // Modo compacto (lista)
  return (
    <div className="space-y-3">
      {filteredVehicles.map((vehicle) => {
        const isSelected = selectedVehicles.includes(vehicle.id);
        
        return (
          <Card 
            key={vehicle.id}
            className={`transition-all duration-200 hover:shadow-md cursor-pointer group ${
              isSelected 
                ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'
            }`}
            onClick={() => onVehicleClick(vehicle.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                {/* Checkbox de seleção */}
                <div 
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect(vehicle.id);
                  }}
                >
                  <Checkbox checked={isSelected} />
                </div>

                {/* Imagem */}
                <VehicleImage 
                  vehicle={vehicle}
                  className="h-16 w-16 flex-shrink-0"
                />

                {/* Informações principais */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                      {vehicle.model}
                    </h3>
                    <Badge className={getStatusColor(vehicle.status)}>
                      {getStatusIcon(vehicle.status)}
                      <span className="ml-1 capitalize">{vehicle.status}</span>
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-1">
                      <span className="font-mono">{vehicle.plate}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      <span>{vehicle.year}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Gauge className="h-3 w-3" />
                      <span>{vehicle.mileage}km</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      <span>{vehicle.store}</span>
                    </div>
                  </div>
                </div>

                {/* Preço */}
                <div className="text-right">
                  <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                    {vehicle.price.toLocaleString('pt-BR')}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {vehicle.color}
                  </div>
                </div>

                {/* Ações */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onVehicleClick(vehicle.id);
                    }}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Ver
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Implementar edição
                    }}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
