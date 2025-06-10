
import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, User, MapPin, AlertTriangle } from 'lucide-react';
import { PendencyActionButton } from './PendencyActionButton';
import { TaskActionButton } from './TaskActionButton';

interface ActionCardProps {
  id: string;
  type: 'pendency' | 'task';
  title: string;
  description: string;
  priority: 'baixa' | 'normal' | 'alta' | 'critical' | 'high' | 'medium' | 'low';
  plate?: string;
  store: string;
  createdAt: string;
  onResolve?: () => void;
  onComplete?: () => void;
  isLoading?: boolean;
  // Campos específicos para pendências
  vehicleId?: string;
  pendencyType?: string;
  relatedAdvertisementId?: string;
  // Campos específicos para tarefas
  sourceType?: string;
  sourceId?: string;
}

const priorityConfig = {
  critical: { color: 'bg-red-500', label: 'Crítica', borderColor: 'border-red-500' },
  alta: { color: 'bg-red-500', label: 'Alta', borderColor: 'border-red-500' },
  high: { color: 'bg-orange-500', label: 'Alta', borderColor: 'border-orange-500' },
  normal: { color: 'bg-blue-500', label: 'Normal', borderColor: 'border-blue-500' },
  medium: { color: 'bg-yellow-500', label: 'Média', borderColor: 'border-yellow-500' },
  baixa: { color: 'bg-green-500', label: 'Baixa', borderColor: 'border-green-500' },
  low: { color: 'bg-green-500', label: 'Baixa', borderColor: 'border-green-500' }
};

export const ActionCard: React.FC<ActionCardProps> = ({
  id,
  type,
  title,
  description,
  priority,
  plate,
  store,
  createdAt,
  onResolve,
  onComplete,
  vehicleId,
  pendencyType,
  relatedAdvertisementId,
  sourceType,
  sourceId
}) => {
  const config = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.normal;
  const timeAgo = new Date(createdAt).toLocaleDateString('pt-BR');

  const handleResolved = () => {
    onResolve?.();
  };

  const handleCompleted = () => {
    onComplete?.();
  };

  // Criar objetos específicos para cada tipo
  const pendencyData = type === 'pendency' ? {
    id,
    vehicleId: vehicleId || '',
    plate: plate || '',
    type: pendencyType as any,
    severity: priority === 'critical' || priority === 'alta' ? 'critical' : 
              priority === 'high' ? 'high' : 
              priority === 'medium' || priority === 'normal' ? 'medium' : 'low',
    title,
    description,
    store,
    createdAt,
    relatedAdvertisementId
  } : null;

  const taskData = type === 'task' ? {
    id,
    title,
    description,
    vehicle_id: vehicleId,
    source_type: sourceType || 'system',
    source_id: sourceId,
    vehicle_plate: plate
  } : null;

  return (
    <Card className={`hover:shadow-md transition-shadow border-l-4 ${config.borderColor}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {type === 'pendency' && <AlertTriangle className="h-4 w-4 text-orange-500" />}
              {type === 'task' && <Clock className="h-4 w-4 text-blue-500" />}
              <Badge variant="outline" className="text-xs">
                {type === 'pendency' ? 'Pendência' : 'Tarefa'}
              </Badge>
            </div>
            <h3 className="font-semibold text-sm leading-tight">{title}</h3>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{description}</p>
          </div>
          <Badge variant="outline" className={`text-xs text-white ${config.color}`}>
            {config.label}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
          {plate && (
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span className="font-mono">{plate}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            <span>{store}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{timeAgo}</span>
          </div>
        </div>

        {type === 'pendency' && pendencyData && (
          <PendencyActionButton 
            pendency={pendencyData} 
            onResolved={handleResolved}
          />
        )}

        {type === 'task' && taskData && (
          <TaskActionButton 
            task={taskData} 
            onCompleted={handleCompleted}
          />
        )}
      </CardContent>
    </Card>
  );
};
