"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { SeletorHorario } from "@/components/seletor-horario";
import { AreaTexto, Botao, Caixa, Campo, Selecao } from "@/components/ui";
import { dataLonga, duracao, hora, instanteLocal } from "@/lib/formato";
import { criarClienteNavegador } from "@/lib/supabase/client";
import { exibirTelefone, mascaraTelefone, paraE164 } from "@/lib/telefone";
import type { ProfissionalDoServico } from "@/lib/tipos";
import { agendarPainel, renomearCliente } from "../actions";

interface ClienteBusca {
  id: string;
  nome: string;
  whatsapp: string;
}

const MAX_SERVICOS = 6;

// Cliente criada por WhatsApp/pré-cadastro chega como "Cliente" (ou sem letras):
// a Gisele precisa dar o nome de verdade.
function nomePendente(nome: string) {
  return !/\p{L}/u.test(nome) || nome.trim().toLowerCase() === "cliente";
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
  clienteInicial: { id: string; nome: string; whatsapp?: string } | null;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [modoCliente, setModoCliente] = useState<"busca" | "nova">("busca");
  const [busca, setBusca] = useState("");
  const [respBusca, setRespBusca] = useState<{ termo: string; lista: ClienteBusca[] } | null>(null);
  const resultados = respBusca && respBusca.termo === busca.trim() ? respBusca.lista : [];
  const [cliente, setCliente] = useState<{ id: string; nome: string; whatsapp?: string } | null>(clienteInicial);
  const [editandoNome, setEditandoNome] = useState(Boolean(clienteInicial && nomePendente(clienteInicial.nome)));
  const [nomeEditado, setNomeEditado] = useState(clienteInicial && !nomePendente(clienteInicial.nome) ? clienteInicial.nome : "");
  const [erroNome, setErroNome] = useState<string | null>(null);
  const [salvandoNome, iniciarNome] = useTransition();
  const [novoNome, setNovoNome] = useState("");
  const [novoTelefone, setNovoTelefone] = useState("");

  const [servicoIds, setServicoIds] = useState<string[]>([]);
  const chaveServicos = servicoIds.join(",");
  const escolhidos = servicoIds.flatMap((id) => servicos.find((s) => s.id === id) ?? []);
  const duracaoBase = escolhidos.reduce((t, s) => t + s.duracao_min, 0);
  const [respProfissionais, setRespProfissionais] = useState<{ chave: string; lista: ProfissionalDoServico[] } | null>(null);
  const profissionais = respProfissionais?.chave === chaveServicos ? respProfissionais.lista : [];
  const [profissionalEscolhido, setProfissionalId] = useState(ehOwner ? "" : meuProfissional.id);
  // owner: só vale a escolha que pertence à lista dos serviços atuais
  const profissionalId = !ehOwner || profissionais.some((p) => p.id === profissionalEscolhido) ? profissionalEscolhido : "";
  // com a profissional escolhida vale a duração dela (override); antes disso, a soma base
  const duracaoTotal = profissionais.find((p) => p.id === profissionalId)?.duracao_min ?? duracaoBase;

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

  // só quem faz TODOS os serviços escolhidos (durações/preços já somados pelo banco)
  useEffect(() => {
    if (!chaveServicos) return;
    let vivo = true;
    criarClienteNavegador()
      .rpc("profissionais_dos_servicos", { p_servico_ids: chaveServicos.split(",") })
      .then(({ data }) => {
        if (!vivo) return;
        const lista = (data ?? []) as ProfissionalDoServico[];
        setRespProfissionais({ chave: chaveServicos, lista });
        if (ehOwner) setProfissionalId((atual) => (lista.length === 1 ? lista[0].id : lista.some((p) => p.id === atual) ? atual : ""));
      });
    return () => {
      vivo = false;
    };
  }, [chaveServicos, ehOwner]);

  function selecionarCliente(c: { id: string; nome: string; whatsapp?: string }) {
    setCliente(c);
    setErroNome(null);
    const semNome = nomePendente(c.nome);
    setEditandoNome(semNome);
    setNomeEditado(semNome ? "" : c.nome);
  }

  function salvarNome() {
    if (!cliente) return;
    const nome = nomeEditado.trim();
    if (nome.length < 2 || nomePendente(nome)) {
      setErroNome("Digite o nome da cliente.");
      return;
    }
    setErroNome(null);
    iniciarNome(async () => {
      const r = await renomearCliente(cliente.id, nome);
      if (r.erro) {
        setErroNome(r.erro);
        return;
      }
      setCliente({ ...cliente, nome });
      setEditandoNome(false);
    });
  }

  function alterarServicos(novos: string[]) {
    setServicoIds(novos);
    setInicio(null);
  }

  function mover(i: number, delta: number) {
    const novos = [...servicoIds];
    const j = i + delta;
    if (j < 0 || j >= novos.length) return;
    [novos[i], novos[j]] = [novos[j], novos[i]];
    alterarServicos(novos);
  }

  const inicioEscolhido = modoLivre ? (horaLivre ? instanteLocal(diaLivre, horaLivre).toISOString() : null) : inicio;
  const clienteOk = modoCliente === "busca" ? Boolean(cliente) : novoNome.trim().length >= 2 && Boolean(paraE164(novoTelefone));
  const podeEnviar = clienteOk && servicoIds.length > 0 && profissionalId && inicioEscolhido;

  function enviar() {
    if (!podeEnviar || !inicioEscolhido) return;
    setErro(null);
    iniciar(async () => {
      const r = await agendarPainel({
        clienteId: modoCliente === "busca" ? cliente!.id : null,
        novoNome: novoNome.trim(),
        novoWhatsapp: novoTelefone,
        profissionalId,
        servicoIds,
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
              setEditandoNome(false);
            }}
          >
            {modoCliente === "busca" ? "+ Cliente nova" : "Buscar cadastrada"}
          </button>
        }
      >
        {modoCliente === "busca" ? (
          cliente ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-input border border-accent/40 bg-blush/40 px-4 py-3">
                <span className="flex min-w-0 items-center gap-3 font-medium">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface font-display text-[13px] font-bold text-accent">
                    {nomePendente(cliente.nome) ? "?" : cliente.nome.charAt(0)}
                  </span>
                  <span className="min-w-0">
                    <span className={`block truncate ${nomePendente(cliente.nome) ? "italic text-ink-muted" : ""}`}>
                      {nomePendente(cliente.nome) ? "Sem nome cadastrado" : cliente.nome}
                    </span>
                    {cliente.whatsapp && (
                      <span className="block text-[12px] font-normal text-ink-muted">{exibirTelefone(cliente.whatsapp)}</span>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 gap-3 text-[13px] text-accent">
                  {!editandoNome && (
                    <button
                      type="button"
                      onClick={() => {
                        setNomeEditado(nomePendente(cliente.nome) ? "" : cliente.nome);
                        setErroNome(null);
                        setEditandoNome(true);
                      }}
                    >
                      Editar nome
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setCliente(null);
                      setEditandoNome(false);
                    }}
                  >
                    Trocar
                  </button>
                </span>
              </div>
              {editandoNome && (
                <div
                  className={`space-y-2 rounded-input border p-3 ${
                    nomePendente(cliente.nome) ? "border-gold bg-gold-soft/20" : "border-line bg-base"
                  }`}
                >
                  {nomePendente(cliente.nome) && (
                    <p className="text-[13px] font-medium text-gold-ink">Essa cliente ainda está sem nome. Como ela se chama?</p>
                  )}
                  <Campo
                    rotulo="Nome da cliente"
                    value={nomeEditado}
                    onChange={(e) => setNomeEditado(e.target.value)}
                    autoComplete="off"
                    autoFocus
                    maxLength={120}
                    erro={erroNome ?? undefined}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        salvarNome();
                      }
                    }}
                  />
                  <div className="flex gap-2">
                    <Botao className="flex-1" disabled={salvandoNome} onClick={salvarNome}>
                      {salvandoNome ? "Salvando…" : "Salvar nome"}
                    </Botao>
                    {!nomePendente(cliente.nome) && (
                      <Botao variante="fantasma" disabled={salvandoNome} onClick={() => setEditandoNome(false)}>
                        Cancelar
                      </Botao>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <Campo rotulo="Buscar por nome ou WhatsApp" value={busca} onChange={(e) => setBusca(e.target.value)} autoComplete="off" />
              {resultados.length > 0 && (
                <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                  {resultados.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="flex w-full justify-between gap-3 px-4 py-2.5 text-left hover:bg-base"
                        onClick={() => selecionarCliente(c)}
                      >
                        <span className={`truncate ${nomePendente(c.nome) ? "italic text-ink-muted" : ""}`}>
                          {nomePendente(c.nome) ? "Sem nome" : c.nome}
                        </span>
                        <span className="shrink-0 text-[13px] text-ink-muted">{exibirTelefone(c.whatsapp)}</span>
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

      <Etapa numero={2} titulo="Serviços e profissional" feita={Boolean(servicoIds.length && profissionalId)}>
        {escolhidos.length > 0 && (
          <ol className="space-y-2" aria-label="Serviços escolhidos">
            {escolhidos.map((s, i) => (
              <li key={s.id} className="flex items-center gap-1 rounded-input border border-line bg-base py-1.5 pr-1 pl-3 text-[14px]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {i + 1}. {s.nome}
                  </span>
                  <span className="text-[12px] text-ink-muted">{duracao(s.duracao_min)}</span>
                </span>
                {escolhidos.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label={`Subir ${s.nome}`}
                      disabled={i === 0}
                      className="flex h-9 w-9 items-center justify-center text-ink-muted disabled:opacity-25"
                      onClick={() => mover(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Descer ${s.nome}`}
                      disabled={i === escolhidos.length - 1}
                      className="flex h-9 w-9 items-center justify-center text-ink-muted disabled:opacity-25"
                      onClick={() => mover(i, 1)}
                    >
                      ↓
                    </button>
                  </>
                )}
                <button
                  type="button"
                  aria-label={`Remover ${s.nome}`}
                  className="flex h-9 w-9 items-center justify-center text-[18px] text-accent"
                  onClick={() => alterarServicos(servicoIds.filter((id) => id !== s.id))}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        )}
        {servicoIds.length < MAX_SERVICOS ? (
          <Selecao
            rotulo={servicoIds.length ? "Adicionar outro serviço" : "Serviço"}
            value=""
            onChange={(e) => e.target.value && alterarServicos([...servicoIds, e.target.value])}
          >
            <option value="">Escolha…</option>
            {servicos
              .filter((s) => !servicoIds.includes(s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome} · {duracao(s.duracao_min)}
                </option>
              ))}
          </Selecao>
        ) : (
          <p className="text-[12px] text-ink-muted">Máximo de {MAX_SERVICOS} serviços por agendamento.</p>
        )}
        {servicoIds.length > 1 && (
          <p className="flex justify-between border-t border-line pt-2 text-[14px]">
            <span className="text-ink-muted">Duração total (em sequência)</span>
            <strong>{duracao(duracaoTotal)}</strong>
          </p>
        )}
        {ehOwner ? (
          servicoIds.length > 0 && (
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
        {ehOwner && servicoIds.length > 0 && respProfissionais?.chave === chaveServicos && profissionais.length === 0 && (
          <Caixa>
            {servicoIds.length > 1
              ? "Nenhuma profissional ativa faz todos esses serviços juntos. Tire algum ou vincule em Equipe."
              : "Nenhuma profissional ativa faz esse serviço. Vincule em Equipe ou em Serviços."}
          </Caixa>
        )}
      </Etapa>

      {servicoIds.length > 0 && profissionalId && (
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
              servicoIds={servicoIds}
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
