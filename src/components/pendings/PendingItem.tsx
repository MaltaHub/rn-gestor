
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  CheckCircle, 
  Clock, 
  Eye, 
  ExternalLink, 
  AlertTriangle,
  Calendar,
  User,
  Loader2,
  Zap
} from "lucide-react";
import { usePendingWorkflow } from "@/hooks/usePendingWorkflow";
import { useTaskManager } from "@/hooks/useTaskManager";
import { useSmartValidation } from "@/hooks/useSmartValidation";
import { toast } from "@/components/ui/sonner";

interface PendingItemProps {
  id: string;
  type: 'task' | 'insight' | 'advertisement';
  title: string;
  description?: string;
  plate?: string;
  priority?: string;
  store?: string;
  createdAt: string;
  isSelected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onNavigate?: () => void;
  vehicleId?: string;
  advertisementId?: string;
  insightId?: string;
}

const PendingItem: React.FC<PendingItemProps> = ({
  id,
  type,
  title,
  description,
  plate,
  priority,
  store,
  createdAt,
  isSelected,
  onSelect,
  onNavigate,
  vehicleId,
  advertisementId,
  insightId
}) => {
  const { markAdvertisementPublished, resolveInsight, isItemExecuting } = usePendingWorkflow();
  const { canCreatePublicationTask, getTasksForAdvertisement } = useTaskManager();
  const { isPlateAvailableForPlatform } = useSmartValidation();

  const getTypeIcon = () => {
    switch (type) {
      case 'task':
        return <Clock className="h-4 w-4" />;
      case 'insight':
        return <AlertTriangle className="h-4 w-4" />;
      case 'advertisement':
        return <Eye className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getTypeColor = () => {
    switch (type) {
      case 'task':
        return 'bg-blue-50 border-blue-200 hover:bg-blue-100';
      case 'insight':
        return 'bg-orange-50 border-orange-200 hover:bg-orange-100';
      case 'advertisement':
        return 'bg-green-50 border-green-200 hover:bg-green-100';
      default:
        return 'bg-gray-50 border-gray-200 hover:bg-gray-100';
    }
  };

  const getPriorityBadge = () => {
    if (!priority) return null;
    
    const colors = {
      'critica': 'destructive',
      'alta': 'default',
      'normal': 'secondary',
      'baixa': 'outline'
    } as const;

    return (
      <Badge variant={colors[priority as keyof typeof colors] || 'secondary'}>
        {priority}
      </Badge>
    );
  };

  // Verificar se a ação pode ser executada
  const canExecuteAction = () => {
    if (type === 'advertisement' && advertisementId) {
      return canCreatePublicationTask(advertisementId);
    }
    return true;
  };

  // Detectar se é uma ação inteligente
  const isSmartAction = () => {
    if (type === 'advertisement') {
      // Verificar se ainda faz sentido publicar este anúncio
      return canExecuteAction();
    }
    return true;
  };

  const handleQuickAction = async () => {
    if (!canExecuteAction()) {
      toast.error('Esta ação não pode ser executada no momento');
      return;
    }

    try {
      if (type === 'advertisement' && advertisementId) {
        toast.promise(
          markAdvertisementPublished(advertisementId),
          {
            loading: 'Publicando anúncio...',
            success: 'Anúncio publicado com sucesso!',
            error: 'Erro ao publicar anúncio'
          }
        );
      } else if (type === 'insight' && insightId) {
        toast.promise(
          resolveInsight(insightId),
          {
            loading: 'Resolvendo insight...',
            success: 'Insight resolvido com sucesso!',
            error: 'Erro ao resolver insight'
          }
        );
      }
    } catch (error) {
      console.error('Erro na ação rápida:', error);
      toast.error('Erro ao executar ação');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Hoje';
    if (diffDays === 2) return 'Ontem';
    if (diffDays <= 7) return `${diffDays} dias atrás`;
    return date.toLocaleDateString('pt-BR');
  };

  const isExecuting = advertisementId ? isItemExecuting(advertisementId) : 
                     insightId ? isItemExecuting(insightId) : false;

  const smartAction = isSmartAction();

  return (
    <div className={`p-4 border rounded-lg transition-all duration-200 ${getTypeColor()} ${
      isExecuting ? 'opacity-60 animate-pulse' : 'hover:shadow-md'
    } ${!smartAction ? 'border-yellow-300 bg-yellow-50' : ''}`}>
      <div className="flex items-start gap-3">
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onSelect(id, !!checked)}
          className="mt-1"
          disabled={isExecuting}
        />
        
        <div className="flex-1">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              {getTypeIcon()}
              <h3 className="font-medium">{title}</h3>
              {getPriorityBadge()}
              {smartAction && (
                <Badge variant="outline" className="text-xs bg-green-100 border-green-300">
                  <Zap className="h-3 w-3 mr-1" />
                  Inteligente
                </Badge>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {(type === 'advertisement' || type === 'insight') && smartAction && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleQuickAction}
                  disabled={isExecuting || !canExecuteAction()}
                  className="min-w-[100px] transition-all duration-200"
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      {type === 'advertisement' ? 'Publicando...' : 'Resolvendo...'}
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {type === 'advertisement' ? 'Publicar' : 'Resolver'}
                    </>
                  )}
                </Button>
              )}
              
              {!smartAction && (
                <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-400">
                  Verificar
                </Badge>
              )}
              
              {onNavigate && (
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={onNavigate}
                  disabled={isExecuting}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>

          {description && (
            <p className="text-sm text-muted-foreground mb-2">{description}</p>
          )}

          {!smartAction && (
            <div className="text-xs text-yellow-600 mb-2 p-2 bg-yellow-100 rounded border border-yellow-300">
              ⚠️ Esta tarefa pode estar desatualizada. Verifique se ainda é necessária.
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {plate && (
              <span className="flex items-center gap-1">
                <span className="font-mono bg-white px-2 py-1 rounded border text-xs">
                  {plate}
                </span>
              </span>
            )}
            
            {store && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {store}
              </span>
            )}
            
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDate(createdAt)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PendingItem;
