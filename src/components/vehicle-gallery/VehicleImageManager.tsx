
import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useVehicleImages } from "@/hooks/useVehicleImages";
import { Upload, Trash2, Crown, GripVertical, Image } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { toast } from "@/components/ui/sonner";

interface VehicleImageManagerProps {
  vehicleId: string;
  vehicleName: string;
}

export const VehicleImageManager: React.FC<VehicleImageManagerProps> = ({
  vehicleId,
  vehicleName
}) => {
  const {
    images,
    uploadImage,
    deleteImage,
    reorderImages,
    setCoverImage,
    isUploading
  } = useVehicleImages(vehicleId);
  
  const [draggedImages, setDraggedImages] = useState(images);
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setDraggedImages(images);
  }, [images]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    Array.from(files).forEach((file, index) => {
      if (file.type.startsWith('image/')) {
        const nextOrder = images.length + index + 1;
        if (nextOrder <= 20) {
          uploadImage({ file, displayOrder: nextOrder });
        } else {
          toast.error(`Máximo de 20 fotos por veículo`);
        }
      } else {
        toast.error(`${file.name} não é uma imagem válida`);
      }
    });

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragEnd = (result: any) => {
    if (!result.destination) return;

    const newImages = Array.from(draggedImages);
    const [reorderedItem] = newImages.splice(result.source.index, 1);
    newImages.splice(result.destination.index, 0, reorderedItem);

    // Update display orders
    const updatedImages = newImages.map((img, index) => ({
      id: img.id,
      display_order: index + 1
    }));

    setDraggedImages(newImages.map((img, index) => ({
      ...img,
      display_order: index + 1
    })));

    reorderImages(updatedImages);
  };

  const handleSetCover = (imageId: string) => {
    setCoverImage(imageId);
  };

  const handleDeleteImage = (imageId: string) => {
    if (window.confirm('Tem certeza que deseja excluir esta imagem?')) {
      deleteImage(imageId);
    }
  };

  // Create empty slots for remaining positions
  const emptySlots = Array.from({ length: 20 - images.length }, (_, index) => ({
    id: `empty-${index}`,
    position: images.length + index + 1
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Image className="w-5 h-5" />
          Galeria de Fotos - {vehicleName}
        </CardTitle>
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-600">
            {images.length}/20 fotos • Arraste para reordenar
          </p>
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || images.length >= 20}
            size="sm"
          >
            <Upload className="w-4 h-4 mr-2" />
            {isUploading ? 'Enviando...' : 'Adicionar Fotos'}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="images" direction="horizontal">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4"
              >
                {draggedImages.map((image, index) => (
                  <Draggable key={image.id} draggableId={image.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`relative group ${
                          snapshot.isDragging ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="relative border-2 border-gray-200 rounded-lg overflow-hidden bg-white">
                          <img
                            src={image.image_url}
                            alt={`Foto ${image.display_order}`}
                            className="w-full h-24 object-cover"
                          />
                          
                          {/* Drag handle */}
                          <div
                            {...provided.dragHandleProps}
                            className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 rounded p-1 cursor-grab"
                          >
                            <GripVertical className="w-3 h-3 text-white" />
                          </div>

                          {/* Cover badge */}
                          {image.is_cover && (
                            <Badge className="absolute top-1 right-1 bg-yellow-500 text-white text-xs">
                              <Crown className="w-2 h-2" />
                            </Badge>
                          )}

                          {/* Actions overlay */}
                          <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                            {!image.is_cover && (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-6 px-2 text-xs"
                                onClick={() => handleSetCover(image.id)}
                              >
                                <Crown className="w-3 h-3" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-6 px-2 text-xs"
                              onClick={() => handleDeleteImage(image.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>

                          {/* Position number */}
                          <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-1 rounded">
                            {image.display_order}
                          </div>
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}

                {/* Empty slots */}
                {emptySlots.map((slot) => (
                  <div
                    key={slot.id}
                    className="border-2 border-dashed border-gray-300 rounded-lg h-24 flex items-center justify-center text-gray-400 cursor-pointer hover:border-gray-400 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="text-center">
                      <Upload className="w-4 h-4 mx-auto mb-1" />
                      <div className="text-xs">{slot.position}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </CardContent>
    </Card>
  );
};
