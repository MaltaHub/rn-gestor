
import React from "react";
import { SalesDashboard } from "@/components/sales/SalesDashboard";
import ProtectedArea from "@/components/ProtectedArea";

const SalesDashboardPage: React.FC = () => {
  return (
    <ProtectedArea 
      area="sales_dashboard" 
      requiredLevel={1}
      fallback={
        <div className="content-container py-6">
          <div className="floating-box text-center p-8">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Acesso Restrito</h1>
            <p className="text-gray-700">
              Apenas Gerentes e Gestores podem acessar o Dashboard de Vendas.
            </p>
          </div>
        </div>
      }
    >
      <div className="content-container py-6">
        <div className="floating-box">
          <SalesDashboard />
        </div>
      </div>
    </ProtectedArea>
  );
};

export default SalesDashboardPage;
