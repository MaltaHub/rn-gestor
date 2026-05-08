import { useState } from "react";
import type { BulkSeparator } from "@/components/ui-grid/sheet-form";
import type { CarFormSectionKey } from "@/components/ui-grid/types";
import { readStorage, storageKey } from "@/components/ui-grid/hooks/useGridStoredState";

const DEFAULT_CAR_FORM_SECTIONS: Record<CarFormSectionKey, boolean> = {
  technical: true,
  characteristics: true
};

export function readCarFormSectionsStorage() {
  const stored = readStorage<Partial<Record<CarFormSectionKey, boolean>>>(
    storageKey("carros", "form-sections"),
    DEFAULT_CAR_FORM_SECTIONS
  );

  return {
    technical: stored.technical ?? DEFAULT_CAR_FORM_SECTIONS.technical,
    characteristics: stored.characteristics ?? DEFAULT_CAR_FORM_SECTIONS.characteristics
  };
}

export function useGridCarFormState() {
  const [formMode, setFormMode] = useState<"insert" | "bulk" | "update">("insert");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [pricePreviewColumn, setPricePreviewColumn] = useState<string | null>(null);
  const [pricePreviewText, setPricePreviewText] = useState<string | null>(null);
  const [pricePreviewLoading, setPricePreviewLoading] = useState(false);
  const [pricePreviewError, setPricePreviewError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formInfo, setFormInfo] = useState<string | null>(null);
  const [formBooting, setFormBooting] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [carFeatureSearch, setCarFeatureSearch] = useState("");
  const [carFeatureError, setCarFeatureError] = useState<string | null>(null);
  const [carFeatureLoading, setCarFeatureLoading] = useState(false);
  const [carFeatureOptionsReady, setCarFeatureOptionsReady] = useState(false);
  const [carFeatureSelectionsReady, setCarFeatureSelectionsReady] = useState(false);
  const [selectedVisualFeatureIds, setSelectedVisualFeatureIds] = useState<string[]>([]);
  const [selectedTechnicalFeatureIds, setSelectedTechnicalFeatureIds] = useState<string[]>([]);
  const [featureQuickCreateOpen, setFeatureQuickCreateOpen] = useState(false);
  const [featureQuickCreateKind, setFeatureQuickCreateKind] = useState<"visual" | "technical">("visual");
  const [featureQuickCreateValue, setFeatureQuickCreateValue] = useState("");
  const [featureQuickCreateError, setFeatureQuickCreateError] = useState<string | null>(null);
  const [featureQuickCreateSubmitting, setFeatureQuickCreateSubmitting] = useState(false);
  const [carFormSectionsOpen, setCarFormSectionsOpen] = useState<Record<CarFormSectionKey, boolean>>(() =>
    readCarFormSectionsStorage()
  );
  const [plateLookupSubmitting, setPlateLookupSubmitting] = useState(false);
  const [modeloQuickCreateOpen, setModeloQuickCreateOpen] = useState(false);
  const [modeloQuickCreateValue, setModeloQuickCreateValue] = useState("");
  const [modeloQuickCreateError, setModeloQuickCreateError] = useState<string | null>(null);
  const [modeloQuickCreateSubmitting, setModeloQuickCreateSubmitting] = useState(false);
  const [bulkSeparator, setBulkSeparator] = useState<BulkSeparator>(";");
  const [bulkRawText, setBulkRawText] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  return {
    formMode,
    setFormMode,
    editingRowId,
    setEditingRowId,
    formValues,
    setFormValues,
    pricePreviewColumn,
    setPricePreviewColumn,
    pricePreviewText,
    setPricePreviewText,
    pricePreviewLoading,
    setPricePreviewLoading,
    pricePreviewError,
    setPricePreviewError,
    formError,
    setFormError,
    formInfo,
    setFormInfo,
    formBooting,
    setFormBooting,
    formSubmitting,
    setFormSubmitting,
    carFeatureSearch,
    setCarFeatureSearch,
    carFeatureError,
    setCarFeatureError,
    carFeatureLoading,
    setCarFeatureLoading,
    carFeatureOptionsReady,
    setCarFeatureOptionsReady,
    carFeatureSelectionsReady,
    setCarFeatureSelectionsReady,
    selectedVisualFeatureIds,
    setSelectedVisualFeatureIds,
    selectedTechnicalFeatureIds,
    setSelectedTechnicalFeatureIds,
    featureQuickCreateOpen,
    setFeatureQuickCreateOpen,
    featureQuickCreateKind,
    setFeatureQuickCreateKind,
    featureQuickCreateValue,
    setFeatureQuickCreateValue,
    featureQuickCreateError,
    setFeatureQuickCreateError,
    featureQuickCreateSubmitting,
    setFeatureQuickCreateSubmitting,
    carFormSectionsOpen,
    setCarFormSectionsOpen,
    plateLookupSubmitting,
    setPlateLookupSubmitting,
    modeloQuickCreateOpen,
    setModeloQuickCreateOpen,
    modeloQuickCreateValue,
    setModeloQuickCreateValue,
    modeloQuickCreateError,
    setModeloQuickCreateError,
    modeloQuickCreateSubmitting,
    setModeloQuickCreateSubmitting,
    bulkSeparator,
    setBulkSeparator,
    bulkRawText,
    setBulkRawText,
    bulkError,
    setBulkError,
    bulkSuccess,
    setBulkSuccess,
    bulkSubmitting,
    setBulkSubmitting
  };
}
