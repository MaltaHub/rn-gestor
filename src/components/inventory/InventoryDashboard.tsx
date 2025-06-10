
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VehicleWithIndicators } from "@/types";
import { Car, Clock, AlertCircle, TrendingUp, MapPin, FileText } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from "recharts";

interface InventoryDashboardProps {
  vehicles: VehicleWithIndicators[];
  isLoading: boolean;
}

export const InventoryDashboard: React.FC<InventoryDashboardProps> = ({
  vehicles,
  isLoading
}) => {
  const stats = React.useMemo(() => {
    if (!vehicles.length) {
      return {
        total: 0,
        available: 0,
        reserved: 0,
        sold: 0,
        pendingPhotos: 0,
        pendingDocs: 0,
        avgPrice: 0,
        byStore: {},
        priceRanges: [],
        statusData: []
      };
    }

    const byStore: Record<string, number> = {};
    const priceRanges = [
      { range: "0-30k", count: 0 },
      { range: "30-60k", count: 0 },
      { range: "60-100k", count: 0 },
      { range: "100k+", count: 0 }
    ];

    let pendingPhotos = 0;
    let pendingDocs = 0;
    let totalPrice = 0;

    vehicles.forEach(vehicle => {
      byStore[vehicle.store] = (byStore[vehicle.store] || 0) + 1;
      totalPrice += vehicle.price;

      // Contar fotos pendentes
      if ((vehicle.store === 'Roberto Automóveis' && !vehicle.fotos_roberto) ||
          (vehicle.store === 'RN Multimarcas' && !vehicle.fotos_rn)) {
        pendingPhotos++;
      }

      // Contar documentação pendente
      if (vehicle.documentacao && ['Fazendo Laudo', 'Vistoria', 'Transferência', 'IPVA Atrasado'].includes(vehicle.documentacao)) {
        pendingDocs++;
      }

      // Distribuição por preço
      if (vehicle.price < 30000) priceRanges[0].count++;
      else if (vehicle.price < 60000) priceRanges[1].count++;
      else if (vehicle.price < 100000) priceRanges[2].count++;
      else priceRanges[3].count++;
    });

    const statusCounts = {
      available: vehicles.filter(v => v.status === 'available').length,
      reserved: vehicles.filter(v => v.status === 'reserved').length,
      sold: vehicles.filter(v => v.status === 'sold').length
    };

    const statusData = [
      { name: "Disponível", value: statusCounts.available, color: "#22c55e" },
      { name: "Reservado", value: statusCounts.reserved, color: "#eab308" },
      { name: "Vendido", value: statusCounts.sold, color: "#ef4444" }
    ];

    return {
      total: vehicles.length,
      ...statusCounts,
      pendingPhotos,
      pendingDocs,
      avgPrice: totalPrice / vehicles.length,
      byStore,
      priceRanges,
      statusData
    };
  }, [vehicles]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-8 bg-gray-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const chartConfig = {
    disponivel: { label: "Disponível", color: "#22c55e" },
    reservado: { label: "Reservado", color: "#eab308" },
    vendido: { label: "Vendido", color: "#ef4444" }
  };

  return (
    <div className="space-y-6 mb-6">
      {/* Cards de Estatísticas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Veículos</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">
              {stats.available} disponíveis
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Preço Médio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {stats.avgPrice.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </div>
            <div className="text-xs text-muted-foreground">
              {stats.available} veículos disponíveis
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fotos Pendentes</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.pendingPhotos}</div>
            <div className="text-xs text-muted-foreground">
              Precisam de fotos
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Docs Pendentes</CardTitle>
            <FileText className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.pendingDocs}</div>
            <div className="text-xs text-muted-foreground">
              Documentação em andamento
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {stats.statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuição por Faixa de Preço</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.priceRanges}>
                  <XAxis dataKey="range" />
                  <YAxis />
                  <Bar dataKey="count" fill="#3b82f6" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Distribuição por Loja */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Distribuição por Loja
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {Object.entries(stats.byStore).map(([store, count]) => (
              <div key={store} className="flex items-center gap-2">
                <Badge variant="outline">{store}</Badge>
                <span className="text-sm font-medium">{count} veículos</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
