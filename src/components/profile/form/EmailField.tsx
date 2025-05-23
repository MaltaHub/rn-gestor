
import React from "react";
import { DisplayField } from "./DisplayField";

interface EmailFieldProps {
  email: string | null | undefined;
}

export const EmailField: React.FC<EmailFieldProps> = ({ email }) => {
  return <DisplayField label="Email" value={email} />;
};
