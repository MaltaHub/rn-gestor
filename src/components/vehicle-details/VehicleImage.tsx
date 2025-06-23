import React from 'react';
import { VehicleWithIndicators } from '@/types';

interface VehicleImageProps {
  vehicle: VehicleWithIndicators;
}

export const VehicleImage: React.FC<VehicleImageProps> = ({ vehicle }) => {
  return (
    <div className="h-full bg-slate-200 dark:bg-slate-700 rounded-lg overflow-hidden flex items-center justify-center aspect-w-16 aspect-h-9">
      {vehicle.image_url ? (
        <img src={vehicle.image_url} alt={vehicle.model} className="w-full h-full object-cover" />
      ) : (
        <span className="text-slate-500 dark:text-slate-400">Sem imagem</span>
      )}
    </div>
  );
};
