"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FiltroCategorias } from "@/components/catalogo";
import { SeletorHorario } from "@/components/seletor-horario";
import { AreaTexto, Botao, Caixa, Card, Eyebrow, Selo, Vazio } from "@/components/ui";
import { mensagemDeErro } from "@/lib/erros";
import { dataLonga, duracao, hora, preco } from "@/lib/formato";
import { criarClienteNavegador } from "@/lib/supabase/client";
import type { ProfissionalDoServico, Servico } from "@/lib/tipos";

type Etapa = 1 | 2 | 3 | 4;
const ROTULOS = ["Serviço", "Profissional", "Horário"];

export function FluxoAgendar({
  servicos,
  servicoInicial,
  diasMaximos,
}: {
  servicos: Servico[];
  servicoInicial: string | null;
  diasMaximos: number;
}) {
  const router = useRouter();
  const inicial = servicos.find((s) => s.id === servicoInicial) ?? null;
  const [etapa, setEtapa] = useState<Etapa>(inicial ? 2 : 1);
  const [servico, setServico] = useState<Servico | null>(inicial);
  const [categoria, setCategoria] = useState("todos");
  const [respProfissionais, setRespProfissionais] = useState<{ servicoId: string; lista: ProfissionalDoServico[] } | null>(null);
  const profissionais = servico && respProfissionais?.servicoId === servico.id ? respProfissionais.lista : null;
  const [profissional, setProfissional] = useState<ProfissionalDoServico | null>(null);
  const [inicio, setInicio] = useState<string | null>(null);
  const [observacoes, setObservacoes] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [versaoAgenda, setVersaoAgenda] = useState(0);

  useEffect(() => {
    if (!servico) return;
    let vivo = true;
    criarClienteNavegador()
      .rpc("profissionais_do_servico", { p_servico_id: servico.id })
      .then(({ data }) => {
        if (!vivo) return;
        const lista = (data ?? []) as ProfissionalDoServico[];
        setRespProfissionais({ servicoId: servico.id, lista });
        // Uma profissional só (caso da maioria dos serviços hoje): pula a escolha.
        if (lista.length === 1) {
          setProfissional(lista[0]);
          setEtapa((e) => (e === 2 ? 3 : e));
        }
      });
    return () => {
      vivo = false;
    };
  }, [servico]);

  function escolherServico(s: Servico) {
    setServico(s);
    setProfissional(null);
    setInicio(null);
  }

  async function confirmar() {
    if (!servico || !profissional || !inicio) return;
    setEnviando(true);
    setErro(null);
    const { error } = await criarClienteNavegador().rpc("agendar", {
      p_profissional_id: profissional.id,
      p_servico_id: servico.id,
      p_inicio: inicio,
      p_observacoes: observacoes || null,
    });
    if (error) {
      setEnviando(false);
      setErro(mensagemDeErro(error));
      // horário tomado por outra cliente nesse meio tempo: volta pra grade atualizada
      if (error.code === "23P01" || error.message?.includes("horario_indisponivel")) {
        setInicio(null);
        setVersaoAgenda((v) => v + 1);
        setEtapa(3);
      }
      return;
    }
    router.push("/cliente?aviso=agendado");
    router.refresh();
  }

  const categorias = [...new Set(servicos.map((s) => s.categoria).filter(Boolean))] as string[];
  const visiveis = categoria === "todos" ? servicos : servicos.filter((s) => s.categoria === categoria);
  const etapaVisual = Math.min(etapa, 3);

  return (
    <div className="pb-24">
      <header className="mb-4 flex items-center gap-2">
        {etapa > 1 && (
          <button
            type="button"
            aria-label="Voltar"
            className="-ml-2 px-2 text-[22px] text-ink-muted"
            onClick={() => setEtapa((e) => (e === 3 && profissionais?.length === 1 ? 1 : ((e - 1) as Etapa)))}
          >
            ‹
          </button>
        )}
        <div>
          <Eyebrow>Lindeza Premium</Eyebrow>
          <h1 className="text-[24px] font-semibold tracking-tight">Agendar horário</h1>
        </div>
      </header>

      <ol className="mb-5 flex items-center gap-2" aria-label="Etapas">
        {ROTULOS.map((r, i) => {
          const n = i + 1;
          const feito = etapaVisual > n;
          const atual = etapaVisual === n;
          return (
            <li key={r} className="flex flex-1 items-center gap-2">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${
                  atual ? "bg-accent text-white" : feito ? "bg-accent/15 text-accent" : "bg-surface text-ink-muted"
                }`}
              >
                {n}
              </span>
              <span className={`text-[12px] ${atual ? "font-semibold text-accent" : "text-ink-muted"}`}>{r}</span>
              {n < 3 && <span className="h-px flex-1 bg-line" />}
            </li>
          );
        })}
      </ol>

      {erro && (
        <div className="mb-4">
          <Caixa tipo="erro">{erro}</Caixa>
        </div>
      )}

      {etapa === 1 && (
        <>
          <FiltroCategorias categorias={categorias} ativa={categoria} aoTrocar={setCategoria} />
          <p className="mb-3 flex justify-between text-[13px] text-ink-muted">
            <span>Escolha o seu cuidado</span>
            <span>{visiveis.length} opções</span>
          </p>
          {visiveis.length === 0 ? (
            <Vazio>Nenhum serviço disponível no momento.</Vazio>
          ) : (
            <div className="space-y-3">
              {visiveis.map((s) => {
                const escolhido = servico?.id === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => escolherServico(s)}
                    aria-pressed={escolhido}
                    className={`block w-full rounded-card border bg-surface p-4 text-left transition-colors ${
                      escolhido ? "border-accent ring-1 ring-accent" : "border-line hover:border-accent/60"
                    }`}
                  >
                    {s.destaque && <Selo>Premium</Selo>}
                    <p className="mt-1 text-[18px] leading-snug font-semibold">{s.nome}</p>
                    {s.descricao && <p className="mt-1 text-[14px] text-ink-muted">{s.descricao}</p>}
                    <p className="mt-3 flex justify-between border-t border-line pt-2 text-[14px]">
                      <span className="text-ink-muted">{duracao(s.duracao_min)}</span>
                      <span className="font-semibold text-gold-ink">{preco(s.preco)}</span>
                    </p>
                  </button>
                );
              })}
            </div>
          )}
          {servico && (
            <BarraContinuar
              resumo={servico.nome}
              valor={preco(servico.preco)}
              aoContinuar={() => setEtapa(profissionais?.length === 1 ? 3 : 2)}
            />
          )}
        </>
      )}

      {etapa === 2 && servico && (
        <>
          <ResumoEscolha rotulo="Serviço" valor={servico.nome} aoTrocar={() => setEtapa(1)} />
          <p className="mb-3 text-[14px] font-medium">Com quem você quer ser atendida?</p>
          {profissionais === null ? (
            <p className="text-[13px] text-ink-muted">Carregando…</p>
          ) : profissionais.length === 0 ? (
            <Vazio>Esse serviço está sem profissional disponível agora. Fale com o studio pelo WhatsApp.</Vazio>
          ) : (
            <div className="space-y-3">
              {profissionais.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setProfissional(p);
                    setInicio(null);
                    setEtapa(3);
                  }}
                  className="flex w-full items-center gap-3 rounded-card border border-line bg-surface p-4 text-left hover:border-accent"
                >
                  <Avatar nome={p.nome} foto={p.foto_url} />
                  <span className="flex-1">
                    <span className="block text-[16px] font-semibold">{p.nome}</span>
                    {p.bio && <span className="block text-[13px] text-ink-muted line-clamp-2">{p.bio}</span>}
                  </span>
                  <span className="text-right text-[13px]">
                    <span className="block font-semibold text-gold-ink">{preco(p.preco)}</span>
                    <span className="text-ink-muted">{duracao(p.duracao_min)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {etapa === 3 && servico && profissional && (
        <>
          <ResumoEscolha rotulo="Serviço" valor={servico.nome} aoTrocar={() => setEtapa(1)} />
          <ResumoEscolha
            rotulo="Profissional"
            valor={profissional.nome}
            aoTrocar={profissionais && profissionais.length > 1 ? () => setEtapa(2) : undefined}
          />
          <SeletorHorario
            profissionalId={profissional.id}
            servicoId={servico.id}
            diasMaximos={diasMaximos}
            valor={inicio}
            aoEscolher={setInicio}
            versao={versaoAgenda}
          />
          {inicio && (
            <BarraContinuar
              resumo={`${dataLonga(new Date(inicio))}`}
              valor={hora(new Date(inicio))}
              aoContinuar={() => {
                setErro(null);
                setEtapa(4);
              }}
            />
          )}
        </>
      )}

      {etapa === 4 && servico && profissional && inicio && (
        <Card className="p-5">
          <Eyebrow>Confira seu agendamento</Eyebrow>
          <p className="mt-2 text-[22px] leading-snug font-semibold">{servico.nome}</p>
          <dl className="mt-3 space-y-1 text-[15px]">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Com</dt>
              <dd>{profissional.nome}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Quando</dt>
              <dd className="text-right">
                {dataLonga(new Date(inicio))} · {hora(new Date(inicio))}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Duração</dt>
              <dd>{duracao(profissional.duracao_min)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Valor</dt>
              <dd className="font-semibold text-gold-ink">{preco(profissional.preco)}</dd>
            </div>
          </dl>
          <AreaTexto
            rotulo="Observações (opcional)"
            className="mt-4"
            maxLength={500}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Alguma informação que a profissional precisa saber?"
          />
          <Botao largo className="mt-5" onClick={confirmar} disabled={enviando}>
            {enviando ? "Confirmando…" : "Confirmar agendamento"}
          </Botao>
          <Botao largo variante="fantasma" className="mt-2" onClick={() => setEtapa(3)} disabled={enviando}>
            Trocar horário
          </Botao>
        </Card>
      )}
    </div>
  );
}

function ResumoEscolha({ rotulo, valor, aoTrocar }: { rotulo: string; valor: string; aoTrocar?: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between border-b border-line pb-2 text-[14px]">
      <span>
        <span className="text-ink-muted">{rotulo}: </span>
        <strong className="font-semibold">{valor}</strong>
      </span>
      {aoTrocar && (
        <button type="button" onClick={aoTrocar} className="text-accent">
          Trocar
        </button>
      )}
    </div>
  );
}

function BarraContinuar({ resumo, valor, aoContinuar }: { resumo: string; valor: string; aoContinuar: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 px-4">
      <div className="mx-auto flex max-w-xl items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-[var(--shadow-overlay)]">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-ink">{resumo}</p>
          <p className="text-[15px] font-semibold text-gold-ink">{valor}</p>
        </div>
        <Botao onClick={aoContinuar}>Continuar →</Botao>
      </div>
    </div>
  );
}

export function Avatar({ nome, foto }: { nome: string; foto: string | null }) {
  if (foto) {
    return (
      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-base">
        <Image src={foto} alt="" fill sizes="48px" className="object-cover" />
      </span>
    );
  }
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-base text-[18px] font-semibold text-accent">
      {nome.charAt(0)}
    </span>
  );
}
