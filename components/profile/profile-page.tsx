"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/files/explorer/explorer-icons";
import { PasswordCard } from "@/components/profile/password-card";
import { fetchMyProfile, updateMyProfile, uploadMyAvatar, type MyProfile } from "@/components/profile/api";
import { Avatar } from "@/components/ui/avatar";
import type { RequestAuth } from "@/components/ui-grid/types";
import { formatTelefone } from "@/lib/domain/vendas/validacao";
import styles from "@/components/profile/profile.module.css";

type ProfileActor = { userName: string; userEmail: string | null; role: string; status: string };

function titleCase(code: string) {
  const text = code.toLowerCase().replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Perfil próprio (auto-serviço) — o mesmo em /perfil e /vendedor/perfil:
 * identidade (foto clicável, nome, e-mail, cargo, situação, Sair), contato dos links
 * (telefone/WhatsApp e bio) e senha.
 */
export function ProfilePage(props: {
  actor: ProfileActor;
  requestAuth: RequestAuth;
  hasSession: boolean;
  onSignOut: () => void | Promise<void>;
}) {
  const { actor, requestAuth } = props;
  const fileRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [bio, setBio] = useState("");
  const [telefone, setTelefone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

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
      .catch((error: unknown) => {
        if (active) setMessage({ tone: "error", text: error instanceof Error ? error.message : "Falha ao carregar o perfil." });
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

  async function pickAvatar(file: File) {
    setUploading(true);
    setMessage(null);
    try {
      setProfile(await uploadMyAvatar({ requestAuth, file }));
      setMessage({ tone: "ok", text: "Foto atualizada." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Falha ao enviar a foto." });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const dirty = (profile?.bio ?? "") !== bio.trim() || (profile?.telefone ?? "") !== telefone.trim();

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const updated = await updateMyProfile({
        requestAuth,
        updates: { bio: bio.trim() || null, telefone: telefone.trim() || null }
      });
      setProfile(updated);
      setBio(updated.bio ?? "");
      setTelefone(updated.telefone ?? "");
      setMessage({ tone: "ok", text: "Contato salvo." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Falha ao salvar." });
    } finally {
      setSaving(false);
    }
  }

  const name = profile?.nome || actor.userName;
  const email = profile?.email ?? actor.userEmail;

  return (
    <div className={styles.page} data-testid="profile-page">
      <header className={styles.identity}>
        <button
          type="button"
          className={styles.avatarBtn}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          title="Trocar foto (JPG, PNG, WEBP ou GIF, até 5 MB)"
          aria-label="Trocar foto"
          data-testid="profile-avatar"
        >
          <Avatar name={name} photoUrl={profile?.foto} size={64} />
          <span className={styles.avatarBadge} aria-hidden="true">
            <Icon name={uploading ? "refresh" : "upload"} size={13} />
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void pickAvatar(file);
          }}
        />
        <div className={styles.identityText}>
          <h1>{name}</h1>
          <p>{email ?? "Sem e-mail vinculado"}</p>
          <p className={styles.meta}>
            {titleCase(actor.role)}
            <span className={styles.status} data-ok={actor.status.toUpperCase().includes("APROV") || undefined}>
              {titleCase(actor.status)}
            </span>
          </p>
        </div>
        <button type="button" className={styles.ghostBtn} onClick={() => void props.onSignOut()} data-testid="profile-signout">
          Sair
        </button>
      </header>

      <section className={styles.card} aria-labelledby="profile-contact-title">
        <div className={styles.cardHead}>
          <h2 id="profile-contact-title">Contato nos links</h2>
          <p>Aparece no botão de WhatsApp do catálogo e da galeria.</p>
        </div>
        <div className={styles.fields}>
          <label className={styles.field}>
            <span>Telefone (WhatsApp)</span>
            <input
              value={telefone}
              onChange={(event) => setTelefone(event.target.value)}
              onBlur={(event) => setTelefone(formatTelefone(event.target.value))}
              placeholder="(13) 99999-0000"
              inputMode="tel"
              disabled={loading}
              data-testid="profile-telefone"
            />
            <small>Vazio = número padrão da loja.</small>
          </label>
          <label className={`${styles.field} ${styles.full}`}>
            <span>Bio</span>
            <textarea
              value={bio}
              rows={2}
              onChange={(event) => setBio(event.target.value)}
              placeholder="Uma linha sobre você (opcional)."
              disabled={loading}
              maxLength={600}
            />
          </label>
        </div>
        <div className={styles.cardFoot}>
          {message ? (
            <span className={styles.message} data-tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>
              {message.text}
            </span>
          ) : null}
          <button type="button" className={styles.primaryBtn} onClick={() => void save()} disabled={saving || loading || !dirty} data-testid="profile-save">
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </section>

      <PasswordCard hasSession={props.hasSession} />
    </div>
  );
}
