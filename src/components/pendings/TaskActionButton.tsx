
import React from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, ExternalLink, Eye } from 'lucide-react';
import { useRealTaskManager } from '@/hooks/useRealTaskManager';
import { toast } from '@/components/ui/sonner';

interface TaskActionButtonProps {
  task: {
    id: string;
    title: string;
    description: string;
    vehicle_id?: string;
    source_type: string;
    source_id?: string;
    vehicle_plate?: string;
  };
  onCompleted?: () => void;
}

export const TaskActionButton: React.FC<TaskActionButtonProps> = ({
  task,
  onCompleted
}) => {
  const navigate = useNavigate();
  const { completeTask } = useRealTaskManager();

  const handlePrimaryAction = () => {
    if (task.source_type === 'advertisement' && task.source_id) {
      // Redirecionar para página de anúncios para publicar
      navigate(`/advertisements?focus=${task.source_id}`);
    } else if (task.vehicle_id) {
      // Redirecionar para detalhes do veículo
      navigate(`/vehicle/${task.vehicle_id}`);
    } else {
      // Ação genérica
      toast.info('Esta tarefa precisa ser resolvida manualmente');
    }
  };

  const handleCompleteTask = async () => {
    try {
      await completeTask.mutateAsync(task.id);
      toast.success('Tarefa concluída!');
      onCompleted?.();
    } catch (error) {
      console.error('Erro ao completar tarefa:', error);
      toast.error('Erro ao completar tarefa');
    }
  };

  const getActionLabel = () => {
    if (task.source_type === 'advertisement') {
      return 'Publicar Anúncio';
    } else if (task.vehicle_id) {
      return 'Ver Veículo';
    }
    return 'Ver Detalhes';
  };

  return (
    <div className="flex gap-2">
      <Button
        onClick={handlePrimaryAction}
        variant="default"
        size="sm"
        className="flex-1"
      >
        <Eye className="h-3 w-3 mr-1" />
        {getActionLabel()}
      </Button>
      
      <Button
        onClick={handleCompleteTask}
        variant="ghost"
        size="sm"
        disabled={completeTask.isPending}
      >
        <CheckCircle className="h-3 w-3" />
      </Button>
    </div>
  );
};
