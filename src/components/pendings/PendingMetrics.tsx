
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Clock, CheckCircle } from "lucide-react";

interface PendingMetricsProps {
  totalTasks: number;
  totalInsights: number;
  totalUnpublished: number;
  completionRate: number;
  avgResolutionTime: number;
  trend: 'up' | 'down' | 'stable';
}

const PendingMetrics: React.FC<PendingMetricsProps> = ({
  totalTasks,
  totalInsights,
  totalUnpublished,
  completionRate,
  avgResolutionTime,
  trend
}) => {
  const totalPendings = totalTasks + totalInsights + totalUnpublished;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total de Pendências</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalPendings}</div>
          <p className="text-xs text-muted-foreground">
            {totalTasks} tarefas, {totalInsights} insights, {totalUnpublished} anúncios
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Taxa de Resolução</CardTitle>
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{completionRate.toFixed(1)}%</div>
          <p className="text-xs text-muted-foreground">
            Meta: 85%
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Tempo Médio</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{avgResolutionTime.toFixed(1)}h</div>
          <p className="text-xs text-muted-foreground">
            Para resolução
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Tendência</CardTitle>
          {trend === 'up' ? (
            <TrendingUp className="h-4 w-4 text-green-600" />
          ) : trend === 'down' ? (
            <TrendingDown className="h-4 w-4 text-red-600" />
          ) : (
            <Clock className="h-4 w-4 text-yellow-600" />
          )}
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {trend === 'up' ? '+12%' : trend === 'down' ? '-8%' : '0%'}
          </div>
          <p className="text-xs text-muted-foreground">
            Últimos 7 dias
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PendingMetrics;
