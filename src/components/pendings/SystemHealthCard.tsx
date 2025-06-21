
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  Search, 
  Activity,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { useSystemHealth } from '@/hooks/useSystemHealth';

export const SystemHealthCard: React.FC = () => {
  const {
    healthMetrics,
    isLoading,
    recalculatePendencies,
    detectInconsistencies,
    isRecalculating,
    isDetecting
  } = useSystemHealth();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Saúde do Sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-8 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!healthMetrics) return null;

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getHealthBadgeVariant = (score: number) => {
    if (score >= 80) return 'default';
    if (score >= 60) return 'secondary';
    return 'destructive';
  };

  const HealthIcon = healthMetrics.healthScore >= 80 ? CheckCircle : AlertTriangle;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Saúde do Sistema
          </CardTitle>
          <Badge variant={getHealthBadgeVariant(healthMetrics.healthScore)}>
            <HealthIcon className="h-3 w-3 mr-1" />
            {healthMetrics.healthScore}% Saudável
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Score de Saúde</span>
            <span className={getHealthColor(healthMetrics.healthScore)}>
              {healthMetrics.healthScore}/100
            </span>
          </div>
          <Progress 
            value={healthMetrics.healthScore} 
            className="h-2"
          />
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <p className="text-muted-foreground">Inconsistências Totais</p>
            <p className="text-2xl font-bold flex items-center gap-1">
              {healthMetrics.totalInconsistencies}
              {healthMetrics.totalInconsistencies > 0 ? (
                <TrendingUp className="h-4 w-4 text-red-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-green-500" />
              )}
            </p>
          </div>
          
          <div className="space-y-1">
            <p className="text-muted-foreground">Anúncios Órfãos</p>
            <p className="text-2xl font-bold text-orange-600">
              {healthMetrics.orphanedAds}
            </p>
          </div>
          
          <div className="space-y-1">
            <p className="text-muted-foreground">Veículos sem Anúncios</p>
            <p className="text-2xl font-bold text-blue-600">
              {healthMetrics.vehiclesWithoutAds}
            </p>
          </div>
          
          <div className="space-y-1">
            <p className="text-muted-foreground">Erros de Preço</p>
            <p className="text-2xl font-bold text-red-600">
              {healthMetrics.priceInconsistencies}
            </p>
          </div>
        </div>

        {/* Última verificação */}
        <div className="text-xs text-muted-foreground border-t pt-3">
          Última verificação: {new Date(healthMetrics.lastHealthCheck).toLocaleString('pt-BR')}
        </div>

        {/* Ações */}
        <div className="flex gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => detectInconsistencies.mutate()}
            disabled={isDetecting}
            className="flex-1"
          >
            <Search className={`h-4 w-4 mr-2 ${isDetecting ? 'animate-spin' : ''}`} />
            {isDetecting ? 'Detectando...' : 'Detectar'}
          </Button>
          
          <Button
            size="sm"
            onClick={() => recalculatePendencies.mutate()}
            disabled={isRecalculating}
            className="flex-1"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRecalculating ? 'animate-spin' : ''}`} />
            {isRecalculating ? 'Recalculando...' : 'Recalcular'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
