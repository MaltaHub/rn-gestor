// src/presentation/components/Vehicle/VehicleEditForm.tsx
import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { VehicleSchema, VehicleDTO } from '@/application/dtos/VehicleDTO';

interface VehicleEditFormProps {
  defaultValues: VehicleDTO;
  onSubmit: (data: VehicleDTO) => void;
  isSaving: boolean;
}

export function VehicleEditForm({
  defaultValues,
  onSubmit,
  isSaving,
}: VehicleEditFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<VehicleDTO>({
    resolver: zodResolver(VehicleSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Modelo */}
      <div>
        <label className="block text-sm font-medium">Modelo</label>
        <input
          type="text"
          {...register('model')}
          className="mt-1 w-full rounded p-2 border"
        />
        {errors.model && (
          <p className="text-red-600 text-sm">{errors.model.message}</p>
        )}
      </div>

      {/* Placa */}
      <div>
        <label className="block text-sm font-medium">Placa</label>
        <input
          type="text"
          {...register('plate')}
          className="mt-1 w-full rounded p-2 border"
        />
        {errors.plate && (
          <p className="text-red-600 text-sm">{errors.plate.message}</p>
        )}
      </div>

      {/* Ano */}
      <div>
        <label className="block text-sm font-medium">Ano</label>
        <input
          type="number"
          {...register('year', { valueAsNumber: true })}
          className="mt-1 w-full rounded p-2 border"
        />
        {errors.year && (
          <p className="text-red-600 text-sm">{errors.year.message}</p>
        )}
      </div>

      {/* Quilometragem */}
      <div>
        <label className="block text-sm font-medium">Quilometragem</label>
        <input
          type="number"
          {...register('mileage', { valueAsNumber: true })}
          className="mt-1 w-full rounded p-2 border"
        />
        {errors.mileage && (
          <p className="text-red-600 text-sm">{errors.mileage.message}</p>
        )}
      </div>

      {/* Preço */}
      <div>
        <label className="block text-sm font-medium">Preço</label>
        <input
          type="number"
          {...register('price', { valueAsNumber: true })}
          className="mt-1 w-full rounded p-2 border"
        />
        {errors.price && (
          <p className="text-red-600 text-sm">{errors.price.message}</p>
        )}
      </div>

      {/* Status */}
      <div>
        <label className="block text-sm font-medium">Status</label>
        <Controller
          control={control}
          name="status"
          render={({ field }) => (
            <select {...field} className="mt-1 w-full rounded p-2 border">
              <option value="available">Disponível</option>
              <option value="reserved">Reservado</option>
              <option
