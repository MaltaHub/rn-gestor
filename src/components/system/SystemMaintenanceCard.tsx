
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  Trash2, 
  Sync,
  Activity
} from 'lucide-react';
import { useTaskSystem } from '@/hooks/useTaskSystem';
import { useIsMobile } from '@/hooks/use-mobile';

export const SystemMaintenanceCard: React.FC = () => {
  const {
    taskStats,
    isLoadingStats,
    recalculateSystem,
    detectInconsistencies,
    cleanupObsoleteTasks,
    syncCurrentState,
    isRecalculating,
    isDetecting,
    isCleaning,
    isSyncing
  } = useTaskSystem();
  
  const isMobile = useIsMobile();

  if (isLoadingStats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            <Activity className="h-4 w-4 md:h-5 md:w-5" />
            Sistema de Manutenção
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

  const getHealthColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getHealthIcon = (score: number) => {
    if (score >= 90) return <CheckCircle className="h-4 w-4 md:h-5 md:w-5 text-green-600" />;
    return <AlertTriangle className="h-4 w-4 md:h-5 md:w-5 text-orange-600" />;
  };

  const healthScore = taskStats?.systemHealth || 0;

  return (
    <Card className="mb-4 md:mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base md:text-lg">
            {getHealthIcon(healthScore)}
            Sistema de Manutenção
          </CardTitle>
          <Badge 
            variant={healthScore >= 90 ? "default" : "destructive"}
            className="text-xs md:text-sm"
          >
            {healthScore.toFixed(0)}%
          </Badge>
        </div>
        <CardDescription>
          Automação inteligente de tarefas e detecção de inconsistências
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Métricas Compactas */}
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          <div className="text-center">
            <div className="text-lg md:text-xl font-bold text-blue-600">
              {taskStats?.totalTasks || 0}
            </div>
            <div className="text-xs md:text-sm text-muted-foreground">Total</div>
          </div>
          <div className="text-center">
            <div className="text-lg md:text-xl font-bold text-orange-600">
              {taskStats?.pendingTasks || 0}
            </div>
            <div className="text-xs md:text-sm text-muted-foreground">Pendentes</div>
          </div>
          <div className="text-center">
            <div className="text-lg md:text-xl font-bold text-green-600">
              {taskStats?.completedTasks || 0}
            </div>
            <div className="text-xs md:text-sm text-muted-foreground">Concluídas</div>
          </div>
        </div>

        {/* Ações de Manutenção */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => recalculateSystem.mutate()}
            disabled={isRecalculating || isDetecting || isCleaning || isSyncing}
            className="touch-friendly"
          >
            {isRecalculating ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                {!isMobile && 'Recalculando...'}
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                {isMobile ? 'Recalc.' : 'Recalcular'}
              </>
            )}
          </Button>
          
          <Button
            size="sm"
            variant="outline"
            onClick={() => detectInconsistencies.mutate()}
            disabled={isRecalculating || isDetecting || isCleaning || isSyncing}
            className="touch-friendly"
          >
            {isDetecting ? (
              <>
                <AlertTriangle className="h-4 w-4 mr-2 animate-spin" />
                {!isMobile && 'Detectando...'}
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 mr-2" />
                {isMobile ? 'Detect.' : 'Detectar'}
              </>
            )}
          </Button>
          
          <Button
            size="sm"
            variant="outline"
            onClick={() => cleanupObsoleteTasks.mutate()}
            disabled={isRecalculating || isDetecting || isCleaning || isSyncing}
            className="touch-friendly"
          >
            {isCleaning ? (
              <>
                <Trash2 className="h-4 w-4 mr-2 animate-spin" />
                {!isMobile && 'Limpando...'}
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                {isMobile ? 'Limpar' : 'Limpar'}
              </>
            )}
          </Button>
          
          <Button
            size="sm"
            variant="outline"
            onClick={() => syncCurrentState.mutate()}
            disabled={isRecalculating || isDetecting || isCleaning || isSyncing}
            className="touch-friendly"
          >
            {isSyncing ? (
              <>
                <Sync className="h-4 w-4 mr-2 animate-spin" />
                {!isMobile && 'Sincronizando...'}
              </>
            ) : (
              <>
                <Sync className="h-4 w-4 mr-2" />
                {isMobile ? 'Sync' : 'Sincronizar'}
              </>
            )}
          </Button>
        </div>

        {/* Status de Saúde */}
        <div className="pt-2 border-t">
          <div className={`text-sm font-medium ${getHealthColor(healthScore)}`}>
            {healthScore >= 90 ? '✅ Sistema saudável' : 
             healthScore >= 70 ? '⚠️ Atenção necessária' : 
             '🚨 Intervenção urgente'}
          </div>
          {!isMobile && (
            <div className="text-xs text-muted-foreground mt-1">
              Use as ações acima para manter o sistema otimizado
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
