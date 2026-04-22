import { ComponentPropsWithoutRef } from "react";

type ButtonProps = ComponentPropsWithoutRef<"button">;

export function Button({ className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={className ? `btn ${className}` : "btn"} {...props} />;
}
