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

// ESTADO DA SESSÃO
// ----------------------------------------------------------------------
// Estado da sessão: caso selecionado e catálogo atualmente disponível.
let activeCase = null,
  items = [];
// Percurso, filtro ativo, tentativas diagnósticas e temporizador da notificação; os dados permanecem em memória.
let path = [],
  filter = "all",
  attempts = [],
  timer;

// CONSULTAS E NOTIFICAÇÕES
// ----------------------------------------------------------------------
// Atalho para buscar um elemento da interface pelo identificador.
const $ = (id) => document.getElementById(id);
// Consulta se uma ação já foi registrada no percurso.
const has = (id) => path.some((step) => step.id === id);
// Disponibiliza apenas ações ainda não realizadas e com a dependência satisfeita.
const available = (item) => !has(item.id) && (!item.parent || has(item.parent));
// Exibe uma mensagem temporária e substitui o prazo de ocultação da mensagem anterior.
function notify(message) {
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  clearTimeout(timer);
  timer = setTimeout(() => $("toast").classList.add("hidden"), 4000);
}

// RENDERIZAÇÃO DA INTERFACE
// ----------------------------------------------------------------------
// Atualiza biblioteca de ações, contador, histórico e árvore de perguntas e exames.
function render() {
  renderLibrary();
  $("count").textContent = String(path.length).padStart(2, "0");
  $("empty").hidden = path.length > 0;
  $("historyEmpty").hidden = path.length > 0;
  renderHistory();
  renderMap();
}

// Atualiza somente os botões disponíveis para investigação.
function renderLibrary() {
  // Seleciona as ações liberadas que correspondem ao filtro de perguntas ou exames.
  const list = items.filter(
    (item) => available(item) && (filter === "all" || filter === item.type),
  );
  // Transforma as ações disponíveis em botões clicáveis e arrastáveis.
  $("blocks").innerHTML =
    list
      .map(
        (item) =>
          `<button type="button" class="block ${item.type === "exam" ? "exam" : ""}" draggable="true" data-id="${item.id}" aria-label="Adicionar: ${item.title}"><span>${item.parent ? '<span class="new">Nova conexão</span>' : ""}${item.title}</span><span class="plus" aria-hidden="true">+</span></button>`,
      )
      .join("") ||
    '<p class="sub">Nenhum bloco disponível nesta categoria. Explore as outras opções ou formule sua hipótese.</p>';
}

// Atualiza a linha do tempo das escolhas realizadas.
function renderHistory() {
  // Organiza o histórico pela ordem das escolhas, incluindo o horário registrado.
  $("timeline").innerHTML = path
    .map((step, index) => {
      const item = items.find((item) => item.id === step.id);
      return `<li><span class="meta">${String(index + 1).padStart(2, "0")} · ${step.time}</span><b>${item.title}</b></li>`;
    })
    .join("");
}

// Atualiza a árvore de evidências e suas dependências.
function renderMap() {
  // Monta recursivamente um nó do mapa com sua resposta e os descendentes já selecionados.
  function node(id) {
    const item = items.find((item) => item.id === id),
      index = path.findIndex((step) => step.id === id);
    const children = path.filter(
      (step) => items.find((item) => item.id === step.id).parent === id,
    );
    return `<article class="node ${item.type === "exam" ? "exam" : ""}"><div class="meta">${String(index + 1).padStart(2, "0")} · ${item.type === "exam" ? "EXAME" : "PERGUNTA"}</div>` +
      `<h4>${item.title}</h4>` +
        `<p>${item.answer}</p></article>${children.length ? '<div class="children">' + children.map((step) => node(step.id)).join("") + "</div>" : ""}`;
  }
  // Inicia cada ramo pelas ações sem dependência e delega os descendentes à função node.
  $("branches").innerHTML = path
    .filter((step) => !items.find((item) => item.id === step.id).parent)
    .map((step) => `<div class="branch">${node(step.id)}</div>`)
    .join("");
}

// REGISTRO DE AÇÕES
// ----------------------------------------------------------------------
// Valida a ação, registra seu horário, redesenha a sessão e informa as opções liberadas.
function add(id) {
  if (!activeCase) return;
  const item = items.find((item) => item.id === id);
  if (!item || !available(item)) return;
  path.push({
    id,
    time: new Date().toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  });
  render();
  const unlocked = items.filter((item) => item.parent === id).length;
  notify(
    `${item.title} adicionado.${unlocked ? " " + unlocked + " nova(s) opção(ões) liberada(s)." : ""}`,
  );
}

// EVENTOS DE INVESTIGAÇÃO
// ----------------------------------------------------------------------
// Delega os cliques da biblioteca ao botão de ação mais próximo do alvo.
$("blocks").addEventListener("click", (event) => {
  const button = event.target.closest("[data-id]");
  if (button) add(button.dataset.id);
});
// Transporta o identificador da ação quando o aluno começa a arrastar um bloco.
$("blocks").addEventListener("dragstart", (event) => {
  const button = event.target.closest("[data-id]");
  if (button) {
    event.dataTransfer.setData("text/plain", button.dataset.id);
    event.dataTransfer.effectAllowed = "copy";
  }
});
// Permite soltar blocos no mapa e destaca a área de destino.
$("map").addEventListener("dragover", (event) => {
  event.preventDefault();
  $("map").classList.add("over");
});
// Remove o destaque quando o arraste deixa a área do mapa.
$("map").addEventListener("dragleave", (event) => {
  if (!$("map").contains(event.relatedTarget))
    $("map").classList.remove("over");
});
// Recupera a ação solta no mapa e a adiciona pelo mesmo fluxo usado no clique.
$("map").addEventListener("drop", (event) => {
  event.preventDefault();
  $("map").classList.remove("over");
  add(event.dataTransfer.getData("text/plain"));
});
// Limpa o destaque ao terminar qualquer arraste, inclusive fora do mapa.
document.addEventListener("dragend", () =>
  $("map").classList.remove("over"),
);

// FILTROS E DIÁLOGOS
// ----------------------------------------------------------------------
// Associa cada botão de filtro à atualização do catálogo visível.
document.querySelectorAll("[data-filter]").forEach(
  (button) =>
    (button.onclick = () => {
      filter = button.dataset.filter;
      // Sincroniza o destaque visual e o estado acessível de todos os filtros.
      document.querySelectorAll("[data-filter]").forEach((filterButton) => {
        filterButton.classList.toggle("active", filterButton === button);
        filterButton.setAttribute("aria-pressed", String(filterButton === button));
      });
      render();
    }),
);
// Cada botão fecha o diálogo indicado no seu atributo data-close.
document
  .querySelectorAll("[data-close]")
  .forEach((button) => (button.onclick = () => $(button.dataset.close).close()));
// Abre o formulário de hipótese diagnóstica.
$("diagnose").onclick = () => $("diagnosis").showModal();
// Solicita confirmação antes de apagar o percurso da sessão.
$("reset").onclick = () => $("restart").showModal();
// Limpa percurso, tentativas e formulário, mantendo o caso selecionado.
$("confirmReset").onclick = () => {
  path = [];
  attempts = [];
  $("diagnosisForm").reset();
  $("restart").close();
  render();
  notify("Caso reiniciado.");
};

// HIPÓTESE E FEEDBACK
// ----------------------------------------------------------------------
// Valida a justificativa, registra a tentativa e apresenta o feedback correspondente ao caso.
$("diagnosisForm").onsubmit = (event) => {
  event.preventDefault();
  if (!$("reason").value.trim()) {
    $("reason").setCustomValidity("Descreva ao menos um achado.");
    $("reason").reportValidity();
    return;
  }
  // Compara apenas a alternativa escolhida com o desfecho esperado; não avalia automaticamente a justificativa.
  const correct =
    $("hypothesis").value ===
    (activeCase === "marina" ? marinaCase.correctHypothesis : "stemi");
  // Preserva a hipótese, justificativa e ações existentes no momento desta tentativa.
  attempts.push({
    hypothesis: $("hypothesis").selectedOptions[0].text,
    reason: $("reason").value,
    actions: path.map((step) => step.id),
    correct,
  });
  $("diagnosis").close();
  // Compõe o desfecho, a presença das evidências e a revisão pedagógica das escolhas realizadas.
  $("feedback").innerHTML =
    (activeCase === "marina"
      ? `<div class="feedback"><h3>${correct ? "Hipótese compatível com o caso" : "Vale revisar sua hipótese"}</h3>` +
        `<p>O desfecho proposto é <strong>${marinaCase.outcome}</strong>. ${marinaCase.rationale}</p>` +
        `<p>${marinaCase.evidenceIds.every(has) ? "Você reuniu as evidências centrais. Relacione a glicemia, a cetonemia e a acidose com a história clínica." : "A glicemia, a cetonemia e a avaliação da acidose são evidências centrais. Confira quais ainda faltam no seu percurso."}</p>` +
        `</div><h3>Prioridades e evidências</h3>` +
        `<p class="sub">${has("vitals") ? "Sinais vitais avaliados." : "Faltou avaliar os sinais vitais."} ${has(marinaCase.priorityId) ? (path.findIndex((step) => step.id === marinaCase.priorityId) < 3 ? "Glicemia capilar entre as primeiras escolhas." : "A glicemia capilar poderia ter sido priorizada mais cedo.") : "A glicemia capilar deve ser priorizada."} A ordem de cliques não representa tempo clínico.</p>` +
        `<p class="sub">${marinaCase.urgentGuidance} A justificativa escrita fica registrada para revisão docente; não é corrigida automaticamente.</p>`
      : `<div class="feedback"><h3>${correct ? "Hipótese compatível com o caso" : "Vale revisar sua hipótese"}</h3>` +
        `<p>O desfecho proposto é <strong>infarto agudo do miocárdio com supra de ST, de parede inferior</strong>. Dor persistente, sintomas associados e o padrão do ECG sustentam essa hipótese.</p>` +
        `<p>${has("ecg") ? "Você obteve o ECG. Relacione suas alterações com a história clínica." : "Você concluiu sem obter o ECG, uma evidência central para este caso."}</p>` +
        `</div><h3>Prioridades e evidências</h3>` +
        `<p class="sub">${has("vitals") ? "Sinais vitais avaliados." : "Faltou avaliar os sinais vitais."} ${has("ecg") ? (path.findIndex((step) => step.id === "ecg") < 3 ? "ECG entre as primeiras escolhas." : "O ECG poderia ter sido priorizado mais cedo.") : "O ECG deve ser priorizado."} A ordem de cliques não representa tempo clínico.</p>` +
        `<p class="sub">Este quadro exige acionamento urgente da equipe e avaliação para reperfusão. Não se deve esperar a elevação da troponina. Exames alterados podem ser inespecíficos: o D-dímero elevado não confirma embolia e a troponina inicial abaixo do limite não exclui infarto precoce. A justificativa escrita fica registrada para revisão docente; não é corrigida automaticamente.</p>`) +
    `<h3 class="review-heading">Revisão das suas ${path.length} escolhas</h3>${
      path.length
        ? path
            .map((step) => {
              const item = items.find((item) => item.id === step.id);
              return `<div class="review"><strong>${item.title}</strong><span>${item.quality} · ${item.why}</span></div>`;
            })
            .join("")
        : '<p class="sub">Nenhuma investigação realizada. Volte ao mapa para explorar as evidências.</p>'
    }`;
  $("result").showModal();
};
// Remove a mensagem de validação anterior quando a justificativa é editada.
$("reason").oninput = () => $("reason").setCustomValidity("");

// EXPORTAÇÃO DO PERCURSO EM PDF
// ----------------------------------------------------------------------
// Captura os dados da sessão sem modificar o percurso nem as tentativas originais.
function collectReportData() {
  return {
    case:
      activeCase === "marina"
        ? marinaCase.exportLabel
        : "João, 54 anos — dor torácica",
    exportedAt: new Date().toISOString(),
    path: path.map((step, index) => ({
      step: index + 1,
      ...step,
      ...items.find((item) => item.id === step.id),
    })),
    attempts: attempts.map((attempt) => ({
      ...attempt,
      actions: [...attempt.actions],
    })),
  };
}

// Mantém rótulo e conteúdo como texto, inclusive quando o aluno escreve sinais de HTML.
function reportField(label, value) {
  return {
    text: [{ text: `${label}: `, bold: true }, String(value)],
    margin: [0, 0, 0, 5],
  };
}

// Apresenta cada escolha em ordem, com resposta e orientação pedagógica do catálogo.
function buildReportPath(report) {
  if (!report.path.length) return [{ text: "Nenhuma pergunta ou exame registrado." }];
  return report.path.flatMap((step) => {
    const parent = report.path.find((entry) => entry.id === step.parent);
    return [
      {
        text: `${step.step}. ${step.title}`,
        style: "subheading",
        headlineLevel: 2,
      },
      reportField("Registro", `${step.time} | ${step.type === "question" ? "Pergunta" : "Exame"}`),
      reportField("Resposta / resultado", step.answer),
      reportField("Avaliação pedagógica", step.quality),
      reportField("Comentário", step.why),
      ...(parent ? [reportField("Liberado após", `${parent.step}. ${parent.title}`)] : []),
    ];
  });
}

// Preserva a justificativa completa e relaciona somente ações realizadas antes de cada tentativa.
function buildReportAttempts(report) {
  if (!report.attempts.length) return [{ text: "Nenhuma hipótese registrada." }];
  return report.attempts.flatMap((attempt, index) => {
    const actionNames = attempt.actions.map((id) => {
      const step = report.path.find((entry) => entry.id === id);
      return step ? `${step.step}. ${step.title}` : id;
    });
    return [
      { text: `Tentativa ${index + 1}`, style: "subheading", headlineLevel: 2 },
      reportField("Hipótese", attempt.hypothesis),
      reportField(
        "Resultado",
        attempt.correct
          ? "Hipótese compatível com o desfecho esperado."
          : "Hipótese diferente do desfecho esperado.",
      ),
      reportField("Justificativa do aluno", attempt.reason),
      { text: "Escolhas realizadas até esta tentativa:", bold: true, margin: [0, 3, 0, 5] },
      actionNames.length
        ? { ul: actionNames, margin: [0, 0, 0, 8] }
        : { text: "Nenhuma pergunta ou exame registrado antes desta tentativa." },
    ];
  });
}

// Define um relatório A4 com texto selecionável, paginação automática e fontes com acentos.
function buildReportDocument(report) {
  const questions = report.path.filter((step) => step.type === "question").length;
  const exams = report.path.filter((step) => step.type === "exam").length;
  return {
    pageSize: "A4",
    pageMargins: [42, 48, 42, 48],
    info: { title: `Relatório de atendimento - ${report.case}`, subject: "Percurso educacional do paciente virtual" },
    defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.2, color: "#223447" },
    styles: {
      title: { fontSize: 20, bold: true, margin: [0, 0, 0, 12] },
      heading: { fontSize: 14, bold: true, margin: [0, 16, 0, 8] },
      subheading: { fontSize: 11, bold: true, margin: [0, 12, 0, 6] },
      note: { fontSize: 9, color: "#526172", margin: [0, 6, 0, 6] },
    },
    header: { text: "PACIENTE VIRTUAL | RELATÓRIO EDUCACIONAL", fontSize: 8, color: "#526172", margin: [42, 20, 42, 0] },
    footer: (currentPage, pageCount) => ({
      text: `Página ${currentPage} de ${pageCount}`,
      alignment: "right",
      fontSize: 8,
      color: "#526172",
      margin: [42, 15, 42, 0],
    }),
    // Evita que o título de uma seção fique isolado no fim de uma página.
    pageBreakBefore: (currentNode, followingNodesOnPage) =>
      Boolean(currentNode.headlineLevel && followingNodesOnPage.length === 0),
    content: [
      { text: "Relatório de atendimento", style: "title" },
      reportField("Caso", report.case),
      reportField("Exportado em", new Date(report.exportedAt).toLocaleString("pt-BR", { timeZoneName: "short" })),
      reportField("Resumo", `${questions} pergunta(s), ${exams} exame(s) e ${report.attempts.length} tentativa(s)`),
      {
        text: "Caso fictício com resultados simulados, para uso educacional. Conteúdo sujeito à validação docente. Os horários e a ordem das escolhas não representam tempo clínico.",
        style: "note",
      },
      { text: "Percurso de investigação", style: "heading", headlineLevel: 1 },
      ...buildReportPath(report),
      { text: "Hipóteses e justificativas", style: "heading", headlineLevel: 1 },
      {
        text: "O resultado compara apenas a hipótese selecionada com o desfecho esperado. A justificativa não é corrigida automaticamente e deve ser analisada pelo professor.",
        style: "note",
      },
      ...buildReportAttempts(report),
    ],
  };
}

// Usa o fluxo público da biblioteca com fontes locais para capturar erros e gerar um PDF real.
function createReportBlob(documentDefinition) {
  return new Promise((resolve, reject) => {
    const stream = window.pdfMake.createPdf(documentDefinition).getStream();
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(new Blob(chunks, { type: "application/pdf" })));
    stream.end();
  });
}

// Mantém um link visível para download manual caso o navegador bloqueie o clique automático.
let reportUrl = null;
function downloadReport(blob, filename) {
  if (reportUrl) URL.revokeObjectURL(reportUrl);
  reportUrl = URL.createObjectURL(blob);
  const downloadLink = $("downloadPdf");
  downloadLink.href = reportUrl;
  downloadLink.download = filename;
  downloadLink.hidden = false;
  downloadLink.click();
}
window.addEventListener("pagehide", () => {
  if (reportUrl) URL.revokeObjectURL(reportUrl);
});

// Exporta somente PDF; restaura o botão tanto no sucesso quanto em falhas de geração.
$("export").onclick = async () => {
  const button = $("export");
  if (button.disabled || !activeCase) return;
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Gerando PDF…";
  button.setAttribute("aria-busy", "true");
  try {
    if (!window.pdfMake) throw new Error("Biblioteca PDF indisponível.");
    const report = collectReportData();
    const blob = await createReportBlob(buildReportDocument(report));
    downloadReport(blob, `percurso-${activeCase}.pdf`);
    notify("PDF pronto. Se o download não iniciar, clique em Baixar PDF.");
  } catch (error) {
    console.error("Não foi possível exportar o percurso em PDF.", error);
    notify("Não foi possível gerar o PDF. Tente novamente.");
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
    button.removeAttribute("aria-busy");
  }
};

// ESCOLHA E ABERTURA DO CASO
// ----------------------------------------------------------------------
// Inicia uma única sessão a partir da escolha do caso e prepara seus dados na interface.
$("caseForm").onsubmit = (event) => {
  event.preventDefault();
  const selected = $("caseSelect").value;
  if (activeCase || !["joao", "marina"].includes(selected)) return;
  activeCase = selected;
  items = selected === "marina" ? marinaCase.items : joaoItems;
  // Substitui a apresentação inicial de João pelos dados, imagem e alternativas de Marina.
  if (selected === "marina") {
    const patient = marinaCase.patient;
    document.querySelector(".intro .eyebrow").textContent =
      "Caso 02 / Pronto atendimento";
    const scene = document.querySelector(".patient-scene");
    const sceneImage = scene.querySelector("img");
    sceneImage.src =
      "images/marina-atendimento.png";
    sceneImage.alt =
      "Ilustração de Marina, sentada com a mão sobre o abdômen, sendo acolhida por uma profissional de enfermagem.";
    sceneImage.width = 1536;
    sceneImage.height = 1024;
    scene.querySelector("figcaption").textContent =
      "Marina na chegada ao atendimento · imagem gerada por IA";
    scene.hidden = false;
    document.querySelector(".patient .avatar").textContent =
      patient.initials;
    document.querySelector(".patient h3").textContent =
      patient.name + ", " + patient.age + " anos";
    // Converte as características da paciente em etiquetas visuais.
    document.querySelector(".patient .tags").innerHTML = patient.tags
      .map((tag) => `<span>${tag}</span>`)
      .join("");
    document.querySelector(".patient > p").textContent =
      patient.complaint;
    document.querySelector(".patient > .meta").textContent =
      patient.onset;
    // Preenche o seletor com as alternativas diagnósticas específicas de Marina.
    $("hypothesis").innerHTML =
      '<option value="">Selecione uma hipótese</option>' +
      marinaCase.hypotheses
        .map(
          (option) =>
            `<option value="${option.value}">${option.label}</option>`,
        )
        .join("");
    // Atualiza os links bibliográficos preservando o trecho inicial do rodapé.
    const footer = document.querySelector("footer");
    footer.innerHTML =
      footer.innerHTML.slice(
        0,
        footer.innerHTML.indexOf("Referência:"),
      ) +
      "Referência: " +
      marinaCase.references
        .map(
          (reference) =>
            `<a href="${reference.url}" target="_blank" rel="noopener">${reference.label}</a>`,
        )
        .join(" e ") +
      ". O percurso fica nesta sessão; use “Exportar percurso em PDF” ao concluir.";
  }
  render();
  // Exibe o atendimento e direciona o foco ao título para facilitar a navegação por teclado.
  $("caseChoice").hidden = true;
  $("caseSession").hidden = false;
  $("caseActions").hidden = false;
  const heading = document.querySelector(".intro h2");
  heading.tabIndex = -1;
  heading.focus();
};
