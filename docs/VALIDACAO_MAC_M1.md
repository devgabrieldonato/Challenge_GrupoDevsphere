# Validação no MacBook Air M1 — 22/10/2026

## Decisão para apresentação: C

Adiar a geração integral local com Qwen3:8b e Gemma3:4b neste equipamento de 8 GB. O usuário relatou travamento completo e reinício durante o teste real. Não houve caso completo ou aprovação clínica. A causa exata não foi confirmada: não atribuir OOM sem evidência.

## Entregas preservadas

- Extração geométrica separa grades reais do texto e evita duplicar molduras. Não elimina repetições globais; layouts ambíguos exigem revisão.
- Texto nativo curto não é substituído automaticamente por OCR. Páginas sem texto continuam utilizando OCR.
- Prévia autenticada de orçamento na fila, calculada pelo worker com a mesma preparação da geração. Não realiza inferência.
- Erros determinísticos de contexto não são reenviados automaticamente.
- Instrumento de medição somente leitura, sem prompts ou conteúdo clínico nos relatórios.

## Evidência

| Etapa | Resultado |
| --- | --- |
| Conversão pela plataforma | 1.795 caracteres, antes 3.634; aproximadamente 2 s de fila e conversão, resolução de 1 s |
| Prévia do worker | 1.832 tokens estimados de entrada + 6.000 de saída; contexto 8.192; saldo 360 |
| Qwen | Trabalho chegou a running; sem resultado completo observado; Mac travou segundo relato do usuário |
| Gemma | Não observado; configuração separada 16.384/768, sem execução comprovada |
| Tempo total, tokens reais, pico de RAM, swap | Não disponíveis; relatório final não sobreviveu ao reinício |
| Testes anteriores ao incidente | 75 worker, 24 HTTP, 2 C++, 7 medidor passaram |

Limites do teste: Qwen 8.192/6.000, lote 64, timeout de 180 s por chamada. Não afirmar que o timeout foi atingido: a interrupção ocorreu antes de qualquer resultado final observado. A crítica foi configurada separadamente; não se comprovou que caberia em memória.

## Recuperação

Após reinício, API e worker estavam parados; o trabalho permanecia running. Somente esse trabalho foi cancelado por manutenção SQLite transacional, com backup consistente via sqlite3.backup e auditoria sem personificação de usuário. PDF, extrações anteriores e histórico foram preservados. Nenhuma migration aplicada, commit ou push realizado.

O medidor anterior só alertava pouca folga de memória e gravava o relatório ao encerrar. Isso não foi proteção suficiente. Para futura retomada, são pendências: checkpoints persistentes por amostra, watchdog independente e validado com carga sintética, política conservadora de interrupção e confirmação da causa com logs pertinentes. Não repetir inferência pesada automaticamente neste M1.

## O que apresentar

Apresentar os fluxos web já validados, envio autorizado, conversão e conferência do Markdown e prévia do orçamento. Explicar que a geração integral local está bloqueada neste equipamento. Não simular caso gerado nem apresentar conteúdo manual como saída dos modelos. Preservar a integração para teste futuro com capacidade adequada ou estratégia adicional explicitamente autorizada.

## Execução dos testes isolados

```bash
.venv-worker/bin/python -m unittest discover -s worker/tests
DEVSPHERE_TEST_API_BIN=/caminho/do/build/devsphere-api .venv-worker/bin/python -m unittest discover -s tools/tests -p test_next_http.py
.venv-worker/bin/python -m unittest discover -s tools/tests -p test_macos_measurement.py
```

Esses testes usam fixtures sintéticas; mocks de provedores existem apenas nos testes. Não executar benchmark real para reproduzir o travamento. API e worker não foram reiniciados após o incidente.

A prévia conta na quota compartilhada de trabalhos e não representa disponibilidade garantida de RAM. O botão Atualizar recria os cartões; alterações de entrada exigem nova prévia. Após geração, o worker reconfere orçamento e autorizações. Aprovação clínica continua sendo responsabilidade docente.

## Próxima validação — Windows: pendente

- [ ] Executar estas correções no Windows com 16 GB de RAM e RTX 3060 de 12 GB, quando disponível.
- [ ] Confirmar extração sem duplicação e orçamento calculado pelo worker atualizado.
- [ ] Executar fluxo real completo de José Almir: Qwen3:8b, validação de 18 perguntas/22 exames, crítica Gemma3:4b e salvamento em rascunho.
- [ ] Registrar configuração, tokens reais, duração, RAM, alocação GPU, falhas e responsividade.
- [ ] Testar repetibilidade somente após conclusão integral sem pressão preocupante.

Começar pelo contexto Qwen de 8.192 e saída de 6.000, registrando separadamente o Gemma. Execução da plataforma C++20/worker POSIX no Windows segue o roteiro WSL2 existente; benchmark Python nativo não comprova sozinho o fluxo web completo. As validações Windows anteriores permanecem históricas e não validam automaticamente este novo diff. Não há garantia antecipada de sucesso na RTX 3060. Não repetir inferência pesada no Mac para encerrar essa pendência.
