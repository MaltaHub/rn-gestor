
import React from "react";

interface DisplayFieldProps {
  label: string;
  value: string | null | undefined;
}

export const DisplayField: React.FC<DisplayFieldProps> = ({ label, value }) => {
  return (
    <div className="mb-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="font-medium">{value || "Não informado"}</p>
    </div>
  );
};
