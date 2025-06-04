
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useSales } from "@/hooks/useSales";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const SalesPage: React.FC = () => {
  const { sales, isLoading } = useSales();

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
        <Card>
          <CardHeader>
            <CardTitle>Vendas Realizadas</CardTitle>
          </CardHeader>
          <CardContent>
            {sales.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Nenhuma venda registrada ainda.
              </div>
            ) : (
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.map((sale: any) => (
                      <TableRow key={sale.id}>
                        <TableCell>
                          {format(new Date(sale.data_venda), 'dd/MM/yyyy', { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{sale.vehicles.model}</div>
                            <div className="text-sm text-gray-500">{sale.vehicles.plate}</div>
                          </div>
                        </TableCell>
                        <TableCell>{sale.cpf_cliente}</TableCell>
                        <TableCell>{sale.forma_pagamento}</TableCell>
                        <TableCell className="font-bold text-green-600">
                          R$ {Number(sale.valor_venda).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {sale.entrada > 0 && `R$ ${Number(sale.entrada).toLocaleString()}`}
                        </TableCell>
                        <TableCell>
                          {sale.parcelas > 0 && `${sale.parcelas}x`}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {sale.aprovacao_reducao && (
                              <Badge variant="destructive">Aguard. Aprovação</Badge>
                            )}
                            {sale.seguro && (
                              <Badge variant="secondary">Com Seguro</Badge>
                            )}
                            {sale.carro_troca && (
                              <Badge variant="outline">Com Troca</Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SalesPage;
