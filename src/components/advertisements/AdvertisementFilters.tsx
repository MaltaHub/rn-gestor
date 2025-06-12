
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter } from 'lucide-react';
import { PlatformType } from '@/types/store';

interface AdvertisementFiltersProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  platformFilter: string;
  onPlatformChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  platforms: PlatformType[];
}

export const AdvertisementFilters: React.FC<AdvertisementFiltersProps> = ({
  searchTerm,
  onSearchChange,
  platformFilter,
  onPlatformChange,
  statusFilter,
  onStatusChange,
  platforms
}) => {
  return (
    <Card className="mb-6">
      <CardHeader className="mobile-compact">
        <CardTitle className="flex items-center text-sm md:text-base">
          <Filter className="w-4 md:w-5 h-4 md:h-5 mr-2" />
          Filtros
        </CardTitle>
      </CardHeader>
      <CardContent className="mobile-compact">
        <div className="mobile-grid-1 grid gap-3 md:gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Buscar por ID âncora ou placa..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 touch-friendly"
            />
          </div>
          <Select value={platformFilter} onValueChange={onPlatformChange}>
            <SelectTrigger className="touch-friendly">
              <SelectValue placeholder="Plataforma" />
            </SelectTrigger>
            <SelectContent className="bg-white z-50">
              <SelectItem value="all">Todas as plataformas</SelectItem>
              {platforms.map(platform => (
                <SelectItem key={platform} value={platform}>
                  {platform}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={onStatusChange}>
            <SelectTrigger className="touch-friendly">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-white z-50">
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="published">Publicados</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
};
