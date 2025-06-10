
import React from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Camera, FileText, Edit, ExternalLink } from 'lucide-react';
import { VehiclePendency } from '@/hooks/useVehiclePendencies';
import { useRealTaskManager } from '@/hooks/useRealTaskManager';
import { toast } from '@/components/ui/sonner';

interface PendencyActionButtonProps {
  pendency: VehiclePendency;
  onResolved?: () => void;
}

export const PendencyActionButton: React.FC<PendencyActionButtonProps> = ({
  pendency,
  onResolved
}) => {
  const navigate = useNavigate();
  const { resolvePendency } = useRealTaskManager();

  const handlePrimaryAction = () => {
    switch (pendency.type) {
      case 'missing_photos':
        // Redirecionar para upload de fotos do veículo
        navigate(`/vehicle/${pendency.vehicleId}?tab=gallery`);
        break;
      
      case 'missing_ads':
        // Redirecionar para criar anúncio
        navigate(`/advertisements?createFor=${pendency.vehicleId}&plate=${pendency.plate}`);
        break;
      
      case 'incomplete_info':
        // Redirecionar para editar veículo
        navigate(`/edit-vehicle/${pendency.vehicleId}`);
        break;
      
      case 'document_pending':
        // Ver detalhes do veículo
        navigate(`/vehicle/${pendency.vehicleId}`);
        break;
      
      case 'orphaned_ad':
        // Ver anúncio para correção
        if (pendency.relatedAdvertisementId) {
          navigate(`/advertisements?edit=${pendency.relatedAdvertisementId}`);
        }
        break;
      
      default:
        toast.error('Ação não disponível para este tipo de pendência');
    }
  };

  const handleQuickResolve = async () => {
    try {
      await resolvePendency.mutateAsync({
        type: pendency.type,
        identifier: pendency.id,
        method: 'manual'
      });
      
      toast.success('Pendência resolvida!');
      onResolved?.();
    } catch (error) {
      console.error('Erro ao resolver pendência:', error);
      toast.error('Erro ao resolver pendência');
    }
  };

  const getPrimaryActionConfig = () => {
    switch (pendency.type) {
      case 'missing_photos':
        return {
          icon: Camera,
          label: 'Adicionar Fotos',
          variant: 'default' as const
        };
      
      case 'missing_ads':
        return {
          icon: FileText,
          label: 'Criar Anúncio',
          variant: 'default' as const
        };
      
      case 'incomplete_info':
        return {
          icon: Edit,
          label: 'Editar Info',
          variant: 'default' as const
        };
      
      case 'document_pending':
        return {
          icon: ExternalLink,
          label: 'Ver Detalhes',
          variant: 'outline' as const
        };
      
      case 'orphaned_ad':
        return {
          icon: Edit,
          label: 'Corrigir Anúncio',
          variant: 'destructive' as const
        };
      
      default:
        return {
          icon: ExternalLink,
          label: 'Ver',
          variant: 'outline' as const
        };
    }
  };

  const config = getPrimaryActionConfig();
  const Icon = config.icon;

  return (
    <div className="flex gap-2">
      <Button
        onClick={handlePrimaryAction}
        variant={config.variant}
        size="sm"
        className="flex-1"
      >
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </Button>
      
      <Button
        onClick={handleQuickResolve}
        variant="ghost"
        size="sm"
        disabled={resolvePendency.isPending}
      >
        <CheckCircle className="h-3 w-3" />
      </Button>
    </div>
  );
};
