# Componentes visuais locais

O frontend continua HTML/CSS/JavaScript, sem etapa obrigatória de build Node.
Os arquivos abaixo são servidos pelo próprio projeto, respeitando a CSP local.

| Componente | Uso | Origem | Licença local |
| --- | --- | --- | --- |
| Bootstrap Grid 5.3.8 | Colunas, gutters e utilitários responsivos da entrada | [Pacote oficial](https://www.npmjs.com/package/bootstrap/v/5.3.8) | `bootstrap-5.3.8/LICENSE` |
| Bootstrap Icons 1.13.2 | Sol, lua/estrelas e seta de links | [Pacote oficial](https://www.npmjs.com/package/bootstrap-icons/v/1.13.2) | `bootstrap-icons-1.13.2/LICENSE` |

Somente o CSS da grade Bootstrap foi incluído; não são carregados seu JavaScript,
Reboot ou conjunto completo de componentes. Isso permite aproveitar o framework
sem alterar os contratos de formulários, diálogos e estilos de investigação.
`bootstrap-grid.min.css.map` acompanha a referência original do CSS para depuração.
Os SVGs oficiais são incluídos no HTML com `aria-hidden` e sem foco; o botão mantém
nome textual acessível e estado `aria-pressed`.

As versões vieram dos tarballs oficiais do registro npm. SHA-256 dos arquivos tgz:

- Bootstrap: `8b02d4a7482e0f0a2b1da58f1c9c86830e96cc2f77f094f89e4681b19886bc38`.
- Bootstrap Icons: `7b5960145e1ab14a49a117f96a9e5a54a94fdf07f21e302d9e4f88d73dd19f9c`.

A aparência institucional é definida em `../styles/institutional.css`, carregada
por último. Alterações futuras precisam repetir a matriz de temas/reflow/teclado
e os testes funcionais descritos em `../../docs/ACESSIBILIDADE_NEXT_2026.md`.
Os componentes preexistentes em outras subpastas, como PDFMake, são preservados.
