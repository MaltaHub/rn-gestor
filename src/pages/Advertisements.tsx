
import React, { useState, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useAdvertisements } from '@/hooks/useAdvertisements';
import { usePendingWorkflow } from '@/hooks/usePendingWorkflow';
import { useDebounce } from '@/hooks/useDebounce';
import { StoreSwitcher } from '@/components/store/StoreSwitcher';
import { CreateAdvertisementDialog } from '@/components/advertisements/CreateAdvertisementDialog';
import { EditAdvertisementDialog } from '@/components/advertisements/EditAdvertisementDialog';
import { AdvertisementFilters } from '@/components/advertisements/AdvertisementFilters';
import { AdvertisementGrid } from '@/components/advertisements/AdvertisementGrid';
import { AdvertisementStats } from '@/components/advertisements/AdvertisementStats';
import { PlatformType } from '@/types/store';

const Advertisements = (): JSX.Element => {
  const { advertisements, isLoading, deleteAdvertisement, updateAdvertisement } = useAdvertisements();
  const { markAdvertisementPublished, isItemExecuting } = usePendingWorkflow();
  
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
                           ad.vehicle_plates.some(plate => plate.toLowerCase().includes(debouncedSearchTerm.toLowerCase()));
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
    <div className="content-container py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Anúncios</h1>
        <div className="flex items-center space-x-4">
          <StoreSwitcher variant="button" />
          <CreateAdvertisementDialog />
        </div>
      </div>

      <AdvertisementStats advertisements={advertisements} />

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
