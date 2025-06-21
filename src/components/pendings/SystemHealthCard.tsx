
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, RefreshCw, Settings, Activity } from 'lucide-react';
import { useSystemHealth } from '@/hooks/useSystemHealth';
import { useIsMobile } from '@/hooks/use-mobile';

export const SystemHealthCard: React.FC = () => {
  const { 
    healthMetrics, 
    isLoading, 
    recalculatePendencies, 
    detectInconsistencies,
    isRecalculating,
    isDetecting
  } = useSystemHealth();
  const isMobile = useIsMobile();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <Activity className="h-4 w-4 md:h-5 md:w-5" />
            Saúde do Sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!healthMetrics) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-red-600 text-center text-sm md:text-base">Erro ao carregar saúde do sistema</p>
        </CardContent>
      </Card>
    );
  }

  const getHealthColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getHealthIcon = (score: number) => {
    if (score >= 90) return <CheckCircle className="h-4 w-4 md:h-5 md:w-5 text-green-600" />;
    return <AlertTriangle className="h-4 w-4 md:h-5 md:w-5 text-orange-600" />;
  };

  return (
    <Card className="mb-4 md:mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            {getHealthIcon(healthMetrics.healthScore)}
            Saúde do Sistema
          </CardTitle>
          <Badge 
            variant={healthMetrics.healthScore >= 90 ? "default" : "destructive"}
            className="text-xs md:text-sm"
          >
            {healthMetrics.healthScore.toFixed(0)}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Métricas Compactas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <div className="text-center">
            <div className={`text-lg md:text-xl font-bold ${getHealthColor(healthMetrics.healthScore)}`}>
              {healthMetrics.totalInconsistencies}
            </div>
            <div className="text-xs md:text-sm text-muted-foreground">Total</div>
          </div>
          <div className="text-center">
            <div className="text-lg md:text-xl font-bold text-orange-600">
              {healthMetrics.orphanedAds}
            </div>
            <div className="text-xs md:text-sm text-muted-foreground">Órfãos</div>
          </div>
          <div className="text-center">
            <div className="text-lg md:text-xl font-bold text-blue-600">
              {healthMetrics.vehiclesWithoutAds}
            </div>
            <div className="text-xs md:text-sm text-muted-foreground">S/ Anúncios</div>
          </div>
          <div className="text-center">
            <div className="text-lg md:text-xl font-bold text-red-600">
              {healthMetrics.priceInconsistencies}
            </div>
            <div className="text-xs md:text-sm text-muted-foreground">Preços</div>
          </div>
        </div>

        {/* Ações - Simplificadas em Mobile */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => recalculatePendencies.mutate()}
            disabled={isRecalculating || isDetecting}
            className="flex-1 touch-friendly"
          >
            {isRecalculating ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            <span className="hidden sm:inline">Recalcular</span>
            <span className="sm:hidden">Sync</span>
          </Button>
          
          <Button
            size="sm"
            variant="outline"
            onClick={() => detectInconsistencies.mutate()}
            disabled={isRecalculating || isDetecting}
            className="flex-1 touch-friendly"
          >
            {isDetecting ? (
              <Settings className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Settings className="h-4 w-4 mr-2" />
            )}
            <span className="hidden sm:inline">Detectar</span>
            <span className="sm:hidden">Check</span>
          </Button>
        </div>

        {/* Informações Detalhadas - Ocultas em Mobile */}
        {!isMobile && (
          <div className="text-xs text-muted-foreground pt-2 border-t">
            Última verificação: {new Date(healthMetrics.lastHealthCheck).toLocaleString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
