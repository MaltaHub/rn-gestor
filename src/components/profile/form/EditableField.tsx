
import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProfileField } from "./ProfileField";

interface EditableFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  isEditing: boolean;
  type?: "text" | "date" | "textarea";
  placeholder?: string;
  maxDate?: string;
  helpText?: string;
}

export const EditableField: React.FC<EditableFieldProps> = ({ 
  id, 
  label, 
  value, 
  onChange, 
  isEditing,
  type = "text",
  placeholder = "",
  maxDate,
  helpText
}) => {
  if (isEditing) {
    if (type === "textarea") {
      return (
        <ProfileField id={id} label={label} helpText={helpText}>
          <Textarea 
            id={id}
            className="min-h-[100px]"
            value={value} 
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
          />
        </ProfileField>
      );
    }
    
    return (
      <ProfileField id={id} label={label} helpText={helpText}>
        <Input 
          id={id}
          type={type}
          max={maxDate}
          value={value} 
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      </ProfileField>
    );
  }
  
  return (
    <ProfileField id={id} label={label} helpText={helpText}>
      {type === "textarea" ? (
        <Textarea id={id} value={value || ""} readOnly />
      ) : (
        <Input 
          id={id} 
          value={type === "date" && value ? new Date(value).toISOString().split('T')[0] : value || ""} 
          readOnly 
        />
      )}
    </ProfileField>
  );
};
