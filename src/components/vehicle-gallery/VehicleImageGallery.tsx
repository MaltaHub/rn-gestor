
import React, { useState } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Badge } from "@/components/ui/badge";
import { VehicleImage } from "@/types";
import { Crown } from "lucide-react";

interface VehicleImageGalleryProps {
  images: VehicleImage[];
  vehicleName: string;
}

export const VehicleImageGallery: React.FC<VehicleImageGalleryProps> = ({
  images,
  vehicleName
}) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div className="w-full h-96 bg-gray-200 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-400 text-lg mb-2">Nenhuma imagem</div>
          <div className="text-gray-500 text-sm">Este veículo não possui fotos</div>
        </div>
      </div>
    );
  }

  const coverImage = images.find(img => img.is_cover) || images[0];

  return (
    <div className="space-y-4">
      {/* Imagem principal */}
      <div className="relative">
        <img
          src={images[selectedImageIndex]?.image_url || coverImage.image_url}
          alt={`${vehicleName} - Foto ${selectedImageIndex + 1}`}
          className="w-full h-96 object-cover rounded-lg"
        />
        {images[selectedImageIndex]?.is_cover && (
          <Badge className="absolute top-4 left-4 bg-yellow-500 text-white">
            <Crown className="w-3 h-3 mr-1" />
            Capa
          </Badge>
        )}
        <Badge className="absolute top-4 right-4 bg-black/70 text-white">
          {selectedImageIndex + 1} / {images.length}
        </Badge>
      </div>

      {/* Carrossel de miniaturas */}
      {images.length > 1 && (
        <Carousel className="w-full">
          <CarouselContent className="-ml-1">
            {images.map((image, index) => (
              <CarouselItem key={image.id} className="pl-1 basis-1/4 md:basis-1/6">
                <div
                  className={`relative cursor-pointer rounded-md overflow-hidden border-2 transition-all ${
                    selectedImageIndex === index
                      ? 'border-blue-500 ring-2 ring-blue-200'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedImageIndex(index)}
                >
                  <img
                    src={image.image_url}
                    alt={`${vehicleName} - Miniatura ${index + 1}`}
                    className="w-full h-16 object-cover"
                  />
                  {image.is_cover && (
                    <div className="absolute top-1 right-1">
                      <Crown className="w-3 h-3 text-yellow-400 fill-current" />
                    </div>
                  )}
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="left-2" />
          <CarouselNext className="right-2" />
        </Carousel>
      )}
    </div>
  );
};
