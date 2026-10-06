/* Módulo REIDI — hoje mostra apenas "Em Desenvolvimento".
   Tela: index.html → <main data-view="reidi">   ·   Menu: js/core/main.js → MODS (id 'reidi')

   MÓDULO ISOLADO: todo o código fica dentro da função abaixo, então nomes como render, T, D, sum...
   podem ser usados aqui sem colidir com o Fundo de Reserva ou com outros módulos.
   Do núcleo (js/core/app.js) pode usar: $ (seletor), f (moeda), p (percentual), br (data), N (texto sem acento),
   e as variáveis globais ROLE ('admin'/'viewer') e ME (usuário logado).
   Para o HTML poder chamar uma função (onclick="reidiSalvar()"), exponha-a em window, com o prefixo "reidi". */
(() => {
  'use strict';

  const VIEW = document.querySelector('[data-view="reidi"]'); // a tela deste módulo

  // ----- estado privado do módulo -----
  // let dados = [];

  // ----- funções do módulo -----
  // function render() { /* desenha a tela dentro de VIEW */ }

  // ----- o que o HTML precisa chamar (onclick etc.) -----
  // window.reidiSalvar = () => { /* ... */ };
})();
