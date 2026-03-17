import { AuthenticatedWorkspace } from "@/components/ui-grid/authenticated-workspace";

export const dynamic = "force-dynamic";

export default function AdminUsersPage() {
  return <AuthenticatedWorkspace initialView="users" />;
}
