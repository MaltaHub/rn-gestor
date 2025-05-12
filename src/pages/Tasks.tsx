
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTasksData } from "@/hooks/useTasksData";
import { Loader2, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Task } from "@/types/tasks";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TasksPage: React.FC = () => {
  const { pendingTasks, completedTasks, isLoading, completeTask, isCompletingTask } = useTasksData();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Formatar a data relativa
  const formatRelativeDate = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), {
        addSuffix: true,
        locale: ptBR
      });
    } catch (error) {
      return "Data inválida";
    }
  };

  // Obter ícone para o campo relacionado
  const getFieldIcon = (fieldName: string | null) => {
    switch (fieldName) {
      case 'price': return <span className="text-green-500">R$</span>;
      case 'mileage': return <span className="text-blue-500">km</span>;
      case 'status': return <span className="text-purple-500">⚡</span>;
      case 'plate': return <span className="text-amber-500">🚗</span>;
      case 'model': return <span className="text-indigo-500">🏷️</span>;
      case 'color': return <span className="text-pink-500">🎨</span>;
      case 'new_vehicle': return <span className="text-emerald-500">✨</span>;
      default: return <span className="text-gray-500">📝</span>;
    }
  };

  // Renderizar linha da tabela de tarefas
  const renderTaskRow = (task: Task) => (
    <TableRow key={task.id}>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {getFieldIcon(task.related_field)}
          <span>{task.title}</span>
        </div>
      </TableCell>
      <TableCell>
        {task.vehicles ? (
          <Badge variant="outline">{task.vehicles.model} - {task.vehicles.plate}</Badge>
        ) : "N/A"}
      </TableCell>
      <TableCell>
        {task.is_completed ? (
          <span className="flex items-center text-green-600 text-sm">
            <CheckCircle className="h-4 w-4 mr-1" />
            Concluída
          </span>
        ) : (
          <span className="flex items-center text-amber-600 text-sm">
            <Clock className="h-4 w-4 mr-1" />
            Pendente
          </span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{formatRelativeDate(task.created_at)}</TableCell>
      <TableCell className="text-right">
        <Drawer>
          <DrawerTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setSelectedTask(task)}
            >
              Detalhes
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            {selectedTask && (
              <>
                <DrawerHeader>
                  <DrawerTitle>{selectedTask.title}</DrawerTitle>
                  <DrawerDescription>
                    {selectedTask.vehicles ? `${selectedTask.vehicles.model} - ${selectedTask.vehicles.plate}` : "Veículo não encontrado"}
                  </DrawerDescription>
                </DrawerHeader>
                <div className="px-4 py-2">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold mb-1">Descrição:</h4>
                    <p className="text-sm">{selectedTask.description}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Criada:</span>
                      <span>{formatRelativeDate(selectedTask.created_at)}</span>
                    </div>
                    {selectedTask.is_completed && selectedTask.completed_at && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Concluída:</span>
                        <span>{formatRelativeDate(selectedTask.completed_at)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <DrawerFooter>
                  {!selectedTask.is_completed && (
                    <Button 
                      onClick={() => completeTask(selectedTask.id)} 
                      disabled={isCompletingTask}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {isCompletingTask ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processando...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Marcar como concluída
                        </>
                      )}
                    </Button>
                  )}
                  <DrawerClose asChild>
                    <Button variant="outline">Fechar</Button>
                  </DrawerClose>
                </DrawerFooter>
              </>
            )}
          </DrawerContent>
        </Drawer>
      </TableCell>
    </TableRow>
  );

  if (isLoading) {
    return (
      <div className="content-container py-6 flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-vehicleApp-red" />
      </div>
    );
  }

  return (
    <div className="content-container py-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Tarefas</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending">
            <TabsList className="mb-6">
              <TabsTrigger value="pending">Pendentes ({pendingTasks.length})</TabsTrigger>
              <TabsTrigger value="completed">Concluídas ({completedTasks.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="pending">
              {pendingTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <CheckCircle className="h-12 w-12" />
                  <h3 className="text-lg font-medium">Não há tarefas pendentes</h3>
                  <p>Todas as tarefas foram concluídas!</p>
                </div>
              ) : (
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tarefa</TableHead>
                        <TableHead>Veículo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Criada</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingTasks.map(renderTaskRow)}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="completed">
              {completedTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
                  <AlertCircle className="h-12 w-12" />
                  <h3 className="text-lg font-medium">Nenhuma tarefa concluída</h3>
                  <p>As tarefas concluídas aparecerão aqui</p>
                </div>
              ) : (
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tarefa</TableHead>
                        <TableHead>Veículo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Criada</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {completedTasks.map(renderTaskRow)}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default TasksPage;
