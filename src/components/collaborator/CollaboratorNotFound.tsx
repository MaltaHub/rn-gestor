
import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const CollaboratorNotFound: React.FC = () => {
  const navigate = useNavigate();
  
  return (
    <div className="content-container py-6">
      <Card>
        <CardContent className="py-8 text-center">
          <h2 className="text-xl font-bold">Colaborador não encontrado</h2>
          <p className="text-vehicleApp-mediumGray mt-2">
            O colaborador solicitado não foi encontrado ou não existe.
          </p>
          <Button 
            variant="link" 
            onClick={() => navigate('/collaborators')}
            className="mt-4"
          >
            Voltar para Lista de Colaboradores
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
