
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Filter, CheckCircle, Clock, Edit, Trash2 } from 'lucide-react';
import { useAdvertisements } from '@/hooks/useAdvertisements';
import { usePendingWorkflow } from '@/hooks/usePendingWorkflow';
import { AdvertisementCard } from '@/components/advertisements/AdvertisementCard';
import { StoreSwitcher } from '@/components/store/StoreSwitcher';
import { CreateAdvertisementDialog } from '@/components/advertisements/CreateAdvertisementDialog';
import { EditAdvertisementDialog } from '@/components/advertisements/EditAdvertisementDialog';
import { PlatformType } from '@/types/store';

const Advertisements = (): JSX.Element => {
  const { advertisements, isLoading, deleteAdvertisement, updateAdvertisement } = useAdvertisements();
  const { markAdvertisementPublished, isItemExecuting } = usePendingWorkflow();
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [adToEdit, setAdToEdit] = useState<any>(null);

  const platforms: PlatformType[] = [
    'OLX', 'WhatsApp', 'Mercado Livre', 'Mobi Auto', 'ICarros', 'Na Pista', 'Cockpit', 'Instagram'
  ];

  const filteredAdvertisements = advertisements.filter(ad => {
    const matchesSearch = ad.id_ancora.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ad.vehicle_plates.some(plate => plate.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesPlatform = platformFilter === 'all' || ad.platform === platformFilter;
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'published' && ad.publicado) ||
                         (statusFilter === 'pending' && !ad.publicado);
    return matchesSearch && matchesPlatform && matchesStatus;
  });

  const handleDelete = (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir este anúncio?')) {
      deleteAdvertisement(id);
    }
  };

  const handleEdit = (ad: any) => {
    setAdToEdit(ad);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async (updatedAd: any) => {
    await updateAdvertisement({ id: updatedAd.id, updates: updatedAd });
  };

  const handleMarkAsPublished = async (advertisementId: string) => {
    await markAdvertisementPublished(advertisementId);
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
          <CreateAdvertisementDialog />
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status de publicação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="published">Publicados</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <EditAdvertisementDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        advertisement={adToEdit}
        onSave={handleSaveEdit}
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredAdvertisements.map((advertisement) => (
          <Card key={advertisement.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary">{advertisement.platform}</Badge>
                  {advertisement.publicado ? (
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Publicado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-orange-600 border-orange-600">
                      <Clock className="w-3 h-3 mr-1" />
                      Pendente
                    </Badge>
                  )}
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
                {advertisement.publicado && advertisement.data_publicacao && (
                  <p className="text-xs text-green-600">
                    Publicado em: {new Date(advertisement.data_publicacao).toLocaleString()}
                  </p>
                )}
                
                {/* Layout responsivo para botões */}
                <div className="flex flex-col sm:flex-row gap-2 pt-3">
                  {!advertisement.publicado && (
                    <Button
                      size="sm"
                      onClick={() => handleMarkAsPublished(advertisement.id)}
                      disabled={isItemExecuting(advertisement.id)}
                      className="bg-green-600 hover:bg-green-700 flex-1 sm:flex-none"
                    >
                      {isItemExecuting(advertisement.id) ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Publicando...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          <span className="hidden sm:inline">Marcar como Publicado</span>
                          <span className="sm:hidden">Publicar</span>
                        </>
                      )}
                    </Button>
                  )}
                  
                  <div className="flex gap-2 flex-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(advertisement)}
                      className="flex-1 sm:flex-none"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      <span className="hidden sm:inline">Editar</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(advertisement.id)}
                      className="flex-1 sm:flex-none"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      <span className="hidden sm:inline">Excluir</span>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredAdvertisements.length === 0 && (
        <div className="text-center py-8">
          <h3 className="text-xl font-medium text-gray-600">Nenhum anúncio encontrado</h3>
          <p className="mt-2 text-gray-500">
            {searchTerm || platformFilter !== 'all' || statusFilter !== 'all'
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
