
import React from "react";
import { useVehicleImages } from "@/hooks/useVehicleImages";
import { Badge } from "@/components/ui/badge";
import { Images } from "lucide-react";

interface VehicleImagePreviewProps {
  vehicleId: string;
  vehicleName: string;
  fallbackImageUrl: string;
  className?: string;
}

export const VehicleImagePreview: React.FC<VehicleImagePreviewProps> = ({
  vehicleId,
  vehicleName,
  fallbackImageUrl,
  className = "w-full h-48 object-cover"
}) => {
  const { images } = useVehicleImages(vehicleId);

  // Use cover image if available, otherwise first image, otherwise fallback
  const coverImage = images.find(img => img.is_cover);
  const displayImage = coverImage || images[0];
  const imageUrl = displayImage?.image_url || fallbackImageUrl;

  return (
    <div className="relative">
      <img
        src={imageUrl}
        alt={vehicleName}
        className={className}
      />
      {images.length > 1 && (
        <Badge className="absolute top-2 right-2 bg-black/70 text-white text-xs">
          <Images className="w-3 h-3 mr-1" />
          {images.length}
        </Badge>
      )}
    </div>
  );
};
