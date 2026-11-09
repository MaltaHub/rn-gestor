import styles from "@/components/ui/avatar.module.css";

export function initialsOf(name: string | null | undefined) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Foto da pessoa ou as iniciais (mesma cor/forma em Usuários, Perfil e onde mais aparecer gente). */
export function Avatar(props: { name: string | null | undefined; photoUrl?: string | null; size?: number; className?: string }) {
  const size = props.size ?? 32;
  return (
    <span
      className={`${styles.avatar} ${props.className ?? ""}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
      aria-hidden="true"
    >
      {props.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={props.photoUrl} alt="" />
      ) : (
        initialsOf(props.name)
      )}
    </span>
  );
}
