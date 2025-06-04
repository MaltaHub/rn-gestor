
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, DollarSign, Car, Edit, Trash2, FileText } from 'lucide-react';
import { Advertisement } from '@/types/store';
import { PlatformBadge } from './PlatformBadge';

interface AdvertisementCardProps {
  advertisement: Advertisement;
  onEdit?: (ad: Advertisement) => void;
  onDelete?: (id: string) => void;
}

export const AdvertisementCard: React.FC<AdvertisementCardProps> = ({
  advertisement,
  onEdit,
  onDelete
}) => {
  const calculateDaysAdvertised = (createdDate: string) => {
    const created = new Date(createdDate);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - created.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const daysAdvertised = calculateDaysAdvertised(advertisement.created_date);

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">
            {advertisement.id_ancora}
          </CardTitle>
          <PlatformBadge platform={advertisement.platform} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center text-sm text-gray-600">
          <DollarSign className="w-4 h-4 mr-1" />
          <span className="font-medium text-vehicleApp-red">
            {formatPrice(advertisement.advertised_price)}
          </span>
        </div>

        <div className="flex items-center text-sm text-gray-600">
          <Car className="w-4 h-4 mr-1" />
          <span>{advertisement.vehicle_plates.length} veículo(s)</span>
        </div>

        <div className="flex items-center text-sm text-gray-600">
          <Calendar className="w-4 h-4 mr-1" />
          <span>Criado em {formatDate(advertisement.created_date)}</span>
        </div>

        {advertisement.description && (
          <div className="flex items-start text-sm text-gray-600">
            <FileText className="w-4 h-4 mr-1 mt-0.5 flex-shrink-0" />
            <p className="line-clamp-2">{advertisement.description}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Badge variant="outline">
            {daysAdvertised} dia{daysAdvertised !== 1 ? 's' : ''} anunciado{daysAdvertised !== 1 ? 's' : ''}
          </Badge>
          
          <div className="flex space-x-2">
            {onEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(advertisement)}
              >
                <Edit className="w-3 h-3" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDelete(advertisement.id)}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>

        {advertisement.vehicle_plates.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-gray-500 mb-1">Placas:</p>
            <div className="flex flex-wrap gap-1">
              {advertisement.vehicle_plates.map((plate, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {plate}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
