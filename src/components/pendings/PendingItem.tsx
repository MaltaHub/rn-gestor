
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
  User
} from "lucide-react";
import { usePendingWorkflow } from "@/hooks/usePendingWorkflow";
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
  const { isExecuting, markAdvertisementPublished, resolveInsight } = usePendingWorkflow();

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
        return 'bg-blue-50 border-blue-200';
      case 'insight':
        return 'bg-orange-50 border-orange-200';
      case 'advertisement':
        return 'bg-green-50 border-green-200';
      default:
        return 'bg-gray-50 border-gray-200';
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

  const handleQuickAction = async () => {
    try {
      if (type === 'advertisement' && advertisementId) {
        await markAdvertisementPublished(advertisementId);
        toast.success('Anúncio marcado como publicado!');
      } else if (type === 'insight' && insightId) {
        await resolveInsight(insightId);
        toast.success('Insight resolvido!');
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

  return (
    <div className={`p-4 border rounded-lg ${getTypeColor()} hover:shadow-md transition-shadow`}>
      <div className="flex items-start gap-3">
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onSelect(id, !!checked)}
          className="mt-1"
        />
        
        <div className="flex-1">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              {getTypeIcon()}
              <h3 className="font-medium">{title}</h3>
              {getPriorityBadge()}
            </div>
            
            <div className="flex items-center gap-2">
              {(type === 'advertisement' || type === 'insight') && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleQuickAction}
                  disabled={isExecuting}
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {type === 'advertisement' ? 'Publicar' : 'Resolver'}
                </Button>
              )}
              
              {onNavigate && (
                <Button size="sm" variant="ghost" onClick={onNavigate}>
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>

          {description && (
            <p className="text-sm text-muted-foreground mb-2">{description}</p>
          )}

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {plate && (
              <span className="flex items-center gap-1">
                <span className="font-mono bg-white px-2 py-1 rounded border">
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
