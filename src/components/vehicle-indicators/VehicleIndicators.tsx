
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Camera, FileText, Clock } from 'lucide-react';
import { VehicleWithIndicators } from '@/types';

interface VehicleIndicatorsProps {
  vehicle: VehicleWithIndicators;
  className?: string;
}

export const VehicleIndicators: React.FC<VehicleIndicatorsProps> = ({ 
  vehicle, 
  className = "" 
}) => {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {vehicle.indicador_amarelo && (
        <div 
          className="w-3 h-3 bg-yellow-500 rounded-full flex items-center justify-center"
          title="Campos ausentes (fotos ou documentação)"
        >
          <AlertCircle className="w-2 h-2 text-white" />
        </div>
      )}
      
      {vehicle.indicador_vermelho && (
        <div 
          className="w-3 h-3 bg-red-500 rounded-full flex items-center justify-center"
          title="Sem anúncio ativo"
        >
          <Camera className="w-2 h-2 text-white" />
        </div>
      )}
      
      {vehicle.indicador_lilas && (
        <div 
          className="w-3 h-3 bg-purple-500 rounded-full flex items-center justify-center"
          title="Documentação em andamento"
        >
          <FileText className="w-2 h-2 text-white" />
        </div>
      )}
    </div>
  );
};

export const VehicleIndicatorLegend: React.FC = () => {
  return (
    <div className="bg-white p-4 rounded-lg border shadow-sm">
      <h3 className="font-semibold mb-3">Indicadores</h3>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
          <span>Campos ausentes (fotos ou documentação)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <span>Sem anúncio ativo</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
          <span>Documentação em andamento</span>
        </div>
      </div>
    </div>
  );
};
