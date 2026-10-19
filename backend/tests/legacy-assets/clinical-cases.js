/* Catálogos clínicos compartilhados entre as jornadas de aluno e professor. */
// CATÁLOGO CLÍNICO — JOÃO
// ----------------------------------------------------------------------
// Catálogo de João: cada pergunta ou exame reúne resposta simulada e orientação de feedback. O campo parent libera opções após uma escolha anterior.
const joaoItems = [
  {
    id: "pain",
    type: "question",
    title: "Onde dói e como é a dor?",
    answer:
      "“É um aperto forte bem no meio do peito, intensidade 8 de 10.”",
    quality: "Pertinente",
    why: "Caracteriza a dor e ajuda a estimar a possibilidade de origem cardíaca.",
  },
  {
    id: "start",
    type: "question",
    title: "O que fazia quando a dor começou?",
    answer:
      "“Começou quando eu estava subindo as escadas, há uns 40 minutos.”",
    quality: "Pertinente",
    why: "Investiga o início e a relação da dor com o esforço.",
  },
  {
    id: "vitals",
    type: "exam",
    title: "Avaliar sinais vitais",
    answer:
      "PA 150/95 mmHg · FC 104 bpm · FR 22 irpm · SpO₂ 95% em ar ambiente · temperatura 36,5 °C.",
    quality: "Prioritário",
    why: "A avaliação inicial de estabilidade deve ocorrer precocemente, junto à investigação.",
  },
  {
    id: "ecg",
    type: "exam",
    title: "Solicitar ECG de 12 derivações",
    answer:
      "Ritmo sinusal. Supradesnivelamento de ST de 2 mm em DII, DIII e aVF, com infradesnivelamento recíproco em DI e aVL.",
    quality: "Prioritário",
    why: "ECG deve ser obtido e interpretado rapidamente (idealmente até 10 minutos). Neste caso, indica provável infarto inferior com supra de ST.",
  },
  {
    id: "associated",
    type: "question",
    title: "Sente falta de ar ou outros sintomas?",
    answer: "“Sim. Estou com falta de ar, enjoo e suando frio.”",
    quality: "Pertinente",
    why: "Sintomas associados reforçam a suspeita de síndrome coronariana aguda.",
  },
  {
    id: "troponin",
    type: "exam",
    title: "Dosar troponina de alta sensibilidade",
    answer:
      "Amostra inicial: 12 ng/L (limite superior do ensaio fictício: 19 ng/L). Coleta precoce, cerca de 40 minutos após o início da dor.",
    quality: "Pertinente",
    why: "Valor inicial abaixo do limite não exclui infarto precoce. Com ECG diagnóstico, não se deve aguardar troponina para acionar o atendimento urgente.",
  },
  {
    id: "radiation",
    parent: "pain",
    type: "question",
    title: "A dor se espalha para outro lugar?",
    answer: "“Vai para o braço esquerdo e um pouco para a mandíbula.”",
    quality: "Pertinente",
    why: "A irradiação é compatível com dor de possível origem cardíaca.",
  },
  {
    id: "palpation",
    parent: "pain",
    type: "exam",
    title: "Palpar a parede torácica",
    answer:
      "A palpação não reproduz a dor. O paciente permanece com dor em aperto.",
    quality: "Complementar",
    why: "Ajuda no diagnóstico diferencial, mas isoladamente não confirma ou exclui síndrome coronariana.",
  },
  {
    id: "rest",
    parent: "start",
    type: "question",
    title: "A dor melhorou com o repouso?",
    answer: "“Parei e sentei, mas a dor não passou. Continua forte.”",
    quality: "Pertinente",
    why: "Dor persistente apesar do repouso é um sinal de alerta e desfavorece angina estável.",
  },
  {
    id: "previous",
    parent: "start",
    type: "question",
    title: "Já sentiu algo parecido antes?",
    answer:
      "“Já tive um aperto mais leve ao caminhar, mas passava em poucos minutos. Desta vez não passou.”",
    quality: "Pertinente",
    why: "A mudança do padrão habitual aumenta a suspeita de uma condição aguda.",
  },
  {
    id: "lung",
    parent: "associated",
    type: "exam",
    title: "Realizar ausculta pulmonar",
    answer:
      "Murmúrio vesicular presente bilateralmente, sem estertores ou sibilos.",
    quality: "Complementar",
    why: "Integra a avaliação física e busca sinais de congestão e causas alternativas.",
  },
  {
    id: "right",
    parent: "ecg",
    type: "exam",
    title: "Obter derivações direitas (V3R–V4R)",
    answer:
      "Sem supradesnivelamento significativo nas derivações direitas neste traçado simulado.",
    quality: "Pertinente",
    why: "No contexto de infarto inferior, ajuda a investigar comprometimento do ventrículo direito, sem atrasar o atendimento urgente.",
  },
  {
    id: "serial",
    parent: "troponin",
    type: "exam",
    title: "Consultar segunda dosagem de troponina",
    answer:
      "Amostra de 2 horas: 186 ng/L. Dado futuro disponibilizado para fins didáticos; não representa espera na simulação.",
    quality: "Complementar",
    why: "A elevação dinâmica sustenta lesão miocárdica aguda. O ECG deste caso já demanda ação urgente, sem esperar esta amostra.",
  },
  {
    id: "exercise",
    parent: "rest",
    type: "exam",
    title: "Solicitar teste ergométrico agora",
    answer:
      "Exame não realizado: dor torácica aguda persistente exige avaliação urgente antes de qualquer teste de esforço.",
    quality: "Inadequado neste momento",
    why: "Não é apropriado submeter este paciente com suspeita de síndrome coronariana aguda a esforço.",
  },
  {
    id: "pleuritic",
    type: "question",
    title: "A dor muda ao respirar ou mudar de posição?",
    answer: "“Respirar fundo ou me inclinar não muda o aperto.”",
    quality: "Pertinente",
    why: "Explora causas pleurais e pericárdicas; a ausência dessas características não as exclui isoladamente.",
  },
  {
    id: "digestive",
    type: "question",
    title: "Há azia ou relação com as refeições?",
    answer:
      "“Tenho azia depois de refeições pesadas, mas hoje é um aperto diferente, sem queimação.”",
    quality: "Pertinente",
    why: "Compara o sintoma atual com sintomas prévios. História de refluxo pode coexistir com uma emergência cardíaca.",
  },
  {
    id: "risk",
    type: "question",
    title: "Tem doenças ou histórico cardíaco na família?",
    answer:
      "“Tenho pressão alta e colesterol alto. Meu pai teve um infarto aos 58 anos.”",
    quality: "Pertinente",
    why: "Ajuda a contextualizar risco cardiovascular; fatores de risco não substituem a avaliação da queixa aguda.",
  },
  {
    id: "meds",
    type: "question",
    title: "Quais medicamentos usa e tem alergias?",
    answer:
      "“Uso losartana. Parei a sinvastatina faz meses. Não conheço nenhuma alergia.”",
    quality: "Pertinente",
    why: "Reconciliação de medicamentos e alergias informa a segurança do atendimento.",
  },
  {
    id: "thrombotic",
    type: "question",
    title: "Teve cirurgia, imobilização ou trombose recente?",
    answer:
      "“Não fiz cirurgia, não fiquei de cama e nunca tive trombose. Também não tenho câncer em tratamento.”",
    quality: "Pertinente",
    why: "Investiga fatores de risco para tromboembolismo. A ausência deles não exclui embolia por si só.",
  },
  {
    id: "sudden",
    type: "question",
    title: "A dor foi máxima de repente ou aumentou aos poucos?",
    answer:
      "“Foi aumentando durante alguns minutos. Não foi uma dor que explodiu de uma vez.”",
    quality: "Pertinente",
    why: "Início abrupto e máximo desde o primeiro instante pode orientar a investigação de síndrome aórtica, entre outras causas.",
  },
  {
    id: "xray",
    type: "exam",
    title: "Solicitar radiografia de tórax",
    answer:
      "Sem pneumotórax, consolidação ou congestão pulmonar evidente. Mediastino sem alargamento aparente. Laudo simulado.",
    quality: "Complementar",
    why: "Pode ajudar em diagnósticos diferenciais. Radiografia sem alterações não exclui infarto, embolia ou dissecção, nem deve atrasar o ECG.",
  },
  {
    id: "ddimer",
    type: "exam",
    title: "Dosar D-dímero",
    answer:
      "780 ng/mL FEU (referência do ensaio fictício: abaixo de 500 ng/mL FEU). Resultado elevado e inespecífico.",
    quality: "Indicação dependente do contexto",
    why: "É útil em estratégias para excluir embolia com probabilidade clínica apropriada. Resultado positivo isolado não confirma embolia e não justifica abandonar a avaliação coronariana.",
  },
  {
    id: "cbc",
    type: "exam",
    title: "Solicitar hemograma",
    answer:
      "Hemoglobina 14,5 g/dL; leucócitos 11.200/mm³; plaquetas 245.000/mm³.",
    quality: "Complementar",
    why: "Investiga anemia e fornece dados basais. Leucocitose discreta pode ocorrer por estresse; isoladamente não comprova infecção.",
  },
  {
    id: "renal",
    type: "exam",
    title: "Dosar creatinina e eletrólitos",
    answer:
      "Creatinina 1,0 mg/dL; sódio 139 mEq/L; potássio 4,2 mEq/L.",
    quality: "Complementar",
    why: "Ajuda a planejar cuidados e avaliar risco de alterações eletrolíticas; não define a causa da dor e não deve atrasar medidas urgentes.",
  },
  {
    id: "ckmb",
    type: "exam",
    title: "Dosar CK-MB junto à troponina",
    answer:
      "CK-MB massa 3,1 ng/mL (referência do ensaio fictício: abaixo de 5 ng/mL), na amostra inicial.",
    quality: "Baixo valor adicional",
    why: "Com troponina disponível, CK-MB geralmente não acrescenta valor diagnóstico. Um resultado inicial abaixo do limite não exclui infarto.",
  },
  {
    id: "coronaryct",
    type: "exam",
    title: "Solicitar angiotomografia coronariana",
    answer:
      "Solicitação registrada. Exame não executado nesta simulação de atendimento inicial; requer seleção clínica e avaliação de elegibilidade.",
    quality: "Inadequado para o desfecho deste caso",
    why: "É opção em perfis selecionados, como risco intermediário. Com ECG indicativo de infarto com supra, não deve substituir ou atrasar a estratégia urgente de reperfusão.",
  },
  {
    id: "echo",
    type: "exam",
    title: "Realizar ecocardiograma à beira do leito",
    answer:
      "Hipocinesia da parede inferior do ventrículo esquerdo. Sem derrame pericárdico; ventrículo direito sem dilatação importante.",
    quality: "Complementar",
    why: "Avalia função e complicações, e pode apoiar casos duvidosos. Neste cenário, não deve atrasar a resposta ao ECG diagnóstico.",
  },
  {
    id: "cardiac",
    type: "exam",
    title: "Realizar ausculta cardíaca",
    answer:
      "Bulhas rítmicas, taquicardia, sem sopro ou atrito pericárdico audível.",
    quality: "Pertinente",
    why: "Integra o exame inicial. A ausência de sopro ou atrito não exclui causas cardiovasculares graves.",
  },
  {
    id: "cough",
    type: "question",
    title: "Tem febre, tosse ou sangue no escarro?",
    answer: "“Não tive febre, não estou tossindo nem saiu sangue.”",
    quality: "Pertinente",
    why: "Explora infecção e embolia no diagnóstico diferencial da dispneia. Respostas negativas não excluem todas as causas.",
    parent: "associated",
  },
  {
    id: "syncope",
    type: "question",
    title: "Teve palpitações, tontura ou desmaio?",
    answer:
      "“Fiquei um pouco tonto, mas não desmaiei nem percebi o coração disparar antes da dor.”",
    quality: "Pertinente",
    why: "Pode identificar sinais de instabilidade e arritmia e contextualizar a sequência dos sintomas.",
    parent: "associated",
  },
  {
    id: "leg",
    type: "exam",
    title: "Examinar as pernas em busca de sinais de trombose",
    answer:
      "Sem edema unilateral, assimetria evidente ou dor à palpação das panturrilhas.",
    quality: "Complementar",
    why: "Sinais de trombose podem aumentar a suspeita de embolia. Exame normal das pernas não a exclui.",
    parent: "thrombotic",
  },
  {
    id: "pulmonaryct",
    type: "exam",
    title: "Solicitar angiotomografia de artérias pulmonares",
    answer:
      "Solicitação registrada; sem imagem neste MVP. A decisão requer avaliação da probabilidade de embolia e da prioridade clínica.",
    quality: "Indicação dependente do contexto",
    why: "Não é rastreamento universal para dor torácica. D-dímero elevado isoladamente não define indicação; considerar a probabilidade clínica e o ECG deste caso.",
    parent: "thrombotic",
  },
  {
    id: "back",
    type: "question",
    title:
      "A dor vai para as costas? Houve fraqueza ou dificuldade para falar?",
    answer:
      "“Não vai para as costas. Não senti fraqueza de um lado nem dificuldade para falar.”",
    quality: "Pertinente",
    why: "Procura elementos de síndrome aórtica e comprometimento neurológico; respostas negativas não excluem dissecção.",
    parent: "sudden",
  },
  {
    id: "pulses",
    type: "exam",
    title: "Comparar pulsos e pressão nos dois braços",
    answer:
      "Pulsos radiais palpáveis e simétricos. PA direita 150/95 mmHg; esquerda 148/94 mmHg.",
    quality: "Complementar",
    why: "Assimetria pode reforçar suspeita de síndrome aórtica. Simetria não exclui essa condição.",
    parent: "sudden",
  },
  {
    id: "antacid",
    type: "question",
    title: "Já usou antiácido para episódios semelhantes?",
    answer:
      "“Usei para a azia e melhorou. Não tomei nada para esta dor.”",
    quality: "Complementar",
    why: "Evita confundir sintomas prévios com o episódio atual. Resposta a antiácido não é teste para excluir origem cardíaca.",
    parent: "digestive",
  },
  {
    id: "lipids",
    type: "exam",
    title: "Solicitar perfil lipídico",
    answer:
      "Colesterol total 244 mg/dL; LDL 166 mg/dL; HDL 36 mg/dL; triglicerídeos 210 mg/dL. Dados simulados.",
    quality: "Menor prioridade na investigação inicial",
    why: "É útil para planejamento preventivo, mas não esclarece a causa da dor aguda nem deve preceder sua avaliação.",
    parent: "risk",
  },
  {
    id: "smoking",
    type: "question",
    title: "Há quanto tempo fuma e quantos cigarros por dia?",
    answer: "“Um maço por dia desde os 24 anos.”",
    quality: "Pertinente",
    why: "Quantifica a exposição, aproximadamente 30 anos-maço, sem determinar sozinho o diagnóstico.",
    parent: "risk",
  },
  {
    id: "stimulants",
    type: "question",
    title: "Usou cocaína, anfetaminas ou outros estimulantes?",
    answer: "“Não usei essas substâncias.”",
    quality: "Pertinente",
    why: "Investiga exposições relacionadas a isquemia e arritmias sem presumir uso a partir da aparência do paciente.",
    parent: "meds",
  },
  {
    id: "oldECG",
    type: "exam",
    title: "Comparar com um ECG anterior disponível",
    answer:
      "Traçado de consulta de 6 meses atrás: sem as alterações de ST presentes no ECG atual.",
    quality: "Complementar",
    why: "Comparação apoia o caráter novo das alterações, mas procurar traçados prévios não deve atrasar o atendimento.",
    parent: "ecg",
  },
  {
    id: "holter",
    type: "exam",
    title: "Solicitar Holter de 24 horas",
    answer:
      "Solicitação registrada; sem resultado no atendimento inicial. Monitorização ambulatorial exige instalação e registro prolongado.",
    quality: "Baixa prioridade neste cenário",
    why: "Holter investiga arritmias em contextos selecionados. Não substitui ECG imediato ou monitorização durante uma suspeita de síndrome coronariana aguda.",
    parent: "syncope",
  },
];

// CASO CLÍNICO — MARINA
// ----------------------------------------------------------------------
// Metadados do caso de Marina: identificação, hipóteses, evidências esperadas, catálogo e orientações didáticas.
const marinaCase = {
  id: "marina",
  name: "Marina",
  age: 23,
  initials: "MS",
  complaint:
    "“Estou com muita dor na barriga e vomitando desde a madrugada.”",
  onset: "Dor abdominal há 18 horas",
  tags: ["23 anos", "Dor abdominal", "Vômitos"],
  caseLabel: "Marina, 23 anos — dor abdominal",
  exportLabel: "Marina, 23 anos — dor abdominal e vômitos",
  correctHypothesis: "dka",
  // Alternativas exibidas na conclusão do atendimento de Marina.
  hypotheses: [
    { value: "dka", label: "Cetoacidose diabética" },
    { value: "gastroenteritis", label: "Gastroenterite aguda" },
    { value: "appendicitis", label: "Apendicite aguda" },
    { value: "pancreatitis", label: "Pancreatite aguda" },
    { value: "ectopic", label: "Gestação ectópica" },
    { value: "pyelonephritis", label: "Pielonefrite aguda" },
    { value: "hhs", label: "Estado hiperglicêmico hiperosmolar" },
    { value: "starvation", label: "Cetose de jejum" },
    { value: "alcoholic", label: "Cetoacidose alcoólica" },
  ],
  outcome:
    "cetoacidose diabética como apresentação inicial de diabetes mellitus",
  evidenceSummary:
    "Hiperglicemia, beta-hidroxibutirato de 5,6 mmol/L e acidose metabólica sustentam o desfecho. Sede, poliúria, perda de peso e desidratação completam o quadro. O tipo de diabetes ainda requer investigação.",
  clinicalGuidance:
    "Acione a equipe e priorize estabilização, monitorização e protocolo institucional de cetoacidose. Reavalie a dor abdominal e procure precipitantes; não aguarde exames complementares eletivos. A classificação do diabetes fica para investigação posterior.",
  // Metadados de prioridades e evidências; o feedback consulta evidenceIds e priorityId.
  priorityIds: ["vitals", "glucose", "ketones", "gas"],
  evidenceIds: ["glucose", "ketones", "gas"],
  priorityId: "glucose",
  priorityLabel: "Glicemia",
  // Catálogo de Marina, com perguntas, exames e dependências próprias do caso.
  items: [
    {
      id: "pain",
      type: "question",
      title: "Onde é a dor e como ela é?",
      answer: "“Dói a barriga toda, em cólica, intensidade 7 de 10.”",
      quality: "Pertinente",
      why: "Caracteriza a queixa abdominal.",
    },
    {
      id: "onset",
      type: "question",
      title: "Quando a dor começou?",
      answer:
        "“Começou ontem à noite, há umas 18 horas, e foi aumentando.”",
      quality: "Pertinente",
      why: "Define a evolução temporal.",
    },
    {
      id: "vomiting",
      type: "question",
      title: "Teve náuseas ou vômitos?",
      answer:
        "“Vomitei cinco vezes desde a madrugada, sem sangue. Quase não consigo beber água.”",
      quality: "Pertinente",
      why: "Avalia perdas e tolerância à ingestão.",
    },
    {
      id: "thirst",
      type: "question",
      title: "Está sentindo mais sede?",
      answer:
        "“Há umas três semanas sinto muita sede, mesmo bebendo água o dia todo.”",
      quality: "Pertinente",
      why: "Busca sintomas anteriores à dor.",
    },
    {
      id: "urine",
      type: "question",
      title: "Mudou a quantidade de urina?",
      answer:
        "“Estou urinando muito, até de madrugada, há três semanas.”",
      quality: "Pertinente",
      why: "Contextualiza a perda de líquidos.",
    },
    {
      id: "weight",
      type: "question",
      title: "Percebeu mudança de peso ou apetite?",
      answer:
        "“Perdi uns cinco quilos no último mês, mesmo comendo normalmente até ontem.”",
      quality: "Pertinente",
      why: "Investiga mudanças anteriores ao episódio agudo.",
    },
    {
      id: "fever",
      type: "question",
      title: "Teve febre ou sintomas de infecção?",
      answer: "“Não tive febre, tosse nem dor de garganta.”",
      quality: "Pertinente",
      why: "Explora possíveis fatores precipitantes sem excluir infecção apenas pela história.",
    },
    {
      id: "meds",
      type: "question",
      title: "Usa medicamentos ou tem alergias?",
      answer:
        "“Só uso anticoncepcional. Não uso remédio para diabetes, corticoide ou suplemento. Não conheço alergias.”",
      quality: "Pertinente",
      why: "Registra exposições e alergias.",
    },
    {
      id: "history",
      type: "question",
      title: "Tem alguma doença ou episódio parecido?",
      answer:
        "“Nunca recebi diagnóstico de diabetes e nunca passei por isso.”",
      quality: "Pertinente",
      why: "Verifica antecedentes sem presumir ausência de doença não diagnosticada.",
    },
    {
      id: "menstrual",
      type: "question",
      title: "Quando foi a última menstruação? Pode estar grávida?",
      answer:
        "“Menstruei há duas semanas. Tenho vida sexual e uso anticoncepcional, mas não fiz teste de gravidez.”",
      quality: "Pertinente",
      why: "Inclui causas ginecológicas no diagnóstico diferencial.",
    },
    {
      id: "vitals",
      type: "exam",
      title: "Avaliar sinais vitais",
      answer:
        "PA 96/62 mmHg · FC 118 bpm · FR 28 irpm, respiração profunda · SpO₂ 99% em ar ambiente · temperatura 36,7 °C.",
      quality: "Prioritário",
      why: "Avalia estabilidade inicial.",
    },
    {
      id: "glucose",
      type: "exam",
      title: "Medir glicemia capilar",
      answer: "Glicemia capilar: 428 mg/dL.",
      quality: "Prioritário",
      why: "Identifica hiperglicemia importante.",
    },
    {
      id: "ketones",
      type: "exam",
      title: "Dosar beta-hidroxibutirato sanguíneo",
      answer:
        "Beta-hidroxibutirato: 5,6 mmol/L (referência fictícia: abaixo de 0,6 mmol/L).",
      quality: "Prioritário",
      why: "Documenta cetonemia significativa.",
    },
    {
      id: "gas",
      type: "exam",
      title: "Obter gasometria venosa",
      answer: "pH 7,24 · bicarbonato 12 mmol/L · pCO₂ 29 mmHg.",
      quality: "Prioritário",
      why: "Demonstra acidose metabólica.",
    },
    {
      id: "abdomen",
      type: "exam",
      title: "Realizar exame abdominal",
      answer:
        "Dor difusa à palpação, sem rigidez ou descompressão brusca dolorosa. Sem localização predominante em fossa ilíaca direita.",
      quality: "Pertinente",
      why: "Pesquisa sinais abdominais de alarme; reavaliar a evolução.",
    },
    {
      id: "hydration",
      type: "exam",
      title: "Avaliar hidratação e perfusão",
      answer:
        "Mucosas secas, enchimento capilar de 3 segundos e extremidades mornas.",
      quality: "Pertinente",
      why: "Avalia repercussões das perdas de líquidos.",
    },
    {
      id: "electrolytes",
      type: "exam",
      title: "Dosar eletrólitos séricos",
      answer:
        "Sódio 132 mEq/L · potássio 4,8 mEq/L · cloro 96 mEq/L · bicarbonato sérico 12 mEq/L.",
      quality: "Pertinente",
      why: "Potássio sérico normal não afasta depleção corporal na cetoacidose.",
    },
    {
      id: "renal",
      type: "exam",
      title: "Dosar ureia e creatinina",
      answer:
        "Ureia 48 mg/dL · creatinina 1,2 mg/dL. Sem valor basal disponível.",
      quality: "Pertinente",
      why: "Fornece dados para acompanhar função renal e hidratação.",
    },
    {
      id: "ecg",
      type: "exam",
      title: "Obter ECG de 12 derivações",
      answer:
        "Taquicardia sinusal, 118 bpm. Sem alterações agudas de ST ou alargamento do QRS.",
      quality: "Pertinente",
      why: "Avalia ritmo e possíveis repercussões eletrolíticas.",
    },
    {
      id: "pregnancy",
      type: "exam",
      title: "Realizar teste de gravidez",
      answer:
        "Beta-hCG sérico abaixo de 5 mUI/mL, negativo no ensaio simulado.",
      quality: "Pertinente",
      why: "Integra a avaliação da dor abdominal em idade reprodutiva.",
    },
    {
      id: "radiation",
      type: "question",
      title: "A dor mudou de lugar ou vai para as costas?",
      answer:
        "“Ficou espalhada pela barriga. Não foi para as costas nem se concentrou de um lado.”",
      quality: "Pertinente",
      why: "Detalha a distribuição da dor.",
      parent: "pain",
    },
    {
      id: "stools",
      type: "question",
      title: "Teve diarreia ou sangue nas fezes?",
      answer: "“Não. Evacuei normalmente ontem, sem sangue.”",
      quality: "Pertinente",
      why: "Explora sintomas intestinais.",
      parent: "vomiting",
    },
    {
      id: "food",
      type: "question",
      title: "Alguém que comeu com você ficou doente?",
      answer: "“Não. Comi com minha família e só eu estou assim.”",
      quality: "Pertinente",
      why: "Investiga exposição alimentar compartilhada.",
      parent: "vomiting",
    },
    {
      id: "dysuria",
      type: "question",
      title: "Sente ardor ao urinar ou dor lombar?",
      answer: "“Não arde e não tenho dor nas costas, só urino muito.”",
      quality: "Pertinente",
      why: "Distingue poliúria de sintomas urinários infecciosos.",
      parent: "urine",
    },
    {
      id: "alcohol",
      type: "question",
      title: "Ingeriu álcool recentemente?",
      answer:
        "“Não bebo há mais de um mês e não costumo beber muito.”",
      quality: "Pertinente",
      why: "Investiga contexto de cetose alcoólica.",
      parent: "meds",
    },
    {
      id: "fasting",
      type: "question",
      title: "Fez jejum prolongado ou dieta muito restritiva?",
      answer:
        "“Não. Eu comia normalmente até começar a vomitar de madrugada.”",
      quality: "Pertinente",
      why: "Explora outras causas de cetose.",
      parent: "weight",
    },
    {
      id: "family",
      type: "question",
      title: "Há diabetes na família?",
      answer:
        "“Minha avó trata diabetes desde os 60 anos. Não sei de outros casos.”",
      quality: "Pertinente",
      why: "Registra antecedentes; não define o tipo de diabetes.",
      parent: "history",
    },
    {
      id: "neuro",
      type: "question",
      title: "Teve confusão, desmaio ou muita sonolência?",
      answer:
        "“Estou fraca e tonta quando levanto, mas não desmaiei nem fiquei confusa.”",
      quality: "Pertinente",
      why: "Investiga repercussões neurológicas.",
      parent: "thirst",
    },
    {
      id: "cbc",
      type: "exam",
      title: "Solicitar hemograma",
      answer:
        "Hemoglobina 15,1 g/dL · leucócitos 12.800/mm³ · plaquetas 280.000/mm³.",
      quality: "Complementar",
      why: "Leucocitose isolada não comprova infecção.",
      parent: "fever",
    },
    {
      id: "urinalysis",
      type: "exam",
      title: "Solicitar exame de urina",
      answer:
        "Glicose 3+ · cetonas 3+ · nitrito negativo · leucócitos 0–3/campo.",
      quality: "Complementar",
      why: "Cetonúria apoia a investigação; preferir beta-hidroxibutirato para avaliar cetose.",
      parent: "urine",
    },
    {
      id: "lactate",
      type: "exam",
      title: "Dosar lactato",
      answer:
        "Lactato venoso: 1,6 mmol/L (referência fictícia: 0,5–2,2 mmol/L).",
      quality: "Complementar",
      why: "Ajuda a avaliar outras contribuições para a acidose.",
      parent: "gas",
    },
    {
      id: "lipase",
      type: "exam",
      title: "Dosar lipase",
      answer: "Lipase 34 U/L (referência fictícia: 13–60 U/L).",
      quality: "Complementar",
      why: "Interpretação depende dos sintomas; não substitui reavaliação abdominal.",
      parent: "pain",
    },
    {
      id: "liver",
      type: "exam",
      title: "Dosar enzimas hepáticas e bilirrubinas",
      answer: "AST 21 U/L · ALT 19 U/L · bilirrubina total 0,7 mg/dL.",
      quality: "Complementar",
      why: "Complementa diferenciais conforme a avaliação abdominal.",
      parent: "abdomen",
    },
    {
      id: "osmolality",
      type: "exam",
      title: "Calcular osmolaridade efetiva",
      answer:
        "Glicose plasmática simultânea 432 mg/dL e sódio 132 mEq/L: 2 × 132 + 432/18 = 288 mOsm/L.",
      quality: "Complementar",
      why: "Não sustenta hiperosmolaridade de estado hiperglicêmico hiperosmolar.",
      parent: "glucose",
    },
    {
      id: "hba1c",
      type: "exam",
      title: "Dosar hemoglobina glicada",
      answer:
        "HbA1c: 11,8%. Resultado disponibilizado para fins didáticos, sem representar espera.",
      quality: "Complementar",
      why: "Sugere hiperglicemia preexistente; não deve atrasar o atendimento.",
      parent: "glucose",
    },
    {
      id: "lungs",
      type: "exam",
      title: "Realizar ausculta pulmonar",
      answer:
        "Murmúrio vesicular presente, sem estertores ou sibilos; respiração profunda e rápida.",
      quality: "Complementar",
      why: "Complementa a avaliação respiratória.",
      parent: "vitals",
    },
    {
      id: "mental",
      type: "exam",
      title: "Avaliar nível de consciência",
      answer: "Alerta, orientada, Glasgow 15; sem déficit focal.",
      quality: "Pertinente",
      why: "Documenta o estado neurológico para reavaliação.",
      parent: "neuro",
    },
    {
      id: "ultrasound",
      type: "exam",
      title: "Solicitar ultrassonografia abdominal",
      answer:
        "Solicitação registrada, sem execução imediata. Reavaliar indicação conforme localização e persistência da dor após estabilização.",
      quality: "Indicação dependente do contexto",
      why: "Imagem depende da evolução e de suspeitas abdominais específicas.",
      parent: "abdomen",
    },
    {
      id: "ct",
      type: "exam",
      title: "Solicitar tomografia abdominal imediatamente",
      answer:
        "Não realizada nesta etapa: não há indicação estabelecida; requer reavaliação clínica e definição da pergunta diagnóstica.",
      quality: "Indicação dependente do contexto",
      why: "Não deve atrasar a investigação da emergência metabólica; dor persistente exige reavaliação.",
      parent: "abdomen",
    },
    {
      id: "ogtt",
      type: "exam",
      title: "Solicitar teste oral de tolerância à glicose agora",
      answer:
        "Exame não realizado durante a emergência hiperglicêmica.",
      quality: "Inadequado neste momento",
      why: "Sobrecarga oral de glicose é inadequada neste cenário.",
      parent: "history",
    },
  ],
  // Referências apresentadas no rodapé para fundamentar o conteúdo do caso.
  references: [
    {
      label:
        "Consenso ADA/EASD/JBDS/AACE/DTS sobre crises hiperglicêmicas em adultos (2024)",
      url: "https://doi.org/10.2337/dci24-0032",
    },
  ],
  rationale:
    "Hiperglicemia, beta-hidroxibutirato de 5,6 mmol/L e acidose metabólica sustentam o desfecho. Sede, poliúria, perda de peso e desidratação completam o quadro. O tipo de diabetes ainda requer investigação.",
  urgentGuidance:
    "Acione a equipe e priorize estabilização, monitorização e protocolo institucional de cetoacidose. Reavalie a dor abdominal e procure precipitantes; não aguarde exames complementares eletivos. A classificação do diabetes fica para investigação posterior.",
  // Dados utilizados para preencher o cartão da paciente na interface.
  patient: {
    name: "Marina",
    age: 23,
    initials: "MS",
    tags: ["23 anos", "Dor abdominal", "Vômitos"],
    complaint:
      "“Estou com muita dor na barriga e vomitando desde a madrugada.”",
    onset: "Dor abdominal há 18 horas",
  },
};

// Metadados docentes de João usam o mesmo desfecho e as referências já exibidas
// no atendimento do aluno; não alteram respostas ou opções clínicas.
const joaoCase = {
  id: "joao",
  name: "João",
  age: 54,
  ageRange: "Adulto de 54 anos",
  chiefComplaint: "Dor torácica em aperto, iniciada durante esforço.",
  context: "Pronto atendimento, com necessidade de avaliação inicial de estabilidade.",
  learningObjectives: [
    "Priorizar sinais vitais e ECG na dor torácica aguda.",
    "Relacionar história, traçado eletrocardiográfico e diagnósticos diferenciais.",
    "Reconhecer que troponina inicial abaixo do limite não exclui infarto precoce.",
  ],
  hypotheses: [
    "Refluxo gastroesofágico",
    "Infarto agudo do miocárdio com supradesnivelamento de ST",
    "Crise de ansiedade",
    "Angina estável",
    "Tromboembolismo pulmonar",
    "Síndrome aórtica aguda",
    "Pericardite aguda",
    "Dor musculoesquelética",
    "Síndrome coronariana aguda sem supra de ST",
  ],
  priorityEvidenceIds: ["vitals", "ecg"],
  outcome: "Infarto agudo do miocárdio com supra de ST, de parede inferior.",
  pedagogicalFeedback:
    "O ECG e a avaliação de estabilidade devem ser priorizados; não se deve aguardar elevação da troponina para acionar o atendimento urgente.",
  references: [
    {
      label: "Diretriz de avaliação da dor torácica · AHA/ACC",
      url: "https://www.acc.org/latest-in-cardiology/ten-points-to-remember/2021/10/27/14/06/2021-guideline-for-chest-pain-gl_chestpain",
    },
    {
      label: "Diretriz de embolia pulmonar · ESC",
      url: "https://www.escardio.org/guidelines/clinical-practice-guidelines/all-esc-practice-guidelines/acute-pulmonary-embolism/",
    },
  ],
  status: "published",
};

export { joaoCase, joaoItems, marinaCase };
