
import React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const RestrictedAccess: React.FC = () => {
  const navigate = useNavigate();
  
  return (
    <div className="content-container py-6">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>Acesso Restrito</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center">Somente Gerentes e Administradores podem adicionar veículos.</p>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button onClick={() => navigate('/inventory')}>
            Voltar para o Estoque
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
