"use client";

import { useEffect, useRef, useState } from "react";
import type { RequestAuth } from "@/components/ui-grid/types";
import { formatTelefone } from "@/lib/domain/vendas/validacao";
import { fetchMyProfile, updateMyProfile, uploadMyAvatar, type MyProfile } from "@/components/profile/api";

function initials(name: string | null | undefined): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * Editor de perfil próprio (auto-serviço): foto (upload), bio e telefone (WhatsApp).
 * Compartilhado por /perfil (PersonalWorkspace) e /vendedor/perfil (VendedorPerfil).
 */
export function ProfileEditor({ requestAuth, fallbackName }: { requestAuth: RequestAuth; fallbackName: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [bio, setBio] = useState("");
  const [telefone, setTelefone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const token = requestAuth.accessToken;
  useEffect(() => {
    let active = true;
    fetchMyProfile(requestAuth)
      .then((data) => {
        if (!active) return;
        setProfile(data);
        setBio(data.bio ?? "");
        setTelefone(data.telefone ?? "");
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Falha ao carregar o perfil.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // requestAuth é recriado a cada render; depende só do token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onPickAvatar(file: File) {
    setUploading(true);
    setError(null);
    setInfo(null);
    try {
      const updated = await uploadMyAvatar({ requestAuth, file });
      setProfile(updated);
      setInfo("Foto atualizada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar a foto.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const updated = await updateMyProfile({
        requestAuth,
        updates: { bio: bio.trim() ? bio.trim() : null, telefone: telefone.trim() ? telefone.trim() : null }
      });
      setProfile(updated);
      setBio(updated.bio ?? "");
      setTelefone(updated.telefone ?? "");
      setInfo("Perfil salvo.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar o perfil.");
    } finally {
      setSaving(false);
    }
  }

  const fotoUrl = profile?.foto ?? null;

  return (
    <section className="profile-edit-card" aria-label="Meu perfil">
      <div className="profile-edit-avatar">
        {fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fotoUrl} alt="Foto de perfil" className="profile-avatar-img" />
        ) : (
          <span className="profile-avatar-fallback" aria-hidden="true">
            {initials(fallbackName)}
          </span>
        )}
        <div className="profile-edit-avatar-actions">
          <button type="button" className="btn btn-secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? "Enviando..." : fotoUrl ? "Trocar foto" : "Enviar foto"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onPickAvatar(file);
            }}
          />
          <small>JPG, PNG, WEBP ou GIF — até 5MB. Aparece no botão de WhatsApp do catálogo/galeria.</small>
        </div>
      </div>

      <div className="profile-edit-fields">
        <label className="profile-field">
          <span>Telefone (WhatsApp)</span>
          <input
            value={telefone}
            onChange={(event) => setTelefone(event.target.value)}
            onBlur={(event) => setTelefone(formatTelefone(event.target.value))}
            placeholder="(13) 99999-0000"
            inputMode="tel"
            disabled={loading}
          />
          <small>Usado no botão de WhatsApp dos seus links. Vazio = número padrão da loja.</small>
        </label>
        <label className="profile-field">
          <span>Bio</span>
          <textarea
            value={bio}
            rows={3}
            onChange={(event) => setBio(event.target.value)}
            placeholder="Uma linha sobre você (opcional)."
            disabled={loading}
            maxLength={600}
          />
        </label>
        <div className="profile-edit-actions">
          <button type="button" className="btn" onClick={() => void onSave()} disabled={saving || loading}>
            {saving ? "Salvando..." : "Salvar perfil"}
          </button>
          {info ? <span className="profile-ok">{info}</span> : null}
          {error ? <span className="profile-error">{error}</span> : null}
        </div>
      </div>
    </section>
  );
}
