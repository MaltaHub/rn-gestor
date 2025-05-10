
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { usePermission } from "@/contexts/PermissionContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

// Schema para validação do formulário
const profileSchema = z.object({
  name: z.string().min(3, { message: "Nome deve ter pelo menos 3 caracteres" }),
  birthdate: z.string().refine((date) => {
    try {
      const parsed = new Date(date);
      return !isNaN(parsed.getTime());
    } catch {
      return false;
    }
  }, { message: "Data inválida" })
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const ProfilePage: React.FC = () => {
  const { user, logout } = useAuth();
  const { userRole, isLoading, completeUserProfile, profileExists } = usePermission();
  const [name, setName] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [birthdate, setBirthdate] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompletingProfile, setIsCompletingProfile] = useState(false);
  const navigate = useNavigate();

  // Configurar o formulário com react-hook-form e zod
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      birthdate: ""
    }
  });

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;

      try {
        console.log("Buscando perfil para o usuário ID:", user.id);
        const { data, error } = await supabase
          .from('user_profiles')
          .select('name, role, birthdate')
          .eq('id', user.id)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          console.error('Erro ao buscar perfil:', error);
          toast.error('Erro ao carregar informações de perfil');
          return;
        }

        if (data) {
          console.log("Dados do perfil encontrados:", data);
          setName(data.name || "");
          setRole(data.role);
          setBirthdate(data.birthdate || "");
          
          // Atualizar valores do formulário
          form.reset({
            name: data.name || "",
            birthdate: data.birthdate || ""
          });
        } else {
          // Perfil não existe
          console.log("Perfil não encontrado, usando dados do usuário");
          setName(user.name || user.email?.split('@')[0] || "");
          setRole("Vendedor");
          
          // Atualizar valores do formulário
          form.reset({
            name: user.name || user.email?.split('@')[0] || "",
            birthdate: ""
          });
        }
      } catch (err) {
        console.error('Erro ao buscar perfil:', err);
        toast.error('Erro ao carregar informações de perfil');
      }
    };

    fetchProfile();
  }, [user, form]);

  const handleCompleteProfile = async (values: ProfileFormValues) => {
    if (!user) return;
    
    setIsCompletingProfile(true);
    try {
      console.log("Tentando completar perfil com:", values);
      // Obter o usuário atual novamente para ter certeza de que estamos com dados atualizados
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        throw new Error("Usuário não autenticado");
      }
      
      const success = await completeUserProfile(values.name, values.birthdate);
      if (success) {
        // Atualizar estado local
        setName(values.name);
        setBirthdate(values.birthdate);
        navigate("/inventory"); // Redirecionar para a página principal após completar o perfil
      }
    } catch (error) {
      console.error("Erro ao completar perfil:", error);
      toast.error("Erro ao completar perfil");
    } finally {
      setIsCompletingProfile(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      // Obter o usuário atual novamente para ter certeza de que estamos com dados atualizados
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        throw new Error("Usuário não autenticado");
      }
      
      const { error } = await supabase
        .from('user_profiles')
        .update({ name, birthdate })
        .eq('id', authData.user.id);

      if (error) {
        console.error('Erro ao atualizar perfil:', error);
        toast.error('Erro ao atualizar perfil');
        return;
      }

      toast.success('Perfil atualizado com sucesso');
      setIsEditing(false);
    } catch (err) {
      console.error('Erro ao atualizar perfil:', err);
      toast.error('Erro ao atualizar perfil');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-10 w-10 animate-spin text-vehicleApp-red" />
      </div>
    );
  }

  return (
    <div className="content-container py-6">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>{profileExists ? "Perfil do Usuário" : "Complete seu Perfil"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!profileExists ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleCompleteProfile)} className="space-y-4">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-md">
                  <p className="text-amber-800">
                    Para continuar, precisamos que você complete seu perfil com algumas informações básicas.
                  </p>
                </div>
                
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Completo</FormLabel>
                      <FormControl>
                        <Input placeholder="Seu nome completo" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="birthdate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data de Nascimento</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <Button 
                  type="submit"
                  className="w-full bg-vehicleApp-red hover:bg-red-600"
                  disabled={isCompletingProfile}
                >
                  {isCompletingProfile ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Completando perfil...</>
                  ) : (
                    'Completar Perfil'
                  )}
                </Button>
              </form>
            </Form>
          ) : (
            <>
              <div className="space-y-3">
                <Label htmlFor="name">Nome Completo</Label>
                {isEditing ? (
                  <Input 
                    id="name" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    placeholder="Seu nome completo"
                  />
                ) : (
                  <Input id="name" value={name} readOnly />
                )}
              </div>
              
              <div className="space-y-3">
                <Label htmlFor="birthdate">Data de Nascimento</Label>
                {isEditing ? (
                  <Input 
                    id="birthdate"
                    type="date" 
                    value={birthdate} 
                    onChange={(e) => setBirthdate(e.target.value)}
                  />
                ) : (
                  <Input 
                    id="birthdate" 
                    value={birthdate ? new Date(birthdate).toISOString().split('T')[0] : ""} 
                    readOnly 
                  />
                )}
              </div>
              
              <div className="space-y-3">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" value={user?.email || ""} readOnly />
              </div>
              
              <div className="space-y-3">
                <Label htmlFor="role">Função</Label>
                <Select disabled value={role || undefined}>
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Selecione uma função" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Vendedor">Vendedor</SelectItem>
                    <SelectItem value="Gerente">Gerente</SelectItem>
                    <SelectItem value="Administrador">Administrador</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  Somente administradores podem alterar funções de usuários.
                </p>
              </div>
              
              <div className="pt-4 space-y-3">
                {isEditing ? (
                  <div className="flex space-x-3">
                    <Button 
                      onClick={handleSaveProfile} 
                      className="flex-1 bg-vehicleApp-red hover:bg-red-600"
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>
                      ) : (
                        'Salvar'
                      )}
                    </Button>
                    <Button 
                      onClick={() => setIsEditing(false)} 
                      variant="outline" 
                      className="flex-1"
                      disabled={isSaving}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <Button 
                    onClick={() => setIsEditing(true)} 
                    className="w-full bg-vehicleApp-red hover:bg-red-600"
                  >
                    Editar Perfil
                  </Button>
                )}
                <Button 
                  onClick={logout} 
                  variant="outline" 
                  className="w-full"
                >
                  Sair da Conta
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfilePage;
