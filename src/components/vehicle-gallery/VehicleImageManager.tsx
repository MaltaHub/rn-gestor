
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, Image as ImageIcon, Trash2, Star, StarOff } from 'lucide-react';
import { useVehicleImages } from '@/hooks/useVehicleImages';
import { useStore } from '@/contexts/StoreContext';
import { toast } from '@/components/ui/sonner';

interface VehicleImageManagerProps {
  vehicleId: string;
}

export const VehicleImageManager: React.FC<VehicleImageManagerProps> = ({ vehicleId }) => {
  const { currentStore } = useStore();
  const { 
    images, 
    isLoading, 
    uploadImage, 
    deleteImage, 
    setCoverImage,
    isUploading 
  } = useVehicleImages(vehicleId);
  
  const [dragOver, setDragOver] = useState(false);

  // Filtrar imagens pela loja atual
  const storeImages = images.filter(img => img.store === currentStore);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione apenas arquivos de imagem');
      return;
    }

    try {
      // Calcular próximo display_order
      const nextDisplayOrder = storeImages.length + 1;
      await uploadImage({ file, displayOrder: nextDisplayOrder });
      toast.success('Imagem enviada com sucesso!');
    } catch (error) {
      toast.error('Erro ao enviar imagem');
      console.error('Upload error:', error);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDelete = async (imageId: string) => {
    if (window.confirm('Tem certeza que deseja excluir esta imagem?')) {
      try {
        await deleteImage(imageId);
        toast.success('Imagem excluída com sucesso!');
      } catch (error) {
        toast.error('Erro ao excluir imagem');
        console.error('Delete error:', error);
      }
    }
  };

  const handleSetCover = async (imageId: string) => {
    try {
      await setCoverImage(imageId);
      toast.success('Imagem de capa atualizada!');
    } catch (error) {
      toast.error('Erro ao definir imagem de capa');
      console.error('Set cover error:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <ImageIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">Carregando imagens...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Adicionar Fotos</span>
            <Badge variant="outline">{currentStore}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragOver 
                ? 'border-vehicleApp-red bg-red-50' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-lg font-medium text-gray-700 mb-2">
              Arraste e solte suas imagens aqui
            </p>
            <p className="text-gray-500 mb-4">
              ou clique para selecionar arquivos
            </p>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleFileUpload(e.target.files)}
              className="hidden"
              id="image-upload"
              disabled={isUploading}
            />
            <Button
              asChild
              disabled={isUploading}
              className="bg-vehicleApp-red hover:bg-red-600"
            >
              <label htmlFor="image-upload" className="cursor-pointer">
                {isUploading ? 'Enviando...' : 'Selecionar Imagens'}
              </label>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Images Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Fotos da Loja: {currentStore}</span>
            <Badge variant="secondary">{storeImages.length} foto(s)</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {storeImages.length === 0 ? (
            <div className="text-center py-12">
              <ImageIcon className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-700 mb-2">
                Nenhuma foto para esta loja
              </h3>
              <p className="text-gray-500">
                Adicione fotos específicas para a loja {currentStore}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {storeImages.map((image) => (
                <div key={image.id} className="relative group">
                  <div className="aspect-square overflow-hidden rounded-lg border">
                    <img
                      src={image.image_url}
                      alt={`Foto ${image.display_order}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                  
                  {/* Overlay with actions */}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant={image.is_cover ? "default" : "secondary"}
                        onClick={() => handleSetCover(image.id)}
                        className="p-2"
                      >
                        {image.is_cover ? <Star className="w-4 h-4" /> : <StarOff className="w-4 h-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(image.id)}
                        className="p-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Cover badge */}
                  {image.is_cover && (
                    <div className="absolute top-2 left-2">
                      <Badge className="bg-yellow-500 text-white">
                        <Star className="w-3 h-3 mr-1" />
                        Capa
                      </Badge>
                    </div>
                  )}

                  {/* Order badge */}
                  <div className="absolute top-2 right-2">
                    <Badge variant="secondary" className="text-xs">
                      #{image.display_order}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
