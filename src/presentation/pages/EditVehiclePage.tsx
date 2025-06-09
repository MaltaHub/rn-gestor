// src/presentation/pages/EditVehiclePage.tsx
import { Skeleton } from '../components/ui/Skeleton';
import { useVehicleForm } from '../hooks/useVehicleForm';

export default function EditVehiclePage() {
  const { vehicle, edited, isLoading } = useVehicleForm();

  if (isLoading || !edited) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton height="2rem" className="w-1/3" />
        <Skeleton height="1.5rem" className="w-full" />
        <Skeleton height="1.5rem" className="w-full" />
        <Skeleton height="1.5rem" className="w-full" />
      </div>
    );
  }

  return (
    // ... seu layout normal quando os dados estiverem prontos
  );
}