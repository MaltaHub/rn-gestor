
import React from 'react';
import { ProductivityDashboard } from './ProductivityDashboard';
import PendingMetrics from './PendingMetrics';
import PendingCharts from './PendingCharts';
import { SmartActionsList } from './SmartActionsList';
import SmartInsights from './SmartInsights';
import { SystemMaintenanceCard } from '@/components/system/SystemMaintenanceCard';
import { useTaskAutomation } from '@/hooks/useTaskAutomation';
import { useIsMobile } from '@/hooks/use-mobile';

const PendencyDashboard: React.FC = () => {
  const { isAutoSyncing } = useTaskAutomation();
  const isMobile = useIsMobile();

  return (
    <div className="content-container py-3 md:py-6">
      <div className="floating-box">
        <div className="mobile-card border-b">
          <div>
            <h1 className="mobile-header">Pendências</h1>
            <p className="text-muted-foreground text-sm md:text-base">
              {isMobile ? 'Tarefas e ações' : 'Sistema inteligente com detecção automática e workflows otimizados'}
              {isAutoSyncing && ' (Sincronizando...)'}
            </p>
          </div>
        </div>

        <div className="mobile-card mobile-spacing">
          {/* Sistema de Manutenção - Sempre Visível */}
          <SystemMaintenanceCard />
          
          {/* Métricas - Ocultas em Mobile */}
          {!isMobile && (
            <>
              <ProductivityDashboard />
              <PendingMetrics />
              <PendingCharts />
            </>
          )}
          
          {/* Funcionalidade Principal - Sempre Visível */}
          <SmartActionsList />
          
          {/* Insights - Ocultos em Mobile */}
          {!isMobile && (
            <SmartInsights insights={[]} onActionClick={() => {}} />
          )}
        </div>
      </div>
    </div>
  );
};

export default PendencyDashboard;
