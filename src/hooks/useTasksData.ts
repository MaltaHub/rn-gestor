
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Task } from "@/types/tasks";

export const useTasksData = () => {
  const queryClient = useQueryClient();

  // Buscar tarefas
  const {
    data: tasks = [],
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['tasks'],
    queryFn: async (): Promise<Task[]> => {
      try {
        const { data, error } = await supabase.functions.invoke<{ tasks: Task[] }>("gerenciar-tarefas");
        
        if (error) {
          console.error('Erro ao buscar tarefas:', error);
          toast.error('Falha ao buscar tarefas');
          return [];
        }
        
        if (!data || !data.tasks) {
          return [];
        }
        
        return data.tasks;
      } catch (err) {
        console.error('Erro ao buscar tarefas:', err);
        toast.error('Não foi possível carregar a lista de tarefas');
        return [];
      }
    }
  });

  // Completar tarefas
  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { data, error } = await supabase.functions.invoke<{ task: Task }>("gerenciar-tarefas/complete", {
        method: "PUT",
        body: { taskId }
      });
      
      if (error) {
        console.error('Erro ao completar tarefa:', error);
        throw new Error('Falha ao completar tarefa');
      }
      
      return data?.task;
    },
    onSuccess: () => {
      toast.success("Tarefa marcada como concluída!");
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error) => {
      console.error('Erro ao completar tarefa:', error);
      toast.error('Não foi possível completar a tarefa');
    }
  });

  // Filtrar tarefas
  const pendingTasks = tasks.filter(task => !task.is_completed);
  const completedTasks = tasks.filter(task => task.is_completed);

  return {
    tasks,
    pendingTasks,
    completedTasks,
    isLoading,
    error,
    refetch,
    completeTask: completeTaskMutation.mutate,
    isCompletingTask: completeTaskMutation.isPending
  };
};
