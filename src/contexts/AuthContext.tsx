
import React, { createContext, useContext, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User } from "../types";
import { toast } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialAuthCheck, setInitialAuthCheck] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);
      
      // Configure o listener de mudança de estado de autenticação
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
          console.log('Auth state changed:', event, session?.user?.id);
          
          if (session?.user) {
            const newUser = {
              id: session.user.id,
              email: session.user.email || '',
              name: session.user.user_metadata?.name || 'Usuário'
            };
            setUser(newUser);
            
            // Invalidar queries quando o usuário fizer login
            if (event === 'SIGNED_IN') {
              console.log('Usuário logado - invalidando queries');
              queryClient.invalidateQueries({ queryKey: ['vehicles'] });
              queryClient.invalidateQueries({ queryKey: ['notifications'] });
            }
          } else {
            setUser(null);
            
            // Limpar cache quando o usuário fizer logout
            if (event === 'SIGNED_OUT') {
              console.log('Usuário deslogado - limpando cache');
              queryClient.clear();
            }
          }
          
          if (!initialAuthCheck) {
            setInitialAuthCheck(true);
          }
          
          setIsLoading(false);
        }
      );

      // Verifique se já existe uma sessão
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          name: session.user.user_metadata?.name || 'Usuário'
        });
      }
      
      setInitialAuthCheck(true);
      setIsLoading(false);

      return () => {
        subscription.unsubscribe();
      };
    };

    initAuth();
  }, [initialAuthCheck, queryClient]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) {
        setError(error.message);
        toast.error(error.message || "E-mail ou senha inválidos");
      } else if (data.user) {
        toast.success("Login bem-sucedido!");
        navigate("/inventory");
      }
    } catch (err) {
      console.error("Erro ao fazer login:", err);
      setError("Ocorreu um erro ao tentar fazer login");
      toast.error("Ocorreu um erro ao tentar fazer login");
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password
      });
      
      if (error) {
        setError(error.message);
        toast.error(error.message || "Erro ao criar conta");
      } else if (data.user) {
        toast.success("Conta criada com sucesso!");
        navigate("/inventory");
      }
    } catch (err) {
      console.error("Erro ao criar conta:", err);
      setError("Ocorreu um erro ao tentar criar sua conta");
      toast.error("Ocorreu um erro ao tentar criar sua conta");
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Logout realizado com sucesso!");
      navigate("/login");
    } catch (err) {
      console.error("Erro ao fazer logout:", err);
      toast.error("Erro ao fazer logout");
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, error }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
