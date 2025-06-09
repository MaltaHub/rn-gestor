
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, Clock, Edit, Trash2 } from 'lucide-react';
import { Advertisement } from '@/types/store';
import { usePendingWorkflow } from '@/hooks/usePendingWorkflow';
import { toast } from '@/components/ui/sonner';

interface AdvertisementGridCardProps {
  advertisement: Advertisement;
  onEdit: (ad: Advertisement) => void;
  onDelete: (id: string) => void;
  onMarkAsPublished?: (id: string) => void;
  isExecuting?: boolean;
}

export const AdvertisementGridCard: React.FC<AdvertisementGridCardProps> = ({
  advertisement,
  onEdit,
  onDelete,
  onMarkAsPublished,
  isExecuting: externalIsExecuting = false
}) => {
  const { markAdvertisementPublished, isItemExecuting } = usePendingWorkflow();
  
  const isExecuting = externalIsExecuting || isItemExecuting(advertisement.id);

  const handleMarkAsPublished = async () => {
    try {
      if (onMarkAsPublished) {
        onMarkAsPublished(advertisement.id);
      } else {
        // Usar o hook interno com feedback visual melhorado
        toast.promise(
          markAdvertisementPublished(advertisement.id),
          {
            loading: 'Publicando anúncio...',
            success: 'Anúncio publicado com sucesso!',
            error: 'Erro ao publicar anúncio'
          }
        );
      }
    } catch (error) {
      console.error('Erro ao publicar:', error);
      toast.error('Erro ao publicar anúncio');
    }
  };

  return (
    <Card className={`relative overflow-hidden h-full flex flex-col transition-all duration-200 ${
      isExecuting ? 'opacity-60' : 'hover:shadow-lg'
    }`}>
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 min-w-0 flex-1">
            <Badge variant="secondary" className="shrink-0">{advertisement.platform}</Badge>
            {advertisement.publicado ? (
              <Badge variant="default" className="bg-green-100 text-green-800 shrink-0">
                <CheckCircle className="w-3 h-3 mr-1 shrink-0" />
                Publicado
              </Badge>
            ) : (
              <Badge variant="outline" className="text-orange-600 border-orange-600 shrink-0">
                <Clock className="w-3 h-3 mr-1 shrink-0" />
                Pendente
              </Badge>
            )}
          </div>
        </div>
        <CardTitle className="text-lg line-clamp-2">{advertisement.id_ancora}</CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col min-h-0">
        <div className="space-y-2 flex-1 min-h-0">
          <p className="text-sm text-gray-600 line-clamp-1">
            Placas: {advertisement.vehicle_plates.join(', ')}
          </p>
          <p className="text-sm text-gray-600 line-clamp-1">
            Preço: R$ {advertisement.advertised_price.toLocaleString()}
          </p>
          {advertisement.publicado && advertisement.data_publicacao && (
            <p className="text-xs text-green-600 line-clamp-1">
              Publicado em: {new Date(advertisement.data_publicacao).toLocaleString()}
            </p>
          )}
        </div>
        
        {/* Layout otimizado para botões */}
        <div className="flex flex-col gap-2 pt-3 mt-auto shrink-0">
          {!advertisement.publicado && (
            <Button 
              size="sm" 
              onClick={handleMarkAsPublished}
              disabled={isExecuting} 
              className="bg-green-600 hover:bg-green-700 w-full transition-all duration-200"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin shrink-0" />
                  <span className="truncate">Publicando...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2 shrink-0" />
                  <span className="hidden sm:inline truncate">Marcar como Publicado</span>
                  <span className="sm:hidden truncate">Publicar</span>
                </>
              )}
            </Button>
          )}
          
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => onEdit(advertisement)} 
              className="flex-1 min-w-0"
              disabled={isExecuting}
            >
              <Edit className="w-4 h-4 mr-2 shrink-0" />
              <span className="hidden sm:inline truncate">Editar</span>
              <span className="sm:hidden truncate">Edit</span>
            </Button>
            <Button 
              size="sm" 
              variant="destructive" 
              onClick={() => onDelete(advertisement.id)} 
              className="flex-1 min-w-0"
              disabled={isExecuting}
            >
              <Trash2 className="w-4 h-4 mr-2 shrink-0" />
              <span className="hidden sm:inline truncate">Excluir</span>
              <span className="sm:hidden truncate">Del</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
