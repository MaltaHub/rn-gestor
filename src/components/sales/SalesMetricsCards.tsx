
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Calculator, Users } from 'lucide-react';

interface SalesMetricsProps {
  totalVendas: number;
  totalFaturamento: number;
  ticketMedio: number;
  crescimentoVendas: number;
  crescimentoFaturamento: number;
  isLoading?: boolean;
}

export const SalesMetricsCards: React.FC<SalesMetricsProps> = ({
  totalVendas,
  totalFaturamento,
  ticketMedio,
  crescimentoVendas,
  crescimentoFaturamento,
  isLoading
}) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatPercent = (value: number) => {
    const isPositive = value >= 0;
    return (
      <div className={`flex items-center gap-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
        <span className="font-medium">
          {isPositive ? '+' : ''}{value.toFixed(1)}%
        </span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 bg-gray-200 rounded w-20"></div>
              <div className="h-4 w-4 bg-gray-200 rounded"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-200 rounded w-24 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-16"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total de Vendas</CardTitle>
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalVendas}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            vs mês anterior
            {formatPercent(crescimentoVendas)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Faturamento</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(totalFaturamento)}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            vs mês anterior
            {formatPercent(crescimentoFaturamento)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
          <Calculator className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(ticketMedio)}</div>
          <div className="text-xs text-muted-foreground">
            Valor médio por venda
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Performance</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1">
            <Badge variant={crescimentoVendas >= 0 ? "default" : "destructive"}>
              Vendas {crescimentoVendas >= 0 ? '+' : ''}{crescimentoVendas.toFixed(1)}%
            </Badge>
            <Badge variant={crescimentoFaturamento >= 0 ? "default" : "destructive"}>
              Receita {crescimentoFaturamento >= 0 ? '+' : ''}{crescimentoFaturamento.toFixed(1)}%
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
