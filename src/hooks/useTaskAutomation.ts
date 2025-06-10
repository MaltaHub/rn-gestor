
import { useEffect, useRef } from 'react';
import { useRealTaskManager } from './useRealTaskManager';

export const useTaskAutomation = () => {
  const { syncTasks } = useRealTaskManager();
  const hasInitializedRef = useRef(false);

  // Sincronização única quando o hook é inicializado
  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      console.log('Initializing task synchronization...');
      syncTasks.mutate();
    }
  }, []);

  return {
    isAutoSyncing: syncTasks.isPending
  };
};
