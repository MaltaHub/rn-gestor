
import React from "react";
import { DisplayField } from "./DisplayField";

interface NameFieldProps {
  name: string | null;
}

export const NameField: React.FC<NameFieldProps> = ({ name }) => {
  return <DisplayField label="Nome" value={name} />;
};
