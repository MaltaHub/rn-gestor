import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, Clock, Edit, Trash2 } from 'lucide-react';
import { Advertisement } from '@/types/store';
interface AdvertisementGridCardProps {
  advertisement: Advertisement;
  onEdit: (ad: Advertisement) => void;
  onDelete: (id: string) => void;
  onMarkAsPublished: (id: string) => void;
  isExecuting: boolean;
}
export const AdvertisementGridCard: React.FC<AdvertisementGridCardProps> = ({
  advertisement,
  onEdit,
  onDelete,
  onMarkAsPublished,
  isExecuting
}) => {
  return <Card className="relative">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Badge variant="secondary">{advertisement.platform}</Badge>
            {advertisement.publicado ? <Badge variant="default" className="bg-green-100 text-green-800">
                <CheckCircle className="w-3 h-3 mr-1" />
                Publicado
              </Badge> : <Badge variant="outline" className="text-orange-600 border-orange-600">
                <Clock className="w-3 h-3 mr-1" />
                Pendente
              </Badge>}
          </div>
        </div>
        <CardTitle className="text-lg">{advertisement.id_ancora}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            Placas: {advertisement.vehicle_plates.join(', ')}
          </p>
          <p className="text-sm text-gray-600">
            Preço: R$ {advertisement.advertised_price.toLocaleString()}
          </p>
          {advertisement.publicado && advertisement.data_publicacao && <p className="text-xs text-green-600">
              Publicado em: {new Date(advertisement.data_publicacao).toLocaleString()}
            </p>}
          
          {/* Layout responsivo para botões */}
          <div className="flex flex-col sm:flex-row gap-2 pt-3">
            {!advertisement.publicado && <Button size="sm" onClick={() => onMarkAsPublished(advertisement.id)} disabled={isExecuting} className="bg-green-600 hover:bg-green-700 flex-1 sm:flex-none">
                {isExecuting ? <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Publicando...
                  </> : <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Marcar como Publicado</span>
                    <span className="sm:hidden">Publicar</span>
                  </>}
              </Button>}
            
            <div className="flex gap-2 flex-1">
              <Button size="sm" variant="outline" onClick={() => onEdit(advertisement)} className="flex-1 sm:flex-none">
                <Edit className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Editar</span>
              </Button>
              <Button size="sm" variant="destructive" onClick={() => onDelete(advertisement.id)} className="flex-1 sm:flex-none">
                <Trash2 className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Excluir</span>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>;
};