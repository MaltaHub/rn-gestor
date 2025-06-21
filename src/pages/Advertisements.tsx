import React, { useState, useMemo } from 'react';
import { Loader2, Settings } from 'lucide-react';
import { useAdvertisements } from '@/hooks/useAdvertisements';
import { usePendingWorkflow } from '@/hooks/usePendingWorkflow';
import { useDebounce } from '@/hooks/useDebounce';
import { useIsMobile } from '@/hooks/use-mobile';
import { StoreSwitcher } from '@/components/store/StoreSwitcher';
import { CreateAdvertisementDialog } from '@/components/advertisements/CreateAdvertisementDialog';
import { EditAdvertisementDialog } from '@/components/advertisements/EditAdvertisementDialog';
import { AdvertisementFilters } from '@/components/advertisements/AdvertisementFilters';
import { AdvertisementGrid } from '@/components/advertisements/AdvertisementGrid';
import { AdvertisementStats } from '@/components/advertisements/AdvertisementStats';
import { AdvertisementCleanupActions } from '@/components/advertisements/AdvertisementCleanupActions';
import { PlatformType } from '@/types/store';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Advertisements = (): JSX.Element => {
  const { advertisements, isLoading, deleteAdvertisement, updateAdvertisement } = useAdvertisements();
  const { markAdvertisementPublished, isItemExecuting } = usePendingWorkflow();
  const isMobile = useIsMobile();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [adToEdit, setAdToEdit] = useState<any>(null);

  // Debounce search term para otimizar performance
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const platforms: PlatformType[] = [
    'OLX', 'WhatsApp', 'Mercado Livre', 'Mobi Auto', 'ICarros', 'Na Pista', 'Cockpit', 'Instagram'
  ];

  const filteredAdvertisements = useMemo(() => {
    return advertisements.filter(ad => {
      const matchesSearch = ad.id_ancora.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
                           (ad.vehicle_plates && ad.vehicle_plates.some(plate => 
                             plate.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
                           ));
      const matchesPlatform = platformFilter === 'all' || ad.platform === platformFilter;
      const matchesStatus = statusFilter === 'all' || 
                           (statusFilter === 'published' && ad.publicado) ||
                           (statusFilter === 'pending' && !ad.publicado);
      return matchesSearch && matchesPlatform && matchesStatus;
    });
  }, [advertisements, debouncedSearchTerm, platformFilter, statusFilter]);

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
    <div className="content-container py-3 md:py-6">
      <div className="mobile-stack items-center justify-between mb-4 md:mb-6 gap-4">
        <h1 className="mobile-header">Anúncios</h1>
        <div className="flex items-center space-x-2 md:space-x-4">
          {!isMobile && <StoreSwitcher variant="button" />}
          <CreateAdvertisementDialog />
        </div>
      </div>

      <Tabs defaultValue="list" className="mobile-spacing">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="list" className="touch-friendly">Lista</TabsTrigger>
          <TabsTrigger value="management" className="flex items-center gap-2 touch-friendly">
            {!isMobile && <Settings className="h-4 w-4" />}
            <span>Gerenciar</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mobile-spacing">
          {/* Stats - Ocultas em Mobile */}
          {!isMobile && <AdvertisementStats advertisements={advertisements} />}

          <AdvertisementFilters
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            platformFilter={platformFilter}
            onPlatformChange={setPlatformFilter}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            platforms={platforms}
          />

          <EditAdvertisementDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            advertisement={adToEdit}
            onSave={handleSaveEdit}
          />

          <AdvertisementGrid
            advertisements={filteredAdvertisements}
            isLoading={false}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onMarkAsPublished={handleMarkAsPublished}
            isItemExecuting={isItemExecuting}
          />

          {filteredAdvertisements.length === 0 && !isLoading && (
            <div className="text-center py-8">
              <h3 className="text-lg md:text-xl font-medium text-gray-600">Nenhum anúncio encontrado</h3>
              <p className="mt-2 text-sm md:text-base text-gray-500">
                {searchTerm || platformFilter !== 'all' || statusFilter !== 'all'
                  ? 'Ajuste os filtros'
                  : 'Adicione seu primeiro anúncio'
                }
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="management" className="mobile-spacing">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <AdvertisementCleanupActions />
            
            <div className="space-y-4">
              <h3 className="text-base md:text-lg font-semibold">Ferramentas Avançadas</h3>
              <p className="text-muted-foreground text-sm md:text-base">
                Mais ferramentas serão adicionadas aqui.
              </p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Advertisements;
