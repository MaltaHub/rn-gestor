
import React, { ReactNode } from "react";
import { Label } from "@/components/ui/label";

interface ProfileFieldProps {
  id: string;
  label: string;
  children: ReactNode;
  helpText?: string;
}

export const ProfileField: React.FC<ProfileFieldProps> = ({ 
  id, 
  label, 
  children,
  helpText
}) => {
  return (
    <div className="space-y-3">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {helpText && <p className="text-xs text-gray-500">{helpText}</p>}
    </div>
  );
};
