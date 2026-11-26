import { AuthenticatedWorkspace } from "@/components/ui-grid/authenticated-workspace";

export const dynamic = "force-dynamic";

export default function AdminBackupPage() {
  return <AuthenticatedWorkspace initialView="backup" />;
}
