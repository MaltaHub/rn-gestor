
import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const AccessRestrictedCard: React.FC = () => {
  return (
    <div className="flex h-full items-center justify-center">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Acesso Restrito</CardTitle>
          <CardDescription>
            Você não tem permissão para gerenciar cargos e permissões.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p>Esta área é restrita para administradores e gerentes do sistema.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AccessRestrictedCard;
