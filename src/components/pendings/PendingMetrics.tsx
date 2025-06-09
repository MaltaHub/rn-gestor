
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import { usePendingAnalytics } from "@/hooks/usePendingAnalytics";

const PendingMetrics: React.FC = () => {
  const { data: analytics, isLoading, error } = usePendingAnalytics();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 bg-gray-200 rounded w-24"></div>
              <div className="h-4 w-4 bg-gray-200 rounded"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-200 rounded w-16 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-20"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="col-span-full">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center text-red-600">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Erro ao carregar métricas. Tente novamente.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalPendings = analytics.totalTasks + analytics.totalInsights + analytics.totalUnpublished;
  const todayTotal = analytics.tasksCompletedToday + analytics.insightsResolvedToday + analytics.adsPublishedToday;

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
            {analytics.totalTasks} tarefas, {analytics.totalInsights} insights, {analytics.totalUnpublished} anúncios
          </p>
          {analytics.oldestPendingDays > 0 && (
            <p className="text-xs text-orange-600 mt-1">
              Mais antiga: {analytics.oldestPendingDays} dias
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Taxa de Resolução</CardTitle>
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.completionRate.toFixed(1)}%</div>
          <p className="text-xs text-muted-foreground">
            Meta: 85%
          </p>
          <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full ${
                analytics.completionRate >= 85 ? 'bg-green-500' : 
                analytics.completionRate >= 70 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(analytics.completionRate, 100)}%` }}
            ></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Tempo Médio</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {analytics.avgResolutionTime < 24 
              ? `${analytics.avgResolutionTime.toFixed(1)}h`
              : `${(analytics.avgResolutionTime / 24).toFixed(1)}d`
            }
          </div>
          <p className="text-xs text-muted-foreground">
            Para resolução
          </p>
          {analytics.avgResolutionTime > 48 && (
            <p className="text-xs text-red-600 mt-1">
              Acima do ideal (48h)
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Hoje</CardTitle>
          {analytics.trend === 'up' ? (
            <TrendingUp className="h-4 w-4 text-green-600" />
          ) : analytics.trend === 'down' ? (
            <TrendingDown className="h-4 w-4 text-red-600" />
          ) : (
            <Clock className="h-4 w-4 text-yellow-600" />
          )}
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{todayTotal}</div>
          <p className="text-xs text-muted-foreground">
            Resolvidas hoje
          </p>
          <div className="text-xs text-muted-foreground mt-1">
            <div>{analytics.tasksCompletedToday} tarefas</div>
            <div>{analytics.insightsResolvedToday} insights</div>
            <div>{analytics.adsPublishedToday} anúncios</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PendingMetrics;
