
import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, User, MapPin } from 'lucide-react';

interface ActionCardProps {
  id: string;
  type: 'pendency' | 'task';
  title: string;
  description: string;
  priority: 'baixa' | 'normal' | 'alta' | 'critical' | 'high' | 'medium' | 'low';
  plate?: string;
  store: string;
  createdAt: string;
  onResolve: () => void;
  onComplete?: () => void;
  isLoading?: boolean;
}

const priorityConfig = {
  critical: { color: 'bg-red-500', label: 'Crítica' },
  alta: { color: 'bg-red-500', label: 'Alta' },
  high: { color: 'bg-orange-500', label: 'Alta' },
  normal: { color: 'bg-blue-500', label: 'Normal' },
  medium: { color: 'bg-yellow-500', label: 'Média' },
  baixa: { color: 'bg-green-500', label: 'Baixa' },
  low: { color: 'bg-green-500', label: 'Baixa' }
};

export const ActionCard: React.FC<ActionCardProps> = ({
  title,
  description,
  priority,
  plate,
  store,
  createdAt,
  type,
  onResolve,
  onComplete,
  isLoading = false
}) => {
  const config = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.normal;
  const timeAgo = new Date(createdAt).toLocaleDateString('pt-BR');

  return (
    <Card className="hover:shadow-md transition-shadow border-l-4" style={{ borderLeftColor: config.color.replace('bg-', '#') }}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="font-semibold text-sm leading-tight">{title}</h3>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{description}</p>
          </div>
          <Badge variant="outline" className={`text-xs ${config.color} text-white`}>
            {config.label}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
          {plate && (
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span>{plate}</span>
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

        <div className="flex gap-2">
          {type === 'pendency' ? (
            <Button 
              onClick={onResolve}
              disabled={isLoading}
              size="sm"
              className="flex-1"
            >
              {isLoading ? 'Resolvendo...' : 'Resolver'}
            </Button>
          ) : (
            <Button 
              onClick={onComplete}
              disabled={isLoading}
              size="sm"
              className="flex-1"
            >
              {isLoading ? 'Concluindo...' : 'Concluir'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
