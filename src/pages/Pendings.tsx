import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Task } from "@/types";

const PendingsPage: React.FC = () => {
  const navigate = useNavigate();
  // Busca tasks e insights, já trazendo dados do veículo relacionado
  const { data: tasks, isLoading: isLoadingTasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, vehicles:vehicle_id(id, plate, model, image_url)")
        .eq("completed", false)
        .order("prioridade", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: insights, isLoading: isLoadingInsights } = useQuery({
    queryKey: ["advertisement_insights"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("advertisement_insights")
        .select("*, vehicles:vehicle_id(id, plate, model, image_url)")
        .eq("resolved", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Contagem de pendências
  const totalPendings = (tasks?.length || 0) + (insights?.length || 0);

  return (
    <div className="content-container py-6 space-y-6">
      <h2 className="text-2xl font-bold mb-4">Pendências Totais: {totalPendings}</h2>
      {/* Task Locker Section */}
      <Card>
        <CardHeader>
          <CardTitle>Task Locker ({tasks?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingTasks ? (
            <p>Carregando tarefas...</p>
          ) : tasks && tasks.length > 0 ? (
            <ul className="space-y-2">
              {tasks.map((task: any) => (
                <li key={task.id} className="flex items-center gap-2 p-2 border rounded hover:bg-gray-50 cursor-pointer" onClick={() => task.vehicle_id && navigate(`/vehicle/${task.vehicle_id}`)}>
                  <span className="font-semibold">{task.title}</span>
                  {task.vehicles?.plate && (
                    <span className="ml-2 text-xs bg-gray-200 rounded px-2 py-0.5">Placa: {task.vehicles.plate}</span>
                  )}
                  <span className="ml-auto text-xs text-gray-500">Prioridade: {task.prioridade}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhuma tarefa pendente no momento.</p>
          )}
        </CardContent>
      </Card>

      {/* Advertisement Insights Section */}
      <Card>
        <CardHeader>
          <CardTitle>Pendings de Anúncios ({insights?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingInsights ? (
            <p>Carregando pendências de anúncios...</p>
          ) : insights && insights.length > 0 ? (
            <ul className="space-y-2">
              {insights.map((insight: any) => (
                <li key={insight.id} className="flex items-center gap-2 p-2 border rounded hover:bg-gray-50 cursor-pointer" onClick={() => insight.vehicles?.id && navigate(`/vehicle/${insight.vehicles.id}`)}>
                  <span className="font-semibold">{insight.insight_type}</span>
                  {insight.vehicles?.plate && (
                    <span className="ml-2 text-xs bg-gray-200 rounded px-2 py-0.5">Placa: {insight.vehicles.plate}</span>
                  )}
                  <span className="ml-auto text-xs text-gray-500">{insight.description || "Sem descrição"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Nenhuma pendência de anúncio no momento.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PendingsPage;
