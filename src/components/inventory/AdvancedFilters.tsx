
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Filter, RotateCcw } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { LocalType, DocumentacaoType } from "@/types";

export interface AdvancedFilterState {
  priceMin: string;
  priceMax: string;
  yearMin: string;
  yearMax: string;
  mileageMin: string;
  mileageMax: string;
  local: string;
  documentacao: string;
  hasIndicadores: string;
  hasPhotos: string;
}

interface AdvancedFiltersProps {
  filters: AdvancedFilterState;
  onFiltersChange: (filters: AdvancedFilterState) => void;
  onClearFilters: () => void;
  totalResults: number;
}

const localOptions: LocalType[] = [
  'Oficina', 'Funilaria', 'Polimento', 'Bailon', 'Robertão', 
  'Laudo', 'Perícia', 'Trânsito'
];

const documentacaoOptions: DocumentacaoType[] = [
  'Recepção', 'Fazendo Laudo', 'Laudo Aprovado', 'Laudo Reprovado',
  'Vistoria', 'Transferência', 'IPVA Pago', 'IPVA Atrasado',
  'Multas Pendentes', 'CRLV em Andamento', 'CRLV Entregue', 'Despacho Finalizado'
];

export const AdvancedFilters: React.FC<AdvancedFiltersProps> = ({
  filters,
  onFiltersChange,
  onClearFilters,
  totalResults
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const updateFilter = (key: keyof AdvancedFilterState, value: string) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const hasActiveFilters = Object.values(filters).some(value => value !== '');

  const getActiveFiltersCount = () => {
    return Object.values(filters).filter(value => value !== '').length;
  };

  const renderActiveFilters = () => {
    const activeFilters: string[] = [];
    
    if (filters.priceMin || filters.priceMax) {
      const min = filters.priceMin ? `R$ ${Number(filters.priceMin).toLocaleString()}` : '';
      const max = filters.priceMax ? `R$ ${Number(filters.priceMax).toLocaleString()}` : '';
      activeFilters.push(`Preço: ${min}${min && max ? ' - ' : ''}${max}`);
    }
    
    if (filters.yearMin || filters.yearMax) {
      activeFilters.push(`Ano: ${filters.yearMin}${filters.yearMin && filters.yearMax ? ' - ' : ''}${filters.yearMax}`);
    }
    
    if (filters.mileageMin || filters.mileageMax) {
      const min = filters.mileageMin ? `${Number(filters.mileageMin).toLocaleString()} km` : '';
      const max = filters.mileageMax ? `${Number(filters.mileageMax).toLocaleString()} km` : '';
      activeFilters.push(`KM: ${min}${min && max ? ' - ' : ''}${max}`);
    }
    
    if (filters.local) activeFilters.push(`Local: ${filters.local}`);
    if (filters.documentacao) activeFilters.push(`Doc: ${filters.documentacao}`);
    if (filters.hasIndicadores === 'true') activeFilters.push('Com indicadores');
    if (filters.hasPhotos === 'false') activeFilters.push('Sem fotos');

    return activeFilters;
  };

  return (
    <Card className="mb-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors mobile-compact">
            <CardTitle className="flex items-center justify-between text-sm md:text-base">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <span className="desktop-hidden">Filtros</span>
                <span className="mobile-hidden">Filtros Avançados</span>
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {getActiveFiltersCount()}
                  </Badge>
                )}
              </div>
              <div className="text-xs md:text-sm text-muted-foreground">
                {totalResults} resultado{totalResults !== 1 ? 's' : ''}
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="space-y-4 mobile-compact">
            {/* Filtros Ativos */}
            {hasActiveFilters && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs md:text-sm font-medium">Ativos:</span>
                  <div className="flex flex-wrap gap-1">
                    {renderActiveFilters().map((filter, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {filter}
                      </Badge>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearFilters}
                    className="h-6 px-2"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Limpar
                  </Button>
                </div>
              </div>
            )}

            <div className="mobile-grid-1 grid gap-4">
              {/* Faixa de Preço */}
              <div className="space-y-2">
                <Label className="text-xs md:text-sm font-medium">Preço</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Mín</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={filters.priceMin}
                      onChange={(e) => updateFilter('priceMin', e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Máx</Label>
                    <Input
                      type="number"
                      placeholder="999999"
                      value={filters.priceMax}
                      onChange={(e) => updateFilter('priceMax', e.target.value)}
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Faixa de Ano */}
              <div className="space-y-2">
                <Label className="text-xs md:text-sm font-medium">Ano</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Mín</Label>
                    <Input
                      type="number"
                      placeholder="1990"
                      value={filters.yearMin}
                      onChange={(e) => updateFilter('yearMin', e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Máx</Label>
                    <Input
                      type="number"
                      placeholder="2024"
                      value={filters.yearMax}
                      onChange={(e) => updateFilter('yearMax', e.target.value)}
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Faixa de Quilometragem */}
              <div className="space-y-2">
                <Label className="text-xs md:text-sm font-medium">KM</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Mín</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={filters.mileageMin}
                      onChange={(e) => updateFilter('mileageMin', e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Máx</Label>
                    <Input
                      type="number"
                      placeholder="500000"
                      value={filters.mileageMax}
                      onChange={(e) => updateFilter('mileageMax', e.target.value)}
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Local */}
              <div className="space-y-2">
                <Label className="text-xs md:text-sm font-medium">Local</Label>
                <Select value={filters.local} onValueChange={(value) => updateFilter('local', value)}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="bg-white z-50">
                    <SelectItem value="">Todos</SelectItem>
                    {localOptions.map((local) => (
                      <SelectItem key={local} value={local}>
                        {local}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Documentação */}
              <div className="space-y-2">
                <Label className="text-xs md:text-sm font-medium">Documentação</Label>
                <Select value={filters.documentacao} onValueChange={(value) => updateFilter('documentacao', value)}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-white z-50">
                    <SelectItem value="">Todos</SelectItem>
                    {documentacaoOptions.map((doc) => (
                      <SelectItem key={doc} value={doc}>
                        {doc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Indicadores */}
              <div className="space-y-2">
                <Label className="text-xs md:text-sm font-medium">Indicadores</Label>
                <Select value={filters.hasIndicadores} onValueChange={(value) => updateFilter('hasIndicadores', value)}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Indicadores" />
                  </SelectTrigger>
                  <SelectContent className="bg-white z-50">
                    <SelectItem value="">Todos</SelectItem>
                    <SelectItem value="true">Com indicadores</SelectItem>
                    <SelectItem value="false">Sem indicadores</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Botões de Ação */}
            {hasActiveFilters && (
              <div className="flex justify-end pt-4 border-t">
                <Button variant="outline" onClick={onClearFilters} className="touch-friendly">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Limpar Filtros
                </Button>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
