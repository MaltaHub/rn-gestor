
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Eye, Zap, Users } from "lucide-react";
import { usePendingWorkflow } from "@/hooks/usePendingWorkflow";
import { toast } from "@/components/ui/sonner";

interface QuickActionsProps {
  selectedItems: string[];
  onRefresh: () => void;
}

const QuickActions: React.FC<QuickActionsProps> = ({ selectedItems, onRefresh }) => {
  const { isExecuting, markAdvertisementPublished, resolveInsight } = usePendingWorkflow();

  const handleBulkAction = async (action: string) => {
    if (selectedItems.length === 0) {
      toast.error('Selecione pelo menos um item para executar ações em lote');
      return;
    }

    console.log(`Executando ação em lote: ${action} para itens:`, selectedItems);
    
    // Aqui implementaremos as ações em lote específicas
    try {
      for (const itemId of selectedItems) {
        if (action === 'resolve_insights') {
          await resolveInsight(itemId);
        } else if (action === 'mark_published') {
          await markAdvertisementPublished(itemId);
        }
      }
      
      toast.success(`${selectedItems.length} itens processados com sucesso!`);
      onRefresh();
    } catch (error) {
      console.error('Erro na ação em lote:', error);
      toast.error('Erro ao processar ações em lote');
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Centro de Ações Rápidas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <Button 
            variant="outline" 
            onClick={() => handleBulkAction('resolve_insights')}
            disabled={isExecuting || selectedItems.length === 0}
            className="flex items-center gap-2"
          >
            <CheckCircle className="h-4 w-4" />
            Resolver Insights
          </Button>

          <Button 
            variant="outline" 
            onClick={() => handleBulkAction('mark_published')}
            disabled={isExecuting || selectedItems.length === 0}
            className="flex items-center gap-2"
          >
            <Eye className="h-4 w-4" />
            Marcar Publicado
          </Button>

          <Button 
            variant="outline" 
            onClick={() => handleBulkAction('assign_tasks')}
            disabled={isExecuting || selectedItems.length === 0}
            className="flex items-center gap-2"
          >
            <Users className="h-4 w-4" />
            Atribuir Tarefas
          </Button>

          <Button 
            variant="outline" 
            onClick={onRefresh}
            className="flex items-center gap-2"
          >
            <Zap className="h-4 w-4" />
            Atualizar Dados
          </Button>
        </div>

        {selectedItems.length > 0 && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              {selectedItems.length} {selectedItems.length === 1 ? 'item selecionado' : 'itens selecionados'} 
              para ações em lote
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default QuickActions;
