/* Módulo Fluxo de Caixa — hoje mostra apenas "Em Desenvolvimento".
   Tela: index.html → <main data-view="fluxo">   ·   Menu: js/core/main.js → MODS (id 'fluxo')

   MÓDULO ISOLADO: todo o código fica dentro da função abaixo, então nomes como render, T, D, sum...
   podem ser usados aqui sem colidir com o Fundo de Reserva ou com outros módulos.
   Do núcleo (js/core/app.js) pode usar: $ (seletor), f (moeda), p (percentual), br (data), N (texto sem acento),
   e as variáveis globais ROLE ('admin'/'viewer') e ME (usuário logado).
   Para o HTML poder chamar uma função (onclick="fluxoSalvar()"), exponha-a em window, com o prefixo "fluxo". */
(() => {
  'use strict';

  const VIEW = document.querySelector('[data-view="fluxo"]'); // a tela deste módulo

  // ----- estado privado do módulo -----
  // let dados = [];

  // ----- funções do módulo -----
  // function render() { /* desenha a tela dentro de VIEW */ }

  // ----- o que o HTML precisa chamar (onclick etc.) -----
  // window.fluxoSalvar = () => { /* ... */ };
})();
