
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarIcon, FileText, Download } from 'lucide-react';
import { SalesMetricsCards } from './SalesMetricsCards';
import { SalesChart } from './SalesChart';
import { TopSellersCard } from './TopSellersCard';
import { useSalesAnalytics } from '@/hooks/useSalesAnalytics';
import { useIsMobile } from '@/hooks/use-mobile';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const SalesDashboard: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month' | 'quarter'>('month');
  const { salesMetrics, topVendedores, isLoadingMetrics } = useSalesAnalytics();
  const isMobile = useIsMobile();

  const handleExportReport = () => {
    console.log('Exportando relatório...');
  };

  if (!salesMetrics && !isLoadingMetrics) {
    return (
      <div className="content-container py-3 md:py-6">
        <div className="text-center py-8">
          <p className="text-gray-500">Erro ao carregar dados de vendas</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-container py-3 md:py-6 mobile-spacing">
      {/* Header Mobile-Friendly */}
      <div className="mobile-stack justify-between items-start md:items-center gap-4 mb-4 md:mb-6">
        <div>
          <h1 className="mobile-header">Vendas</h1>
          <p className="text-gray-500 mt-1 text-sm md:text-base">
            {isMobile ? 'Desempenho de vendas' : 'Acompanhe o desempenho de vendas em tempo real'}
          </p>
        </div>
        {!isMobile && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportReport}>
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
            <Button variant="outline" size="sm">
              <CalendarIcon className="w-4 h-4 mr-2" />
              {format(new Date(), 'MMM yyyy', { locale: ptBR })}
            </Button>
          </div>
        )}
      </div>

      {/* Filtros de período */}
      <div className="flex gap-2 mb-4 md:mb-6 overflow-x-auto">
        {[
          { key: 'today', label: 'Hoje' },
          { key: 'week', label: 'Semana' },
          { key: 'month', label: 'Mês' },
          { key: 'quarter', label: 'Trimestre' }
        ].map((period) => (
          <Button
            key={period.key}
            variant={selectedPeriod === period.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedPeriod(period.key as any)}
            className="mobile-button whitespace-nowrap"
          >
            {period.label}
          </Button>
        ))}
      </div>

      {/* Cards de métricas - Ocultos em Mobile */}
      {!isMobile && (
        <SalesMetricsCards
          totalVendas={salesMetrics?.totalVendas || 0}
          totalFaturamento={salesMetrics?.totalFaturamento || 0}
          ticketMedio={salesMetrics?.ticketMedio || 0}
          crescimentoVendas={salesMetrics?.crescimentoVendas || 0}
          crescimentoFaturamento={salesMetrics?.crescimentoFaturamento || 0}
          isLoading={isLoadingMetrics}
        />
      )}

      {/* Gráficos - Ocultos em Mobile */}
      {!isMobile && (
        <div className="grid gap-6 md:grid-cols-2 mb-6">
          <SalesChart
            data={salesMetrics?.vendasPorDia || {}}
            type="bar"
            metric="vendas"
          />
          <SalesChart
            data={salesMetrics?.vendasPorDia || {}}
            type="line"
            metric="faturamento"
          />
        </div>
      )}

      {/* Conteúdo Principal - Sempre Visível */}
      <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-3">
        <TopSellersCard
          vendedores={topVendedores || []}
          isLoading={isLoadingMetrics}
        />
        
        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg">Vendas Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {salesMetrics?.vendasDetalhadas?.slice(0, isMobile ? 3 : 5).map((venda: any) => (
                <div key={venda.id} className="flex justify-between items-center py-2 border-b">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm md:text-base truncate">{venda.vehicles?.model}</p>
                    <p className="text-xs md:text-sm text-gray-500">{venda.vehicles?.plate}</p>
                  </div>
                  <div className="text-right ml-2">
                    <p className="font-bold text-green-600 text-sm md:text-base">
                      {new Intl.NumberFormat('pt-BR', {
                        style: 'currency',
                        currency: 'BRL'
                      }).format(venda.valor_venda)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {format(new Date(venda.data_venda), 'dd/MM/yyyy')}
                    </p>
                  </div>
                </div>
              )) || []}
              {(!salesMetrics?.vendasDetalhadas || salesMetrics.vendasDetalhadas.length === 0) && (
                <p className="text-center text-gray-500 py-4 text-sm md:text-base">
                  Nenhuma venda recente
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg">Relatórios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start text-sm touch-friendly">
                <FileText className="w-4 h-4 mr-2" />
                Mensal
              </Button>
              <Button variant="outline" className="w-full justify-start text-sm touch-friendly">
                <FileText className="w-4 h-4 mr-2" />
                Top Veículos
              </Button>
              <Button variant="outline" className="w-full justify-start text-sm touch-friendly">
                <FileText className="w-4 h-4 mr-2" />
                Vendedores
              </Button>
              {!isMobile && (
                <Button variant="outline" className="w-full justify-start text-sm">
                  <FileText className="w-4 h-4 mr-2" />
                  Comissões
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
