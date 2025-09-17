import React, { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useConfigurationManager } from "@/hooks/useConfigurationManager";
import type {
  ConfigurationCategory,
  ConfigurationItem,
  StoreTypeEnum,
} from "@/types/configuration";
import { useStore } from "@/contexts/StoreContext";
import {
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Warehouse,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";

const categoryLabels: Record<ConfigurationCategory, { label: string; description: string; empty: string }> = {
  features: {
    label: "Características",
    description: "Configure os equipamentos e diferenciais disponíveis para os veículos.",
    empty: "Nenhuma característica cadastrada ainda.",
  },
  models: {
    label: "Modelos",
    description: "Padronize os modelos para facilitar cadastros e filtros.",
    empty: "Nenhum modelo cadastrado ainda.",
  },
  locations: {
    label: "Locais",
    description: "Gerencie os locais físicos onde os veículos podem estar.",
    empty: "Nenhum local cadastrado ainda.",
  },
  stores: {
    label: "Lojas",
    description: "Defina as lojas ativas na plataforma e organize as operações.",
    empty: "Nenhuma loja cadastrada ainda.",
  },
};

type FormState = {
  name: string;
  value: string;
  description: string;
  store: string;
  isActive: boolean;
};

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .substring(0, 120);

export const ConfigurationManagementPanel: React.FC = () => {
  const {
    groupedItems,
    isLoading,
    error,
    addItem,
    updateItem,
    deleteItem,
    toggleItemStatus,
    isMutating,
    refetch,
  } = useConfigurationManager();
  const { refreshStores, availableStores } = useStore();

  const [activeCategory, setActiveCategory] = useState<ConfigurationCategory>("features");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ConfigurationItem | null>(null);
  const [formState, setFormState] = useState<FormState>({
    name: "",
    value: "",
    description: "",
    store: "",
    isActive: true,
  });
  const [customValue, setCustomValue] = useState(false);

  const items = groupedItems[activeCategory] ?? [];
  const highestSortOrder = useMemo(
    () => (items.length ? Math.max(...items.map((item) => item.sort_order ?? 0)) : -1),
    [items],
  );

  const resetForm = () => {
    setFormState({ name: "", value: "", description: "", store: "", isActive: true });
    setCustomValue(false);
  };

  const handleOpenCreate = () => {
    setEditingItem(null);
    resetForm();
    setIsDialogOpen(true);
  };

  const handleEdit = (item: ConfigurationItem) => {
    setEditingItem(item);
    setFormState({
      name: item.name,
      value: item.value,
      description: item.description ?? "",
      store: item.store ?? "",
      isActive: item.is_active,
    });
    setCustomValue(true);
    setIsDialogOpen(true);
  };

  const handleNameChange = (value: string) => {
    setFormState((prev) => ({ ...prev, name: value }));

    if (!customValue) {
      setFormState((prev) => ({ ...prev, value: slugify(value) }));
    }
  };

  const handleValueChange = (value: string) => {
    setCustomValue(true);
    setFormState((prev) => ({ ...prev, value }));
  };

  const handleSubmit = async () => {
    const trimmedName = formState.name.trim();
    const trimmedValue = formState.value.trim();

    if (!trimmedName) {
      toast.error("Informe um nome para a configuração");
      return;
    }

    if (!trimmedValue) {
      toast.error("Informe um valor identificador");
      return;
    }

    const payload = {
      category: activeCategory,
      name: trimmedName,
      value: trimmedValue,
      description: formState.description.trim() ? formState.description.trim() : null,
      store: formState.store ? (formState.store as StoreTypeEnum) : null,
      is_active: formState.isActive,
      sort_order: editingItem ? editingItem.sort_order : highestSortOrder + 1,
    };

    try {
      if (editingItem) {
        const { category, ...updates } = payload;
        await updateItem({ id: editingItem.id, updates });
      } else {
        await addItem(payload);
      }

      if (activeCategory === "stores") {
        await refetch();
        await refreshStores();
      } else if (payload.store) {
        await refreshStores();
      }

      setIsDialogOpen(false);
      resetForm();
    } catch (mutationError) {
      console.error(mutationError);
    }
  };

  const handleDelete = async (item: ConfigurationItem) => {
    try {
      await deleteItem({ id: item.id });
      if (item.category === "stores") {
        await refetch();
        await refreshStores();
      }
    } catch (mutationError) {
      console.error(mutationError);
    }
  };

  const currentCategoryInfo = categoryLabels[activeCategory];

  return (
    <Card className="border-0 shadow-lg bg-white/80 dark:bg-slate-900/50">
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Sistema de Configurações
          </CardTitle>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Administre os valores padrão utilizados em todo o sistema.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button onClick={handleOpenCreate} disabled={isMutating}>
            <Plus className="h-4 w-4 mr-2" /> Nova entrada
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs value={activeCategory} onValueChange={(value) => setActiveCategory(value as ConfigurationCategory)}>
          <TabsList className="grid grid-cols-2 md:grid-cols-4">
            {Object.entries(categoryLabels).map(([key, meta]) => (
              <TabsTrigger key={key} value={key} className="text-sm">
                {meta.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {Object.entries(categoryLabels).map(([key, meta]) => {
            const categoryKey = key as ConfigurationCategory;
            const categoryItems = groupedItems[categoryKey] ?? [];
            return (
              <TabsContent key={key} value={key} className="mt-4 space-y-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{meta.label}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{meta.description}</p>
                  </div>
                  <Badge variant="secondary" className="bg-slate-100 dark:bg-slate-800">
                    {categoryItems.length} item{categoryItems.length === 1 ? "" : "s"}
                  </Badge>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      Ocorreu um erro ao carregar as configurações. Tente novamente.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-slate-800/60">
                        <TableHead>Nome</TableHead>
                        <TableHead>Valor</TableHead>
                        {categoryKey !== "stores" && <TableHead>Loja</TableHead>}
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden md:table-cell">Atualizado em</TableHead>
                        <TableHead className="w-[120px] text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow>
                          <TableCell colSpan={categoryKey === "stores" ? 5 : 6} className="py-8 text-center">
                            <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                              <Loader2 className="h-4 w-4 animate-spin" /> Carregando configurações...
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : categoryItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={categoryKey === "stores" ? 5 : 6} className="text-center text-sm py-8">
                            {meta.empty}
                          </TableCell>
                        </TableRow>
                      ) : (
                        categoryItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {categoryKey === "stores" && <Warehouse className="h-4 w-4 text-slate-500" />}
                                <span>{item.name}</span>
                                {!item.is_active && (
                                  <Badge variant="outline" className="text-xs">Inativo</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                                {item.value}
                              </code>
                            </TableCell>
                            {categoryKey !== "stores" && (
                              <TableCell>
                                {item.store ? (
                                  <Badge variant="outline" className="text-xs">
                                    {item.store}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-slate-500">Todas as lojas</span>
                                )}
                              </TableCell>
                            )}
                            <TableCell>
                              <Switch
                                checked={item.is_active}
                                onCheckedChange={(checked) => {
                                  void toggleItemStatus(item.id, checked);
                                }}
                                disabled={isMutating}
                              />
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-xs text-slate-500">
                              {new Date(item.updated_at).toLocaleString("pt-BR")}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => handleEdit(item)}
                                  disabled={isMutating}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="icon"
                                  onClick={() => handleDelete(item)}
                                  disabled={isMutating}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingItem(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Editar configuração" : "Nova configuração"} - {currentCategoryInfo.label}
            </DialogTitle>
            <DialogDescription>
              Preencha os dados abaixo para {editingItem ? "atualizar" : "criar"} a configuração.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="configuration-name">Nome</Label>
              <Input
                id="configuration-name"
                value={formState.name}
                onChange={(event) => handleNameChange(event.target.value)}
                placeholder="Ex: Ar-condicionado"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="configuration-value">Identificador</Label>
              <Input
                id="configuration-value"
                value={formState.value}
                onChange={(event) => handleValueChange(event.target.value)}
                placeholder="Ex: ar_condicionado"
              />
            </div>

            {activeCategory !== "stores" && (
              <div className="space-y-2">
                <Label>Loja</Label>
                <Select
                  value={formState.store}
                  onValueChange={(value) => setFormState((prev) => ({ ...prev, store: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as lojas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas as lojas</SelectItem>
                    {availableStores.map((store) => (
                      <SelectItem key={store} value={store}>
                        {store}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="configuration-description">Descrição</Label>
              <Textarea
                id="configuration-description"
                value={formState.description}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, description: event.target.value }))
                }
                rows={3}
                placeholder="Adicione um contexto ou observação"
              />
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Item ativo</p>
                <p className="text-xs text-slate-500">
                  Desative para ocultar temporariamente esta configuração.
                </p>
              </div>
              <Switch
                checked={formState.isActive}
                onCheckedChange={(checked) => setFormState((prev) => ({ ...prev, isActive: checked }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isMutating}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isMutating}>
              {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default ConfigurationManagementPanel;
