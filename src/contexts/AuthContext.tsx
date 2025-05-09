
import React, { createContext, useContext, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User } from "../types";
import { toast } from "@/components/ui/sonner";

// Sample users for demo
const DEMO_USERS = [
  { id: "1", email: "demo@example.com", name: "Demo User", password: "password123" }
];

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is stored in local storage on app load
    const storedUser = localStorage.getItem("vehicleAppUser");
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Failed to parse stored user", e);
        localStorage.removeItem("vehicleAppUser");
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    const foundUser = DEMO_USERS.find(u => u.email === email);
    
    if (foundUser && foundUser.password === password) {
      const { password, ...userWithoutPassword } = foundUser;
      setUser(userWithoutPassword);
      localStorage.setItem("vehicleAppUser", JSON.stringify(userWithoutPassword));
      toast.success("Login bem-sucedido!");
      navigate("/inventory");
    } else {
      setError("E-mail ou senha inválidos");
      toast.error("E-mail ou senha inválidos");
    }

    setIsLoading(false);
  };

  const register = async (email: string, name: string, password: string) => {
    setIsLoading(true);
    setError(null);

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if email already exists
    const existingUser = DEMO_USERS.find(u => u.email === email);
    
    if (existingUser) {
      setError("E-mail já está em uso");
      toast.error("E-mail já está em uso");
      setIsLoading(false);
      return;
    }

    // In a real app, we would add the user to the database here
    // For demo purposes, just create a user object
    const newUser = { id: String(DEMO_USERS.length + 1), email, name };
    setUser(newUser);
    localStorage.setItem("vehicleAppUser", JSON.stringify(newUser));
    toast.success("Conta criada com sucesso!");
    navigate("/inventory");
    setIsLoading(false);
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("vehicleAppUser");
    toast.success("Logout realizado com sucesso!");
    navigate("/login");
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
