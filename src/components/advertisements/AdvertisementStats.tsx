
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, TrendingUp } from 'lucide-react';
import { Advertisement } from '@/types/store';

interface AdvertisementStatsProps {
  advertisements: Advertisement[];
}

export const AdvertisementStats: React.FC<AdvertisementStatsProps> = ({ advertisements }) => {
  const published = advertisements.filter(ad => ad.publicado).length;
  const pending = advertisements.filter(ad => !ad.publicado).length;
  const total = advertisements.length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-medium text-gray-600">Total</p>
            <p className="text-2xl font-bold">{total}</p>
          </div>
          <TrendingUp className="h-8 w-8 text-blue-600" />
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-medium text-gray-600">Publicados</p>
            <p className="text-2xl font-bold text-green-600">{published}</p>
          </div>
          <CheckCircle className="h-8 w-8 text-green-600" />
        </CardContent>
      </Card>
      
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-medium text-gray-600">Pendentes</p>
            <p className="text-2xl font-bold text-orange-600">{pending}</p>
          </div>
          <Clock className="h-8 w-8 text-orange-600" />
        </CardContent>
      </Card>
    </div>
  );
};
