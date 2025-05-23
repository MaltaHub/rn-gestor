
import React from "react";
import { DisplayField } from "./DisplayField";
import { formatDate } from "@/utils/dateUtils";

interface BirthdateFieldProps {
  birthdate: string | null;
}

export const BirthdateField: React.FC<BirthdateFieldProps> = ({ birthdate }) => {
  return <DisplayField label="Data de Nascimento" value={birthdate ? formatDate(birthdate) : null} />;
};
