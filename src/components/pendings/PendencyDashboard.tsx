
import React from 'react';
import { ProductivityDashboard } from './ProductivityDashboard';
import { SmartActionsList } from './SmartActionsList';
import { useTaskAutomation } from '@/hooks/useTaskAutomation';
import { useVehiclePendencies } from '@/hooks/useVehiclePendencies';
import { useConsolidatedTasks } from '@/hooks/useConsolidatedTasks';

const PendencyDashboard: React.FC = () => {
  // Sincronização única ao inicializar (não mais loop infinito)
  const { isAutoSyncing } = useTaskAutomation();
  const { stats } = useVehiclePendencies();
  const { data: tasks = [] } = useConsolidatedTasks();
  const pendingTasks = tasks.filter(t => t.status === 'pending');

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
            <p className="text-sm text-muted-foreground mt-1">
              Pendências: {stats.total} | Tarefas pendentes: {pendingTasks.length}
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
