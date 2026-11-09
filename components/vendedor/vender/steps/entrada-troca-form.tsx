"use client";

import type { TrocaDraft } from "@/components/vendedor/vender/use-venda-draft";
import { Campo } from "@/components/vendedor/vender/field-error";
import styles from "@/components/vendedor/vender/vender.module.css";

/**
 * Veículo recebido na troca. Só a placa é obrigatória: ao salvar, o servidor
 * completa os dados pela consulta de placa e cadastra o carro na loja com
 * origem TROCA e valor de compra = valor desta entrada.
 */
export function EntradaTrocaForm({ troca, onChange }: { troca: TrocaDraft; onChange: (changes: Partial<TrocaDraft>) => void }) {
  return (
    <div className={styles.fields} data-testid="vender-troca-form">
      <Campo label="Placa do veículo da troca" required span={2}>
        <input
          className={styles.input}
          value={troca.placa}
          onChange={(e) => onChange({ placa: e.target.value.toUpperCase() })}
          placeholder="ABC1D23"
          maxLength={8}
          data-testid="vender-troca-placa"
        />
      </Campo>
      <Campo label="Cor" span={2}>
        <input className={styles.input} value={troca.cor} onChange={(e) => onChange({ cor: e.target.value })} placeholder="Prata" />
      </Campo>
      <Campo label="KM" span={2}>
        <input className={styles.input} inputMode="numeric" value={troca.hodometro} onChange={(e) => onChange({ hodometro: e.target.value })} placeholder="80000" />
      </Campo>
      <Campo label="Ano fab." span={2}>
        <input className={styles.input} inputMode="numeric" value={troca.anoFab} onChange={(e) => onChange({ anoFab: e.target.value })} placeholder="2018" />
      </Campo>
      <Campo label="Ano mod." span={2}>
        <input className={styles.input} inputMode="numeric" value={troca.anoMod} onChange={(e) => onChange({ anoMod: e.target.value })} placeholder="2019" />
      </Campo>
      <Campo label="Renavam" span={2}>
        <input className={styles.input} value={troca.renavam} onChange={(e) => onChange({ renavam: e.target.value })} placeholder="Opcional" />
      </Campo>
      <Campo label="Chassi" hint="O termo da troca usa chassi e renavam — preencha se tiver o documento em mãos.">
        <input className={styles.input} value={troca.chassi} onChange={(e) => onChange({ chassi: e.target.value.toUpperCase() })} placeholder="Opcional" />
      </Campo>
    </div>
  );
}
