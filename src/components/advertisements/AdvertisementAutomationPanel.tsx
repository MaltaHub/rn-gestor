
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Zap, 
  Target, 
  TrendingUp, 
  CheckCircle2,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { useAdvertisements } from '@/hooks/useAdvertisements';
import { usePendingWorkflow } from '@/hooks/usePendingWorkflow';
import { useTaskSystem } from '@/hooks/useTaskSystem';
import { useIsMobile } from '@/hooks/use-mobile';

export const AdvertisementAutomationPanel: React.FC = () => {
  const { advertisements } = useAdvertisements();
  const { markAdvertisementPublished, isItemExecuting } = usePendingWorkflow();
  const { taskStats, detectInconsistencies, isDetecting } = useTaskSystem();
  const isMobile = useIsMobile();

  // Calcular estatísticas dos anúncios
  const stats = React.useMemo(() => {
    const total = advertisements.length;
    const published = advertisements.filter(ad => ad.publicado).length;
    const pending = total - published;
    const publishRate = total > 0 ? (published / total) * 100 : 0;

    return { total, published, pending, publishRate };
  }, [advertisements]);

  // Encontrar anúncios que podem ser publicados automaticamente
  const autoPublishableAds = React.useMemo(() => {
    return advertisements.filter(ad => 
      !ad.publicado && 
      ad.vehicle_plates?.length > 0 &&
      ad.advertised_price > 0
    );
  }, [advertisements]);

  const handleBulkPublish = async () => {
    for (const ad of autoPublishableAds.slice(0, 5)) { // Máximo 5 por vez
      try {
        await markAdvertisementPublished(ad.id);
      } catch (error) {
        console.error(`Erro ao publicar anúncio ${ad.id}:`, error);
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Zap className="h-4 w-4 md:h-5 md:w-5" />
              Automação de Anúncios
            </CardTitle>
            <CardDescription>
              Publicação inteligente e otimização automática
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs md:text-sm">
            {stats.publishRate.toFixed(0)}% publicados
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Estatísticas Rápidas */}
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          <div className="text-center">
            <div className="text-lg md:text-xl font-bold text-blue-600">
              {stats.total}
            </div>
            <div className="text-xs md:text-sm text-muted-foreground">Total</div>
          </div>
          <div className="text-center">
            <div className="text-lg md:text-xl font-bold text-green-600">
              {stats.published}
            </div>
            <div className="text-xs md:text-sm text-muted-foreground">Publicados</div>
          </div>
          <div className="text-center">
            <div className="text-lg md:text-xl font-bold text-orange-600">
              {stats.pending}
            </div>
            <div className="text-xs md:text-sm text-muted-foreground">Pendentes</div>
          </div>
        </div>

        {/* Ações de Automação */}
        <div className="space-y-3">
          {autoPublishableAds.length > 0 && (
            <Alert>
              <Target className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span className="text-sm">
                  {autoPublishableAds.length} anúncio(s) prontos para publicação
                </span>
                <Button
                  size="sm"
                  onClick={handleBulkPublish}
                  disabled={isItemExecuting}
                  className="ml-2"
                >
                  {isItemExecuting ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                      Publicando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Publicar
                    </>
                  )}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => detectInconsistencies.mutate()}
              disabled={isDetecting}
              className="flex-1 touch-friendly"
            >
              {isDetecting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  {!isMobile && 'Verificando...'}
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  {isMobile ? 'Verificar' : 'Verificar Inconsistências'}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Indicadores de Performance */}
        <div className="pt-3 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Taxa de Publicação</span>
            <div className="flex items-center gap-2">
              <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-green-500 to-blue-500 transition-all duration-300"
                  style={{ width: `${stats.publishRate}%` }}
                />
              </div>
              <span className="font-medium text-green-600">
                {stats.publishRate.toFixed(1)}%
              </span>
            </div>
          </div>
          
          {!isMobile && (
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              Sistema otimizado para máxima eficiência
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
