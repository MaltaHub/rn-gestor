
import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, User, MapPin, AlertTriangle } from 'lucide-react';
import { PendencyActionButton } from './PendencyActionButton';
import { TaskActionButton } from './TaskActionButton';

interface BaseActionCardProps {
  id: string;
  title: string;
  description: string;
  priority: 'baixa' | 'normal' | 'alta' | 'critical' | 'high' | 'medium' | 'low';
  plate?: string;
  store: string;
  createdAt: string;
  vehicleId?: string;
  onResolve?: () => void;
  onComplete?: () => void;
}

interface PendencyActionCardProps extends BaseActionCardProps {
  type: 'pendency';
  pendencyType: string;
  relatedAdvertisementId?: string;
}

interface TaskActionCardProps extends BaseActionCardProps {
  type: 'task';
  sourceType?: string;
  sourceId?: string;
}

type ActionCardProps = PendencyActionCardProps | TaskActionCardProps;

const priorityConfig = {
  critical: { color: 'bg-red-500', label: 'Crítica', borderColor: 'border-red-500' },
  alta: { color: 'bg-red-500', label: 'Alta', borderColor: 'border-red-500' },
  high: { color: 'bg-orange-500', label: 'Alta', borderColor: 'border-orange-500' },
  normal: { color: 'bg-blue-500', label: 'Normal', borderColor: 'border-blue-500' },
  medium: { color: 'bg-yellow-500', label: 'Média', borderColor: 'border-yellow-500' },
  baixa: { color: 'bg-green-500', label: 'Baixa', borderColor: 'border-green-500' },
  low: { color: 'bg-green-500', label: 'Baixa', borderColor: 'border-green-500' }
};

export const ActionCard: React.FC<ActionCardProps> = (props) => {
  const {
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
    vehicleId
  } = props;

  const config = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.normal;
  const timeAgo = new Date(createdAt).toLocaleDateString('pt-BR');

  const handleResolved = () => {
    onResolve?.();
  };

  const handleCompleted = () => {
    onComplete?.();
  };

  // Mapear severity para o tipo esperado
  const mapPriorityToSeverity = (priority: string): 'critical' | 'high' | 'medium' | 'low' => {
    switch (priority) {
      case 'critical':
      case 'alta':
        return 'critical';
      case 'high':
        return 'high';
      case 'normal':
      case 'medium':
        return 'medium';
      case 'baixa':
      case 'low':
      default:
        return 'low';
    }
  };

  // Criar objetos específicos para cada tipo
  const pendencyData = type === 'pendency' ? {
    id,
    vehicleId: vehicleId || '',
    plate: plate || '',
    type: (props as PendencyActionCardProps).pendencyType as any,
    severity: mapPriorityToSeverity(priority),
    title,
    description,
    store,
    createdAt,
    relatedAdvertisementId: (props as PendencyActionCardProps).relatedAdvertisementId
  } : null;

  const taskData = type === 'task' ? {
    id,
    title,
    description,
    vehicle_id: vehicleId,
    source_type: (props as TaskActionCardProps).sourceType || 'system',
    source_id: (props as TaskActionCardProps).sourceId,
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
