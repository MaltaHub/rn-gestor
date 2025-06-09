
import React from 'react';
import { Advertisement } from '@/types/store';
import { AdvertisementGridCard } from './AdvertisementGridCard';
import { AdvertisementGridSkeleton } from './AdvertisementGridSkeleton';

interface AdvertisementGridProps {
  advertisements: Advertisement[];
  isLoading: boolean;
  onEdit: (ad: Advertisement) => void;
  onDelete: (id: string) => void;
  onMarkAsPublished: (id: string) => void;
  isItemExecuting: (id: string) => boolean;
}

export const AdvertisementGrid: React.FC<AdvertisementGridProps> = ({
  advertisements,
  isLoading,
  onEdit,
  onDelete,
  onMarkAsPublished,
  isItemExecuting
}) => {
  if (isLoading) {
    return <AdvertisementGridSkeleton />;
  }

  if (advertisements.length === 0) {
    return (
      <div className="text-center py-8">
        <h3 className="text-xl font-medium text-gray-600">Nenhum anúncio encontrado</h3>
        <p className="mt-2 text-gray-500">
          Adicione seu primeiro anúncio para começar
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {advertisements.map((advertisement) => (
        <AdvertisementGridCard
          key={advertisement.id}
          advertisement={advertisement}
          onEdit={onEdit}
          onDelete={onDelete}
          onMarkAsPublished={onMarkAsPublished}
          isExecuting={isItemExecuting(advertisement.id)}
        />
      ))}
    </div>
  );
};
