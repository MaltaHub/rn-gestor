
import React from "react";
import { SalesDashboard } from "@/components/sales/SalesDashboard";

const SalesDashboardPage: React.FC = () => {
  return (
    <div className="content-container py-6">
      <div className="floating-box">
        <SalesDashboard />
      </div>
    </div>
  );
};

export default SalesDashboardPage;
