
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Filter, X } from 'lucide-react';

interface SalesFiltersProps {
  filters: {
    vendedor: string;
    periodo: string;
    status: string;
    cpf: string;
    placa: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
  vendedores: Array<{ id: string; name: string }>;
}

export const SalesFilters: React.FC<SalesFiltersProps> = ({
  filters,
  onFilterChange,
  onClearFilters,
  vendedores
}) => {
  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Filter className="w-5 h-5" />
          Filtros de Busca
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <Label htmlFor="cpf-filter">CPF do Cliente</Label>
            <Input
              id="cpf-filter"
              placeholder="000.000.000-00"
              value={filters.cpf}
              onChange={(e) => onFilterChange('cpf', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="placa-filter">Placa do Veículo</Label>
            <Input
              id="placa-filter"
              placeholder="ABC-1234"
              value={filters.placa}
              onChange={(e) => onFilterChange('placa', e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="vendedor-filter">Vendedor</Label>
            <Select value={filters.vendedor} onValueChange={(value) => onFilterChange('vendedor', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos</SelectItem>
                {vendedores.map((vendedor) => (
                  <SelectItem key={vendedor.id} value={vendedor.id}>
                    {vendedor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="periodo-filter">Período</Label>
            <Select value={filters.periodo} onValueChange={(value) => onFilterChange('periodo', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos</SelectItem>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="semana">Esta Semana</SelectItem>
                <SelectItem value="mes">Este Mês</SelectItem>
                <SelectItem value="trimestre">Este Trimestre</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="status-filter">Status</Label>
            <Select value={filters.status} onValueChange={(value) => onFilterChange('status', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos</SelectItem>
                <SelectItem value="pendente">Pendente Aprovação</SelectItem>
                <SelectItem value="aprovada">Aprovada</SelectItem>
                <SelectItem value="finalizada">Finalizada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onClearFilters} className="flex items-center gap-2">
            <X className="w-4 h-4" />
            Limpar Filtros
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
