
import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  
  const { login, register, isLoading } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isLogin) {
      await login(email, password);
    } else {
      if (password !== confirmPassword) {
        setPasswordError("As senhas não coincidem");
        return;
      }
      setPasswordError("");
      await register(email, password);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setPasswordError("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-vehicleApp-lightGray px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl text-center">
            {isLogin ? "Login" : "Criar Conta"}
          </CardTitle>
          <CardDescription className="text-center">
            {isLogin 
              ? "Acesse sua conta para gerenciar seu estoque de veículos" 
              : "Crie uma conta para começar a gerenciar seu estoque de veículos"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirme sua senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="********"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required={!isLogin}
                />
                {passwordError && (
                  <p className="text-red-500 text-sm">{passwordError}</p>
                )}
              </div>
            )}
            
            <Button 
              type="submit" 
              className="w-full bg-vehicleApp-red hover:bg-red-600"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 
                  Aguarde...
                </>
              ) : (
                isLogin ? "Entrar" : "Criar Conta"
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button variant="link" onClick={toggleMode}>
            {isLogin 
              ? "Não tem uma conta? Criar agora" 
              : "Já tem uma conta? Fazer login"
            }
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default Login;
