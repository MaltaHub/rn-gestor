
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

interface TopSeller {
  id: string;
  name: string;
  vendas: number;
  faturamento: number;
}

export const useSalesAnalytics = (dateRange?: { start: Date; end: Date }) => {
  const { user } = useAuth();
  const { currentStore } = useStore();

  const { data: salesMetrics, isLoading: isLoadingMetrics } = useQuery({
    queryKey: ['sales-metrics', currentStore, dateRange],
    queryFn: async () => {
      if (!user) return null;

      const today = new Date();
      const startDate = dateRange?.start || startOfMonth(today);
      const endDate = dateRange?.end || endOfMonth(today);

      // Vendas do período atual
      const { data: currentSales, error: currentError } = await supabase
        .from('vendidos')
        .select(`
          *,
          vehicles!inner(plate, model, price)
        `)
        .eq('store', currentStore)
        .gte('data_venda', startDate.toISOString())
        .lte('data_venda', endDate.toISOString());

      if (currentError) throw currentError;

      // Vendas do período anterior para comparação
      const previousStart = subMonths(startDate, 1);
      const previousEnd = subMonths(endDate, 1);

      const { data: previousSales, error: previousError } = await supabase
        .from('vendidos')
        .select('*')
        .eq('store', currentStore)
        .gte('data_venda', previousStart.toISOString())
        .lte('data_venda', previousEnd.toISOString());

      if (previousError) throw previousError;

      // Cálculos de métricas
      const totalVendas = currentSales?.length || 0;
      const totalFaturamento = currentSales?.reduce((sum, sale) => sum + Number(sale.valor_venda), 0) || 0;
      const ticketMedio = totalVendas > 0 ? totalFaturamento / totalVendas : 0;

      const previousTotalVendas = previousSales?.length || 0;
      const previousFaturamento = previousSales?.reduce((sum, sale) => sum + Number(sale.valor_venda), 0) || 0;

      const crescimentoVendas = previousTotalVendas > 0 
        ? ((totalVendas - previousTotalVendas) / previousTotalVendas) * 100 
        : 0;

      const crescimentoFaturamento = previousFaturamento > 0 
        ? ((totalFaturamento - previousFaturamento) / previousFaturamento) * 100 
        : 0;

      // Vendas por vendedor
      const vendasPorVendedor = currentSales?.reduce((acc: any, sale) => {
        const vendedorId = sale.vendido_por || 'Não informado';
        if (!acc[vendedorId]) {
          acc[vendedorId] = { vendas: 0, faturamento: 0 };
        }
        acc[vendedorId].vendas += 1;
        acc[vendedorId].faturamento += Number(sale.valor_venda);
        return acc;
      }, {}) || {};

      // Vendas por dia para gráfico
      const vendasPorDia = currentSales?.reduce((acc: any, sale) => {
        const dia = format(new Date(sale.data_venda), 'yyyy-MM-dd');
        if (!acc[dia]) {
          acc[dia] = { vendas: 0, faturamento: 0 };
        }
        acc[dia].vendas += 1;
        acc[dia].faturamento += Number(sale.valor_venda);
        return acc;
      }, {}) || {};

      return {
        totalVendas,
        totalFaturamento,
        ticketMedio,
        crescimentoVendas,
        crescimentoFaturamento,
        vendasPorVendedor,
        vendasPorDia,
        vendasDetalhadas: currentSales
      };
    },
    enabled: !!user
  });

  const { data: topVendedores } = useQuery({
    queryKey: ['top-vendedores', currentStore],
    queryFn: async (): Promise<TopSeller[]> => {
      if (!user) return [];

      // Buscar vendas com informações do vendedor
      const { data: vendasData, error: vendasError } = await supabase
        .from('vendidos')
        .select('vendido_por, valor_venda')
        .eq('store', currentStore)
        .gte('data_venda', startOfMonth(new Date()).toISOString());

      if (vendasError) throw vendasError;

      // Buscar perfis dos vendedores
      const vendedorIds = [...new Set(vendasData?.map(v => v.vendido_por).filter(Boolean))];
      
      const { data: profilesData, error: profilesError } = await supabase
        .from('user_profiles')
        .select('id, name')
        .in('id', vendedorIds);

      if (profilesError) throw profilesError;

      // Mapear vendedores com suas vendas
      const vendedoresMap = vendasData?.reduce((acc: any, sale) => {
        const vendedorId = sale.vendido_por;
        if (!vendedorId) return acc;
        
        const profile = profilesData?.find(p => p.id === vendedorId);
        const vendedorName = profile?.name || 'Não informado';
        
        if (!acc[vendedorId]) {
          acc[vendedorId] = {
            id: vendedorId,
            name: vendedorName,
            vendas: 0,
            faturamento: 0
          };
        }
        acc[vendedorId].vendas += 1;
        acc[vendedorId].faturamento += Number(sale.valor_venda);
        return acc;
      }, {}) || {};

      // Corrigir a tipagem aqui
      const topSellers = Object.values(vendedoresMap) as TopSeller[];
      return topSellers
        .sort((a, b) => b.faturamento - a.faturamento)
        .slice(0, 5);
    },
    enabled: !!user
  });

  return {
    salesMetrics,
    topVendedores: topVendedores || [],
    isLoadingMetrics
  };
};
