
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { useProductivityMetrics } from '@/hooks/useProductivityMetrics';

export const ProductivityDashboard: React.FC = () => {
  const { data: metrics, isLoading } = useProductivityMetrics(7);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-6 bg-gray-200 rounded w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const todayMetrics = metrics?.[0];
  const weekTotal = metrics?.reduce((acc, day) => ({
    tasks: acc.tasks + day.tasks_completed,
    pendencies: acc.pendencies + day.pendencies_resolved
  }), { tasks: 0, pendencies: 0 });

  const progressToday = Math.min(((todayMetrics?.tasks_completed || 0) / 10) * 100, 100);
  const efficiency = todayMetrics?.efficiency_score || 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Tarefas Hoje</CardTitle>
          <CheckCircle className="h-4 w-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{todayMetrics?.tasks_completed || 0}</div>
          <div className="space-y-2">
            <Progress value={progressToday} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {progressToday.toFixed(0)}% da meta diária
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pendências Resolvidas</CardTitle>
          <AlertTriangle className="h-4 w-4 text-orange-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{todayMetrics?.pendencies_resolved || 0}</div>
          <p className="text-xs text-muted-foreground">
            {weekTotal?.pendencies || 0} esta semana
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Eficiência</CardTitle>
          <TrendingUp className="h-4 w-4 text-blue-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{efficiency.toFixed(1)}%</div>
          <Progress value={efficiency} className="h-2 mt-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Tempo Médio</CardTitle>
          <Clock className="h-4 w-4 text-purple-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">24min</div>
          <p className="text-xs text-muted-foreground">
            por tarefa
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
