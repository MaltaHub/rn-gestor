
import React from 'react';
import { ShieldAlert } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle
} from "@/components/ui/alert";

const ManagerAlert: React.FC = () => {
  return (
    <Alert className="mb-6">
      <ShieldAlert className="h-4 w-4" />
      <AlertTitle>Visualização Limitada</AlertTitle>
      <AlertDescription>
        Como Gerente, você pode apenas visualizar as permissões, mas não pode modificá-las.
      </AlertDescription>
    </Alert>
  );
};

export default ManagerAlert;
