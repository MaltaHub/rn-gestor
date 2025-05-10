
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { History } from "lucide-react";
import { useVehicleHistory } from "@/hooks/useVehicleHistory";
import { HistoryFilter } from "./history/HistoryFilter";
import { HistoryContent } from "./history/HistoryContent";

interface VehicleHistoryProps {
  vehicleId: string;
}

export const VehicleHistory: React.FC<VehicleHistoryProps> = ({ vehicleId }) => {
  const {
    isLoading,
    error,
    fieldFilter,
    setFieldFilter,
    filteredHistory,
    uniqueFieldNames,
    getFieldLabel,
    formatValue
  } = useVehicleHistory(vehicleId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-vehicleApp-red" />
          Histórico de Alterações
        </CardTitle>
        <HistoryFilter
          fieldFilter={fieldFilter}
          setFieldFilter={setFieldFilter}
          uniqueFieldNames={uniqueFieldNames}
          getFieldLabel={getFieldLabel}
        />
      </CardHeader>
      <CardContent>
        <HistoryContent
          isLoading={isLoading}
          error={error}
          filteredHistory={filteredHistory}
          formatValue={formatValue}
          getFieldLabel={getFieldLabel}
        />
      </CardContent>
    </Card>
  );
};
