
import React from 'react';
import { ProductivityDashboard } from './ProductivityDashboard';
import PendingMetrics from './PendingMetrics';
import PendingCharts from './PendingCharts';
import { SmartActionsList } from './SmartActionsList';
import SmartInsights from './SmartInsights';
import { useTaskAutomation } from '@/hooks/useTaskAutomation';

const PendencyDashboard: React.FC = () => {
  // Sincronização única ao inicializar (não mais loop infinito)
  const { isAutoSyncing } = useTaskAutomation();

  return (
    <div className="content-container py-6">
      <div className="floating-box">
        <div className="p-6 border-b">
          <div>
            <h1 className="text-2xl font-bold">Sistema de Pendências e Tarefas</h1>
            <p className="text-muted-foreground">
              Sistema inteligente com detecção automática e workflows otimizados
              {isAutoSyncing && ' (Sincronizando...)'}
            </p>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <ProductivityDashboard />
          <PendingMetrics />
          <PendingCharts />
          <SmartActionsList />
          <SmartInsights insights={[]} onActionClick={() => {}} />
        </div>
      </div>
    </div>
  );
};

export default PendencyDashboard;
