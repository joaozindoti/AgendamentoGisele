"use client";

import { limparCacheDePaginas } from "./pwa";
import { Botao } from "./ui";

export function BotaoSair() {
  return (
    <form
      action="/sair"
      method="post"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        await limparCacheDePaginas();
        form.submit();
      }}
    >
      <Botao type="submit" variante="fantasma">
        Sair
      </Botao>
    </form>
  );
}
