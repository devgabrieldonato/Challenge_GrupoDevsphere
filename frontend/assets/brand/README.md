# Marcas fornecidas para o Paciente Virtual

A evolução integrada do Paciente Virtual está na `main`. Consulte o
[relatório do merge de 25/10/2026](../../../docs/MERGE_NEXT_2026_MAIN.md) para o estado
verificado e as pendências, incluindo geração real reservada ao Windows.

Imagens fornecidas pelo usuário em 20/10/2026, copiadas sem edição, recorte,
recoloração ou alteração de transparência. Dimensões e proporções originais:

- `fiap.png`: 500×500, SHA-256 `0f0fcb736ea72cfb96dbcfd2d8c732b80e858ad5226cfa89f352fcd635492e32`.
- `moinhos_de_vento.png`: 500×233, SHA-256 `4e1bf0076a12734a9c8070f4995d1e0b90b055e54937c1e761870d2f1f7184a1`.

A composição FIAP + Faculdade Moinhos de Vento — Paciente Virtual é feita por
HTML/CSS, sem gerar uma nova imagem. O cabeçalho transparente exibe apenas as
marcas e o nome Paciente Virtual ampliado ao lado. Os nomes das instituições
continuam disponíveis pelos textos alternativos das imagens.

`object-fit: contain` preserva as proporções. No tema escuro, o filtro CSS
`brightness(0) invert(1)` apresenta as duas marcas em branco para legibilidade,
sem modificar os PNGs originais. Na impressão, o filtro é removido.
