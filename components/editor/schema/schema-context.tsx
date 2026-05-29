"use client";

import { createContext, useContext, type ReactNode } from "react";
import { EMPTY_SCHEMA_ENV, type SchemaEnvironment } from "@/components/editor/schema/socket-schema";

const SchemaContext = createContext<SchemaEnvironment>(EMPTY_SCHEMA_ENV);

export function SchemaProvider({
  value,
  children
}: {
  value: SchemaEnvironment;
  children: ReactNode;
}) {
  return <SchemaContext.Provider value={value}>{children}</SchemaContext.Provider>;
}

export function useSchemaEnv(): SchemaEnvironment {
  return useContext(SchemaContext);
}
