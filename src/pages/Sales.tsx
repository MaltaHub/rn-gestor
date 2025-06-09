
import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SalesFilters } from "@/components/sales/SalesFilters";
import { useSales } from "@/hooks/useSales";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Download, Eye } from 'lucide-react';

const SalesPage: React.FC = () => {
  const { sales, isLoading } = useSales();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [filters, setFilters] = useState({
    vendedor: '',
    periodo: '',
    status: '',
    cpf: '',
    placa: ''
  });

  // Buscar lista de vendedores para filtro
  const { data: vendedores = [] } = useQuery({
    queryKey: ['vendedores-sales'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, name')
        .eq('role', 'Consultor')
        .order('name');
      
      if (error) throw error;
      return data || [];
    }
  });

  // Função para filtrar vendas baseado nos critérios
  const filteredSales = useMemo(() => {
    if (!sales) return [];

    return sales.filter((sale: any) => {
      // Filtro por CPF
      if (filters.cpf && !sale.cpf_cliente.includes(filters.cpf)) {
        return false;
      }

      // Filtro por placa
      if (filters.placa && !sale.vehicles?.plate?.toLowerCase().includes(filters.placa.toLowerCase())) {
        return false;
      }

      // Filtro por vendedor
      if (filters.vendedor && sale.vendido_por !== filters.vendedor) {
        return false;
      }

      // Filtro por status
      if (filters.status) {
        if (filters.status === 'pendente' && !sale.aprovacao_reducao) return false;
        if (filters.status === 'aprovada' && sale.aprovacao_reducao) return false;
        // Para 'finalizada', assumimos que são vendas sem necessidade de aprovação
      }

      // Filtro por período
      if (filters.periodo) {
        const saleDate = new Date(sale.data_venda);
        const now = new Date();
        
        switch (filters.periodo) {
          case 'hoje':
            if (saleDate < startOfDay(now) || saleDate > endOfDay(now)) return false;
            break;
          case 'semana':
            if (saleDate < startOfWeek(now) || saleDate > endOfWeek(now)) return false;
            break;
          case 'mes':
            if (saleDate < startOfMonth(now) || saleDate > endOfMonth(now)) return false;
            break;
          case 'trimestre':
            if (saleDate < startOfQuarter(now) || saleDate > endOfQuarter(now)) return false;
            break;
        }
      }

      return true;
    });
  }, [sales, filters]);

  // Paginação
  const totalPages = Math.ceil(filteredSales.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedSales = filteredSales.slice(startIndex, startIndex + itemsPerPage);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1); // Reset to first page when filtering
  };

  const handleClearFilters = () => {
    setFilters({
      vendedor: '',
      periodo: '',
      status: '',
      cpf: '',
      placa: ''
    });
    setCurrentPage(1);
  };

  const handleExport = () => {
    // TODO: Implementar exportação
    console.log('Exportando vendas...', filteredSales);
  };

  const getStatusBadge = (sale: any) => {
    if (sale.aprovacao_reducao) {
      return <Badge variant="destructive">Aguard. Aprovação</Badge>;
    }
    return <Badge variant="default">Aprovada</Badge>;
  };

  if (isLoading) {
    return (
      <div className="content-container py-6">
        <div className="text-center">
          <p>Carregando vendas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-container py-6">
      <div className="floating-box">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Vendas Realizadas</h1>
            <p className="text-gray-500 mt-1">
              {filteredSales.length} venda{filteredSales.length !== 1 ? 's' : ''} encontrada{filteredSales.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport} className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              Exportar
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <SalesFilters
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
          vendedores={vendedores}
        />

        {/* Tabela */}
        <Card>
          <CardContent className="p-0">
            {filteredSales.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {sales?.length === 0 ? 'Nenhuma venda registrada ainda.' : 'Nenhuma venda encontrada com os filtros aplicados.'}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Veículo</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Forma Pagto</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Entrada</TableHead>
                        <TableHead>Parcelas</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedSales.map((sale: any) => (
                        <TableRow key={sale.id}>
                          <TableCell>
                            {format(new Date(sale.data_venda), 'dd/MM/yyyy', { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{sale.vehicles?.model || 'N/A'}</div>
                              <div className="text-sm text-gray-500">{sale.vehicles?.plate || 'N/A'}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-mono text-sm">{sale.cpf_cliente}</div>
                          </TableCell>
                          <TableCell>{sale.forma_pagamento}</TableCell>
                          <TableCell className="font-bold text-green-600">
                            {new Intl.NumberFormat('pt-BR', {
                              style: 'currency',
                              currency: 'BRL'
                            }).format(sale.valor_venda)}
                          </TableCell>
                          <TableCell>
                            {sale.entrada > 0 && new Intl.NumberFormat('pt-BR', {
                              style: 'currency',
                              currency: 'BRL'
                            }).format(sale.entrada)}
                          </TableCell>
                          <TableCell>
                            {sale.parcelas > 0 && `${sale.parcelas}x`}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {getStatusBadge(sale)}
                              {sale.seguro && (
                                <Badge variant="secondary" className="text-xs">Seguro</Badge>
                              )}
                              {sale.carro_troca && (
                                <Badge variant="outline" className="text-xs">Troca</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              Ver
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Paginação */}
                <div className="flex items-center justify-between p-4 border-t">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Itens por página:</span>
                    <Select value={itemsPerPage.toString()} onValueChange={(value) => {
                      setItemsPerPage(Number(value));
                      setCurrentPage(1);
                    }}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">
                      Página {currentPage} de {totalPages} ({filteredSales.length} vendas)
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SalesPage;
