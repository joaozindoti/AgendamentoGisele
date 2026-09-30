"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { SeletorHorario } from "@/components/seletor-horario";
import { AreaTexto, Botao, Caixa, Campo, Selecao } from "@/components/ui";
import { dataLonga, hora, instanteLocal } from "@/lib/formato";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { exibirTelefone, mascaraTelefone, paraE164 } from "@/lib/telefone";
import type { ProfissionalDoServico } from "@/lib/tipos";
import { agendarPainel } from "../actions";

interface ClienteBusca {
  id: string;
  nome: string;
  whatsapp: string;
}

export function FormNovoAgendamento({
  servicos,
  ehOwner,
  meuProfissional,
  diaInicial,
  diasMaximos,
  clienteInicial,
}: {
  servicos: { id: string; nome: string; duracao_min: number }[];
  ehOwner: boolean;
  meuProfissional: { id: string; nome: string };
  diaInicial: string;
  diasMaximos: number;
  clienteInicial: { id: string; nome: string } | null;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [modoCliente, setModoCliente] = useState<"busca" | "nova">("busca");
  const [busca, setBusca] = useState("");
  const [respBusca, setRespBusca] = useState<{ termo: string; lista: ClienteBusca[] } | null>(null);
  const resultados = respBusca && respBusca.termo === busca.trim() ? respBusca.lista : [];
  const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(clienteInicial);
  const [novoNome, setNovoNome] = useState("");
  const [novoTelefone, setNovoTelefone] = useState("");

  const [servicoId, setServicoId] = useState("");
  const [respProfissionais, setRespProfissionais] = useState<{ servicoId: string; lista: ProfissionalDoServico[] } | null>(null);
  const profissionais = respProfissionais?.servicoId === servicoId ? respProfissionais.lista : [];
  const [profissionalEscolhido, setProfissionalId] = useState(ehOwner ? "" : meuProfissional.id);
  // owner: só vale a escolha que pertence à lista do serviço atual
  const profissionalId = !ehOwner || profissionais.some((p) => p.id === profissionalEscolhido) ? profissionalEscolhido : "";

  const [modoLivre, setModoLivre] = useState(false);
  const [inicio, setInicio] = useState<string | null>(null);
  const [diaLivre, setDiaLivre] = useState(diaInicial);
  const [horaLivre, setHoraLivre] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // busca de cliente: RLS já limita — staff só encontra as próprias clientes
  useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2) return;
    const t = setTimeout(async () => {
      const digitos = termo.replace(/\D/g, "");
      const filtro = digitos.length >= 4 ? `whatsapp.ilike.%${digitos}%` : `nome.ilike.%${termo.replace(/[%,()]/g, "")}%`;
      const { data } = await criarClienteNavegador().from("clientes").select("id, nome, whatsapp").or(filtro).order("nome").limit(8);
      setRespBusca({ termo, lista: (data ?? []) as ClienteBusca[] });
    }, 250);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    if (!servicoId || !ehOwner) return;
    criarClienteNavegador()
      .rpc("profissionais_do_servico", { p_servico_id: servicoId })
      .then(({ data }) => {
        const lista = (data ?? []) as ProfissionalDoServico[];
        setRespProfissionais({ servicoId, lista });
        setProfissionalId(lista.length === 1 ? lista[0].id : "");
      });
  }, [servicoId, ehOwner]);

  const inicioEscolhido = modoLivre ? (horaLivre ? instanteLocal(diaLivre, horaLivre).toISOString() : null) : inicio;
  const clienteOk = modoCliente === "busca" ? Boolean(cliente) : novoNome.trim().length >= 2 && Boolean(paraE164(novoTelefone));
  const podeEnviar = clienteOk && servicoId && profissionalId && inicioEscolhido;

  function enviar() {
    if (!podeEnviar || !inicioEscolhido) return;
    setErro(null);
    iniciar(async () => {
      const r = await agendarPainel({
        clienteId: modoCliente === "busca" ? cliente!.id : null,
        novoNome: novoNome.trim(),
        novoWhatsapp: novoTelefone,
        profissionalId,
        servicoId,
        inicioIso: inicioEscolhido,
        observacoes,
      });
      if (r.erro) {
        setErro(r.erro);
        return;
      }
      router.push(`/painel/agendamentos/${r.id}`);
    });
  }

  return (
    <div className="space-y-6">
      <Etapa numero={1} titulo="Cliente" feita={clienteOk}
        acao={
          <button
            type="button"
            className="font-display text-[13px] font-bold text-accent"
            onClick={() => {
              setModoCliente((m) => (m === "busca" ? "nova" : "busca"));
              setCliente(null);
            }}
          >
            {modoCliente === "busca" ? "+ Cliente nova" : "Buscar cadastrada"}
          </button>
        }
      >
        {modoCliente === "busca" ? (
          cliente ? (
            <div className="flex items-center justify-between rounded-input border border-accent/40 bg-blush/40 px-4 py-3">
              <span className="flex items-center gap-3 font-medium">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface font-display text-[13px] font-bold text-accent">
                  {cliente.nome.charAt(0)}
                </span>
                {cliente.nome}
              </span>
              <button type="button" className="text-[13px] text-accent" onClick={() => setCliente(null)}>
                Trocar
              </button>
            </div>
          ) : (
            <>
              <Campo rotulo="Buscar por nome ou WhatsApp" value={busca} onChange={(e) => setBusca(e.target.value)} autoComplete="off" />
              {resultados.length > 0 && (
                <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                  {resultados.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="flex w-full justify-between px-4 py-2.5 text-left hover:bg-base" onClick={() => setCliente(c)}>
                        <span>{c.nome}</span>
                        <span className="text-[13px] text-ink-muted">{exibirTelefone(c.whatsapp)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!ehOwner && (
                <p className="text-[12px] text-ink-muted">
                  Aparecem aqui só as clientes que já foram atendidas por você. Cliente nova ou de outra profissional: use
                  &quot;+ Cliente nova&quot; com o WhatsApp dela — se já tiver cadastro, o sistema reaproveita.
                </p>
              )}
            </>
          )
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
            <Campo
              rotulo="WhatsApp"
              type="tel"
              inputMode="numeric"
              placeholder="(99) 99999-9999"
              value={novoTelefone}
              onChange={(e) => setNovoTelefone(mascaraTelefone(e.target.value))}
            />
          </div>
        )}
      </Etapa>

      <Etapa numero={2} titulo="Serviço e profissional" feita={Boolean(servicoId && profissionalId)}>
        <Selecao
          rotulo="Serviço"
          value={servicoId}
          onChange={(e) => {
            setServicoId(e.target.value);
            setInicio(null);
          }}
        >
          <option value="">Escolha…</option>
          {servicos.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </Selecao>
        {ehOwner ? (
          servicoId && (
            <Selecao
              rotulo="Profissional"
              value={profissionalId}
              onChange={(e) => {
                setProfissionalId(e.target.value);
                setInicio(null);
              }}
            >
              <option value="">Escolha…</option>
              {profissionais.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Selecao>
          )
        ) : (
          <p className="text-[14px] text-ink-muted">Profissional: {meuProfissional.nome}</p>
        )}
        {ehOwner && servicoId && profissionais.length === 0 && (
          <Caixa>Nenhuma profissional ativa faz esse serviço. Vincule em Equipe ou em Serviços.</Caixa>
        )}
      </Etapa>

      {servicoId && profissionalId && (
        <Etapa
          numero={3}
          titulo="Horário"
          feita={Boolean(inicioEscolhido)}
          semCartao={!modoLivre}
          acao={
            <button type="button" className="font-display text-[13px] font-bold text-accent" onClick={() => setModoLivre((v) => !v)}>
              {modoLivre ? "Usar a grade" : "Encaixe"}
            </button>
          }
        >
          {modoLivre ? (
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Dia" type="date" value={diaLivre} onChange={(e) => setDiaLivre(e.target.value)} />
              <Campo rotulo="Hora" type="time" step={300} value={horaLivre} onChange={(e) => setHoraLivre(e.target.value)} />
              <p className="col-span-2 text-[12px] text-ink-muted">
                Encaixe ignora a grade e a disponibilidade, mas nunca deixa sobrepor outro atendimento confirmado.
              </p>
            </div>
          ) : (
            <SeletorHorario
              profissionalId={profissionalId}
              servicoId={servicoId}
              diasMaximos={diasMaximos}
              valor={inicio}
              aoEscolher={setInicio}
            />
          )}
        </Etapa>
      )}

      <AreaTexto rotulo="Observações (opcional)" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} maxLength={1000} />

      {erro && <Caixa tipo="erro">{erro}</Caixa>}
      <Botao largo disabled={!podeEnviar || pendente} onClick={enviar}>
        {pendente
          ? "Agendando…"
          : inicioEscolhido
          ? `Agendar ${dataLonga(new Date(inicioEscolhido))} · ${hora(new Date(inicioEscolhido))}`
          : "Agendar"}
      </Botao>
    </div>
  );
}

// Etapa numerada: é uma sequência de verdade (cliente → serviço → horário),
// e o número vira check quando a etapa está completa.
function Etapa({
  numero,
  titulo,
  feita,
  acao,
  semCartao,
  children,
}: {
  numero: number;
  titulo: string;
  feita: boolean;
  acao?: React.ReactNode;
  /** o seletor de horário já vem em cartões próprios */
  semCartao?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-[17px] font-bold tracking-[-0.02em]">
          <span
            aria-hidden
            className={`flex h-7 w-7 items-center justify-center rounded-full font-display text-[13px] font-extrabold ${
              feita ? "bg-accent text-white" : "border border-gold/70 text-gold-ink"
            }`}
          >
            {feita ? "✓" : numero}
          </span>
          {titulo}
        </h2>
        {acao}
      </div>
      {semCartao ? children : <div className="space-y-3 rounded-card bg-surface p-4 shadow-soft">{children}</div>}
    </section>
  );
}
