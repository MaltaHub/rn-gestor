
import React from 'react';
import { ProductivityDashboard } from './ProductivityDashboard';
import { SmartActionsList } from './SmartActionsList';
import { useTaskAutomation } from '@/hooks/useTaskAutomation';

const PendencyDashboard: React.FC = () => {
  // Ativar automação de tarefas
  useTaskAutomation();

  return (
    <div className="content-container py-6">
      <div className="floating-box">
        <div className="p-6 border-b">
          <div>
            <h1 className="text-2xl font-bold">Sistema de Pendências e Tarefas</h1>
            <p className="text-muted-foreground">
              Sistema inteligente com detecção automática e workflows otimizados
            </p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <ProductivityDashboard />
          <SmartActionsList />
        </div>
      </div>
    </div>
  );
};

export default PendencyDashboard;
