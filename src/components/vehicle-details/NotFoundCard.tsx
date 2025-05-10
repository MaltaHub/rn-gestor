
import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const NotFoundCard: React.FC = () => {
  const navigate = useNavigate();
  
  return (
    <div className="content-container py-6">
      <Card>
        <CardContent className="py-10">
          <div className="text-center">
            <h2 className="text-xl font-semibold">Veículo não encontrado</h2>
            <p className="mt-2 text-gray-500">O veículo solicitado não está disponível.</p>
            <Button className="mt-4" onClick={() => navigate('/inventory')}>
              Voltar para Estoque
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
