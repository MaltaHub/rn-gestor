
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SalesChartProps {
  data: Record<string, { vendas: number; faturamento: number }>;
  type?: 'bar' | 'line';
  metric?: 'vendas' | 'faturamento';
}

export const SalesChart: React.FC<SalesChartProps> = ({ 
  data, 
  type = 'bar', 
  metric = 'vendas' 
}) => {
  const chartData = Object.entries(data).map(([date, values]) => ({
    date: format(new Date(date), 'dd/MM', { locale: ptBR }),
    fullDate: date,
    vendas: values.vendas,
    faturamento: values.faturamento
  })).sort((a, b) => a.fullDate.localeCompare(b.fullDate));

  const formatTooltipValue = (value: number) => {
    if (metric === 'faturamento') {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(value);
    }
    return value.toString();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {metric === 'vendas' ? 'Vendas por Dia' : 'Faturamento por Dia'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          {type === 'line' ? (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip 
                formatter={(value: number) => [formatTooltipValue(value), metric === 'vendas' ? 'Vendas' : 'Faturamento']}
                labelFormatter={(label) => `Data: ${label}`}
              />
              <Line 
                dataKey={metric} 
                stroke={metric === 'vendas' ? '#8884d8' : '#82ca9d'}
                strokeWidth={2}
              />
            </LineChart>
          ) : (
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip 
                formatter={(value: number) => [formatTooltipValue(value), metric === 'vendas' ? 'Vendas' : 'Faturamento']}
                labelFormatter={(label) => `Data: ${label}`}
              />
              <Bar 
                dataKey={metric} 
                fill={metric === 'vendas' ? '#8884d8' : '#82ca9d'}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
