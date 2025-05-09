
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ProfilePage: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="content-container py-6">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle>Perfil do Vendedor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={user?.name || ""} readOnly />
          </div>
          <div className="space-y-3">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" value={user?.email || ""} readOnly />
          </div>
          <div className="pt-4">
            <Button 
              onClick={logout} 
              variant="destructive" 
              className="w-full"
            >
              Sair da Conta
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfilePage;
