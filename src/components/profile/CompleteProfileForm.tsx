
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Upload } from "lucide-react";
import { usePermission } from "@/contexts/PermissionContext";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
  }, { message: "Data inválida" }),
  bio: z.string().min(10, { message: "Biografia deve ter pelo menos 10 caracteres" }),
  avatarUrl: z.string().url({ message: "URL de avatar inválida" }).optional().nullable(),
  joinDate: z.string().refine((date) => {
    try {
      const parsed = new Date(date);
      return !isNaN(parsed.getTime());
    } catch {
      return false;
    }
  }, { message: "Data inválida" })
});

export type ProfileFormValues = z.infer<typeof profileSchema>;

interface CompleteProfileFormProps {
  initialValues: {
    name: string;
    birthdate: string;
    bio: string;
    avatarUrl: string;
    joinDate: string;
  };
}

const CompleteProfileForm: React.FC<CompleteProfileFormProps> = ({ initialValues }) => {
  const { completeUserProfile } = usePermission();
  const [isCompletingProfile, setIsCompletingProfile] = useState(false);
  const navigate = useNavigate();
  const today = new Date().toISOString().split('T')[0];

  // Configurar o formulário com react-hook-form e zod
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: initialValues.name || '',
      birthdate: initialValues.birthdate || '',
      bio: initialValues.bio || '',
      avatarUrl: initialValues.avatarUrl || '',
      joinDate: initialValues.joinDate || today
    }
  });

  const handleCompleteProfile = async (values: ProfileFormValues) => {
    setIsCompletingProfile(true);
    try {
      console.log("Tentando completar perfil com:", values);
      
      const success = await completeUserProfile(
        values.name, 
        values.birthdate, 
        values.bio, 
        values.avatarUrl || null, 
        values.joinDate
      );
      
      if (success) {
        navigate("/inventory");
      }
    } catch (error) {
      console.error("Erro ao completar perfil:", error);
    } finally {
      setIsCompletingProfile(false);
    }
  };

  return (
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
                <Input type="date" max={today} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="bio"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Biografia</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Conte um pouco sobre você e sua experiência profissional" 
                  className="min-h-[100px]"
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="avatarUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>URL do Avatar</FormLabel>
              <FormControl>
                <div className="flex space-x-2">
                  <Input 
                    placeholder="https://exemplo.com/seu-avatar.jpg" 
                    {...field} 
                    value={field.value || ''}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="joinDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Data de Início</FormLabel>
              <FormControl>
                <Input type="date" max={today} {...field} />
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
  );
};

export default CompleteProfileForm;
