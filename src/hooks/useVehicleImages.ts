
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { VehicleImage, SupabaseVehicleImage } from "@/types";
import { toast } from "@/components/ui/sonner";
import { useAuth } from "@/contexts/AuthContext";

export const useVehicleImages = (vehicleId: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch vehicle images
  const {
    data: images = [],
    isLoading,
    refetch
  } = useQuery({
    queryKey: ['vehicle-images', vehicleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vehicle_images')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('display_order', { ascending: true });
      
      if (error) {
        console.error('Erro ao buscar imagens:', error);
        toast.error('Erro ao carregar imagens');
        return [];
      }
      
      return data as SupabaseVehicleImage[];
    },
    enabled: !!vehicleId
  });

  // Upload image mutation
  const uploadImageMutation = useMutation({
    mutationFn: async ({ file, displayOrder }: { file: File; displayOrder: number }) => {
      if (!user) throw new Error('Usuário não autenticado');

      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${vehicleId}/${displayOrder}-${Date.now()}.${fileExt}`;
      
      const { error: uploadError, data } = await supabase.storage
        .from('vehicle-images')
        .upload(fileName, file);

      if (uploadError) {
        throw new Error(`Erro no upload: ${uploadError.message}`);
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('vehicle-images')
        .getPublicUrl(fileName);

      // Save to database
      const { error: dbError } = await supabase
        .from('vehicle_images')
        .insert({
          vehicle_id: vehicleId,
          image_url: publicUrl,
          display_order: displayOrder,
          is_cover: displayOrder === 1,
          uploaded_by: user.id
        });

      if (dbError) {
        // Delete uploaded file if DB insert fails
        await supabase.storage
          .from('vehicle-images')
          .remove([fileName]);
        throw new Error(`Erro ao salvar no banco: ${dbError.message}`);
      }

      return publicUrl;
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success('Imagem enviada com sucesso!');
    },
    onError: (error) => {
      console.error('Erro no upload:', error);
      toast.error(error.message);
    }
  });

  // Delete image mutation
  const deleteImageMutation = useMutation({
    mutationFn: async (imageId: string) => {
      const imageToDelete = images.find(img => img.id === imageId);
      if (!imageToDelete) throw new Error('Imagem não encontrada');

      // Delete from database first
      const { error: dbError } = await supabase
        .from('vehicle_images')
        .delete()
        .eq('id', imageId);

      if (dbError) {
        throw new Error(`Erro ao deletar do banco: ${dbError.message}`);
      }

      // Extract file path from URL
      const url = new URL(imageToDelete.image_url);
      const filePath = url.pathname.split('/').slice(-2).join('/'); // vehicle_id/filename

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('vehicle-images')
        .remove([filePath]);

      if (storageError) {
        console.warn('Erro ao deletar do storage:', storageError);
      }
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success('Imagem removida com sucesso!');
    },
    onError: (error) => {
      console.error('Erro ao deletar:', error);
      toast.error(error.message);
    }
  });

  // Reorder images mutation
  const reorderImagesMutation = useMutation({
    mutationFn: async (reorderedImages: { id: string; display_order: number }[]) => {
      const updates = reorderedImages.map(({ id, display_order }) =>
        supabase
          .from('vehicle_images')
          .update({ display_order })
          .eq('id', id)
      );

      await Promise.all(updates);
    },
    onSuccess: () => {
      refetch();
      toast.success('Ordem das imagens atualizada!');
    },
    onError: (error) => {
      console.error('Erro ao reordenar:', error);
      toast.error('Erro ao reordenar imagens');
    }
  });

  // Set cover image mutation
  const setCoverImageMutation = useMutation({
    mutationFn: async (imageId: string) => {
      const { error } = await supabase
        .from('vehicle_images')
        .update({ is_cover: true })
        .eq('id', imageId);

      if (error) {
        throw new Error(`Erro ao definir capa: ${error.message}`);
      }
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success('Foto de capa definida!');
    },
    onError: (error) => {
      console.error('Erro ao definir capa:', error);
      toast.error(error.message);
    }
  });

  return {
    images: images.map(img => ({
      id: img.id,
      vehicle_id: img.vehicle_id,
      image_url: img.image_url,
      display_order: img.display_order,
      is_cover: img.is_cover,
      uploaded_at: img.uploaded_at,
      uploaded_by: img.uploaded_by
    })) as VehicleImage[],
    isLoading,
    uploadImage: uploadImageMutation.mutate,
    deleteImage: deleteImageMutation.mutate,
    reorderImages: reorderImagesMutation.mutate,
    setCoverImage: setCoverImageMutation.mutate,
    isUploading: uploadImageMutation.isPending,
    isDeleting: deleteImageMutation.isPending,
    isReordering: reorderImagesMutation.isPending
  };
};
