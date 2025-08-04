import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Car, Filter, Grid3X3, List, Search, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/components/ui/sonner";

const InventoryPage: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);

  const handleDeselectAll = () => {
    setSelectedVehicles([]);
    toast.info("Seleção removida");
  };

  const handleToggleSelect = (vehicleId: string) => {
    setSelectedVehicles(prev => {
      const newSelection = prev.includes(vehicleId)
        ? prev.filter(id => id !== vehicleId)
        : [...prev, vehicleId];

      if (newSelection.length > prev.length) {
        toast.success("Veículo adicionado à seleção");
      } else {
        toast.info("Veículo removido da seleção");
      }

      return newSelection;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
          <CardHeader className="pb-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Car className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    Estoque de Veículos
                  </CardTitle>
                  <p className="text-slate-600 dark:text-slate-400 mt-1">
                    Gerencie seu inventário de forma eficiente
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Disponível
                </Badge>
                <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                  <Clock className="h-3 w-3 mr-1" /> Reservado
                </Badge>
                <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  <AlertCircle className="h-3 w-3 mr-1" /> Vendido
                </Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {0} veículo(s) encontrado(s)
                </span>
                {selectedVehicles.length > 0 && (
                  <Badge className="bg-blue-600 text-white">
                    {selectedVehicles.length} selecionado(s)
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm">
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dashboard (placeholder) */}
        {!isMobile && (
          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
            <CardContent className="p-6">
              {/* Dashboard Placeholder */}
            </CardContent>
          </Card>
        )}

        {/* Filtros Avançados (placeholder) */}
        {!isMobile && (
          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-slate-600" />
                <CardTitle className="text-lg">Filtros Avançados</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {/* AdvancedFilters Placeholder */}
            </CardContent>
          </Card>
        )}

        {/* Filtros Básicos (placeholder) */}
        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
          <CardContent className="p-6">
            {/* InventoryFilters Placeholder */}
          </CardContent>
        </Card>

        {/* Ações em Lote (placeholder) */}
        {selectedVehicles.length > 0 && (
          <Card className="border-0 shadow-lg bg-blue-50/80 backdrop-blur-sm dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <CardContent className="p-4">
              {/* BulkActions Placeholder */}
            </CardContent>
          </Card>
        )}

        {/* Lista de Veículos (placeholder) */}
        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
          <CardContent className="p-6">
            {/* VehicleList Placeholder */}
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default InventoryPage;