
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Search, Filter } from 'lucide-react';
import { useAdvertisements } from '@/hooks/useAdvertisements';
import { AdvertisementCard } from '@/components/advertisements/AdvertisementCard';
import { StoreSwitcher } from '@/components/store/StoreSwitcher';
import { PlatformType } from '@/types/store';

const Advertisements: React.FC = () => {
  const { advertisements, isLoading, deleteAdvertisement } = useAdvertisements();
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string>('all');

  const platforms: PlatformType[] = [
    'OLX', 'WhatsApp', 'Mercado Livre', 'Mobi Auto', 'ICarros', 'Na Pista', 'Cockpit'
  ];

  const filteredAdvertisements = advertisements.filter(ad => {
    const matchesSearch = ad.id_ancora.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ad.vehicle_plates.some(plate => plate.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesPlatform = platformFilter === 'all' || ad.platform === platformFilter;
    return matchesSearch && matchesPlatform;
  });

  const handleDelete = (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este anúncio?')) {
      deleteAdvertisement(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-10 w-10 animate-spin text-vehicleApp-red" />
      </div>
    );
  }

  return (
    <div className="content-container py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Anúncios</h1>
        <div className="flex items-center space-x-4">
          <StoreSwitcher variant="button" />
          <Button className="bg-vehicleApp-red hover:bg-red-600">
            <Plus className="w-4 h-4 mr-2" />
            Novo Anúncio
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="w-5 h-5 mr-2" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Buscar por ID âncora ou placa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por plataforma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as plataformas</SelectItem>
                {platforms.map(platform => (
                  <SelectItem key={platform} value={platform}>
                    {platform}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredAdvertisements.map((advertisement) => (
          <AdvertisementCard
            key={advertisement.id}
            advertisement={advertisement}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {filteredAdvertisements.length === 0 && (
        <div className="text-center py-8">
          <h3 className="text-xl font-medium text-gray-600">Nenhum anúncio encontrado</h3>
          <p className="mt-2 text-gray-500">
            {searchTerm || platformFilter !== 'all' 
              ? 'Tente ajustar seus filtros de busca'
              : 'Adicione seu primeiro anúncio para começar'
            }
          </p>
        </div>
      )}
    </div>
  );
};

export default Advertisements;
