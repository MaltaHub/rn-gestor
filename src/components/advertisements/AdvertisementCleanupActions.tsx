
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useAdvertisements } from '@/hooks/useAdvertisements';
import { useVehiclesData } from '@/hooks/useVehiclesData';
import { AlertTriangle, Trash2, RefreshCw, CheckCircle } from 'lucide-react';
import { toast } from '@/components/ui/sonner';

export const AdvertisementCleanupActions: React.FC = () => {
  const { advertisements, deleteAdvertisement } = useAdvertisements();
  const { vehicles } = useVehiclesData();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);

  // Detectar problemas nos anúncios
  const analysisResults = React.useMemo(() => {
    const orphanedAds = advertisements.filter(ad => 
      !ad.vehicle_plates || ad.vehicle_plates.length === 0
    );

    const invalidVehicleAds = advertisements.filter(ad => {
      if (!ad.vehicle_plates || ad.vehicle_plates.length === 0) return false;
      
      return ad.vehicle_plates.some(plate => 
        !vehicles.some(v => v.plate === plate && v.status === 'available')
      );
    });

    const duplicateAds = advertisements.filter((ad, index, arr) => {
      return arr.findIndex(other => 
        other.platform === ad.platform &&
        other.id !== ad.id &&
        JSON.stringify(other.vehicle_plates?.sort()) === JSON.stringify(ad.vehicle_plates?.sort())
      ) !== -1;
    });

    return {
      orphanedAds,
      invalidVehicleAds,
      duplicateAds,
      totalIssues: orphanedAds.length + invalidVehicleAds.length + duplicateAds.length
    };
  }, [advertisements, vehicles]);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    // Simular análise
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsAnalyzing(false);
    
    if (analysisResults.totalIssues === 0) {
      toast.success('Nenhum problema encontrado nos anúncios!');
    } else {
      toast.warning(`${analysisResults.totalIssues} problema(s) encontrado(s)`);
    }
  };

  const handleCleanup = async () => {
    if (analysisResults.totalIssues === 0) {
      toast.info('Nenhuma limpeza necessária');
      return;
    }

    const confirmCleanup = window.confirm(
      `Isso irá remover ${analysisResults.totalIssues} anúncio(s) com problemas. Continuar?`
    );

    if (!confirmCleanup) return;

    setIsCleaning(true);
    
    try {
      // Remover anúncios órfãos
      for (const ad of analysisResults.orphanedAds) {
        await deleteAdvertisement(ad.id);
      }

      // Remover anúncios com veículos inválidos
      for (const ad of analysisResults.invalidVehicleAds) {
        await deleteAdvertisement(ad.id);
      }

      toast.success(`${analysisResults.totalIssues} anúncio(s) removido(s) com sucesso!`);
    } catch (error) {
      toast.error('Erro durante a limpeza');
      console.error('Erro na limpeza:', error);
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Diagnóstico e Limpeza
        </CardTitle>
        <CardDescription>
          Detectar e corrigir problemas nos anúncios automaticamente
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button 
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            variant="outline"
            className="flex-1"
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Analisando...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Analisar Problemas
              </>
            )}
          </Button>
          
          <Button 
            onClick={handleCleanup}
            disabled={isCleaning || analysisResults.totalIssues === 0}
            variant="destructive"
            className="flex-1"
          >
            {isCleaning ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Limpando...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Limpar Problemas
              </>
            )}
          </Button>
        </div>

        {/* Resultados da Análise */}
        <div className="space-y-3">
          {analysisResults.totalIssues === 0 ? (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Todos os anúncios estão em ordem! ✅
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {analysisResults.orphanedAds.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="flex items-center justify-between">
                    <span>
                      {analysisResults.orphanedAds.length} anúncio(s) sem veículos
                    </span>
                    <Badge variant="destructive">
                      {analysisResults.orphanedAds.length}
                    </Badge>
                  </AlertDescription>
                </Alert>
              )}

              {analysisResults.invalidVehicleAds.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="flex items-center justify-between">
                    <span>
                      {analysisResults.invalidVehicleAds.length} anúncio(s) com veículos inválidos
                    </span>
                    <Badge variant="destructive">
                      {analysisResults.invalidVehicleAds.length}
                    </Badge>
                  </AlertDescription>
                </Alert>
              )}

              {analysisResults.duplicateAds.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="flex items-center justify-between">
                    <span>
                      {analysisResults.duplicateAds.length} anúncio(s) potencialmente duplicados
                    </span>
                    <Badge variant="outline">
                      {analysisResults.duplicateAds.length}
                    </Badge>
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          <strong>Última análise:</strong> {new Date().toLocaleString('pt-BR')}
        </div>
      </CardContent>
    </Card>
  );
};
