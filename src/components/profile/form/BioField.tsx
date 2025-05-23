
import React from "react";
import { DisplayField } from "./DisplayField";

interface BioFieldProps {
  bio: string | null;
}

export const BioField: React.FC<BioFieldProps> = ({ bio }) => {
  return <DisplayField label="Biografia" value={bio} />;
};
