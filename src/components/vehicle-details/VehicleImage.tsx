
import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Vehicle } from "@/types";
import { useVehicleImages } from "@/hooks/useVehicleImages";
import { VehicleImageGallery } from "@/components/vehicle-gallery/VehicleImageGallery";
import { VehicleImageManager } from "@/components/vehicle-gallery/VehicleImageManager";
import { Images, Settings } from "lucide-react";

interface VehicleImageProps {
  vehicle: Vehicle;
  editedVehicle: Vehicle;
  isEditing: boolean;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}

export const VehicleImage: React.FC<VehicleImageProps> = ({
  vehicle,
  editedVehicle,
  isEditing,
  handleInputChange
}) => {
  const [showManager, setShowManager] = useState(false);
  const { images } = useVehicleImages(vehicle.id);

  if (showManager && isEditing) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Images className="w-5 h-5" />
            Gerenciar Galeria
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowManager(false)}
          >
            Voltar à Visualização
          </Button>
        </div>
        <VehicleImageManager
          vehicleId={vehicle.id}
          vehicleName={vehicle.model}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="h-full max-h-96">
        {images.length > 0 ? (
          <VehicleImageGallery
            images={images}
            vehicleName={vehicle.model}
          />
        ) : (
          <img 
            src={isEditing ? editedVehicle.imageUrl : vehicle.imageUrl}
            alt={vehicle.model}
            className="w-full h-full object-cover rounded-lg"
          />
        )}
      </div>

      {isEditing && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowManager(true)}
              className="flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Gerenciar Galeria ({images.length}/20)
            </Button>
          </div>

          <div>
            <Label htmlFor="imageUrl">URL da Imagem (Fallback)</Label>
            <Input
              id="imageUrl"
              name="imageUrl"
              value={editedVehicle.imageUrl}
              onChange={handleInputChange}
              className="mt-1"
              placeholder="URL da imagem como fallback"
            />
            <p className="text-xs text-gray-500 mt-1">
              Esta URL será usada caso não haja imagens na galeria
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
