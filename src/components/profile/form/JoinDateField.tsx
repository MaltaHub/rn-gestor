
import React from "react";
import { DisplayField } from "./DisplayField";
import { formatDate } from "@/utils/dateUtils";

interface JoinDateFieldProps {
  joinDate: string | null;
}

export const JoinDateField: React.FC<JoinDateFieldProps> = ({ joinDate }) => {
  return <DisplayField label="Data de Ingresso" value={joinDate ? formatDate(joinDate) : null} />;
};
