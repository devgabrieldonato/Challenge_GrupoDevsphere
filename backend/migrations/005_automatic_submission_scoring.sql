-- Consolida a finalização automática e mantém a pontuação como regra do servidor.
-- Os valores de cada item são versionados para preservar a auditoria acadêmica.
ALTER TABLE submissions ADD COLUMN client_submission_id TEXT;
ALTER TABLE submissions ADD COLUMN submitted_by INTEGER REFERENCES users(id);
ALTER TABLE submissions ADD COLUMN reviewer_id INTEGER REFERENCES users(id);
ALTER TABLE submissions ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0 CHECK(is_test IN (0,1));
ALTER TABLE submissions ADD COLUMN review_status TEXT NOT NULL DEFAULT 'submitted'
  CHECK(review_status IN ('submitted','awaiting_assignment'));
ALTER TABLE submissions ADD COLUMN report_sha256 TEXT;
ALTER TABLE submissions ADD COLUMN scoring_rule_set_version TEXT;
ALTER TABLE submissions ADD COLUMN initial_score INTEGER;
ALTER TABLE submissions ADD COLUMN raw_score INTEGER;
ALTER TABLE submissions ADD COLUMN displayed_score INTEGER;

CREATE UNIQUE INDEX idx_submissions_client_submission_id
  ON submissions(client_submission_id) WHERE client_submission_id IS NOT NULL;
CREATE INDEX idx_submissions_reviewer ON submissions(reviewer_id, submitted_at);

-- Permite trocar o docente padrão sem alterar código ou regras clínicas.
CREATE TABLE submission_settings (
  singleton_id INTEGER PRIMARY KEY CHECK(singleton_id = 1),
  default_reviewer_id INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO submission_settings(singleton_id,default_reviewer_id) VALUES(1,NULL);

-- Regras autoritativas: o navegador apenas antecipa a visualização do resultado.
CREATE TABLE submission_scoring_rules (
  case_key TEXT NOT NULL,
  rule_set_version TEXT NOT NULL,
  item_key TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK(item_type IN ('question','exam')),
  classification TEXT NOT NULL
    CHECK(classification IN ('priority','relevant','complementary','low_value','inappropriate')),
  base_points INTEGER NOT NULL,
  central_evidence INTEGER NOT NULL DEFAULT 0 CHECK(central_evidence IN (0,1)),
  dependencies_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(dependencies_json)),
  pedagogical_reason TEXT NOT NULL,
  PRIMARY KEY(case_key, rule_set_version, item_key)
);

CREATE TABLE submission_score_events (
  id INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT,
  sequence_number INTEGER NOT NULL,
  item_key TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK(item_type IN ('question','exam')),
  classification TEXT NOT NULL,
  rule_set_version TEXT NOT NULL,
  base_points INTEGER NOT NULL,
  priority_bonus INTEGER NOT NULL DEFAULT 0,
  efficiency_penalty INTEGER NOT NULL DEFAULT 0,
  delta INTEGER NOT NULL,
  raw_total_after INTEGER NOT NULL,
  displayed_total_after INTEGER NOT NULL,
  recorded_at TEXT,
  UNIQUE(submission_id, sequence_number),
  UNIQUE(submission_id, item_key)
);

-- O PDF fica no banco na mesma transação da submissão; a rota protegida é a única leitura.
CREATE TABLE submission_documents (
  submission_id INTEGER PRIMARY KEY REFERENCES submissions(id) ON DELETE RESTRICT,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK(mime_type='application/pdf'),
  sha256 TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size > 0),
  pdf_blob BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER submission_score_events_immutable_update
BEFORE UPDATE ON submission_score_events BEGIN
  SELECT RAISE(ABORT, 'eventos de pontuação são imutáveis');
END;

INSERT INTO submission_scoring_rules(
  case_key,rule_set_version,item_key,item_type,classification,base_points,
  central_evidence,dependencies_json,pedagogical_reason) VALUES
('joao','1.0.0','pain','question','relevant',3,0,'[]','Caracteriza a dor e ajuda a estimar a possibilidade de origem cardíaca.'),
('joao','1.0.0','start','question','relevant',3,0,'[]','Investiga o início e a relação da dor com o esforço.'),
('joao','1.0.0','vitals','exam','priority',5,1,'[]','A avaliação inicial de estabilidade deve ocorrer precocemente, junto à investigação.'),
('joao','1.0.0','ecg','exam','priority',5,1,'[]','ECG deve ser obtido e interpretado rapidamente (idealmente até 10 minutos). Neste caso, indica provável infarto inferior com supra de ST.'),
('joao','1.0.0','associated','question','relevant',3,0,'[]','Sintomas associados reforçam a suspeita de síndrome coronariana aguda.'),
('joao','1.0.0','troponin','exam','relevant',3,0,'[]','Valor inicial abaixo do limite não exclui infarto precoce. Com ECG diagnóstico, não se deve aguardar troponina para acionar o atendimento urgente.'),
('joao','1.0.0','radiation','question','relevant',3,0,'["pain"]','A irradiação é compatível com dor de possível origem cardíaca.'),
('joao','1.0.0','palpation','exam','complementary',1,0,'["pain"]','Ajuda no diagnóstico diferencial, mas isoladamente não confirma ou exclui síndrome coronariana.'),
('joao','1.0.0','rest','question','relevant',3,0,'["start"]','Dor persistente apesar do repouso é um sinal de alerta e desfavorece angina estável.'),
('joao','1.0.0','previous','question','relevant',3,0,'["start"]','A mudança do padrão habitual aumenta a suspeita de uma condição aguda.'),
('joao','1.0.0','lung','exam','complementary',1,0,'["associated"]','Integra a avaliação física e busca sinais de congestão e causas alternativas.'),
('joao','1.0.0','right','exam','relevant',3,0,'["ecg"]','No contexto de infarto inferior, ajuda a investigar comprometimento do ventrículo direito, sem atrasar o atendimento urgente.'),
('joao','1.0.0','serial','exam','complementary',1,0,'["troponin"]','A elevação dinâmica sustenta lesão miocárdica aguda. O ECG deste caso já demanda ação urgente, sem esperar esta amostra.'),
('joao','1.0.0','exercise','exam','inappropriate',-12,0,'["rest"]','Não é apropriado submeter este paciente com suspeita de síndrome coronariana aguda a esforço.'),
('joao','1.0.0','pleuritic','question','relevant',3,0,'[]','Explora causas pleurais e pericárdicas; a ausência dessas características não as exclui isoladamente.'),
('joao','1.0.0','digestive','question','relevant',3,0,'[]','Compara o sintoma atual com sintomas prévios. História de refluxo pode coexistir com uma emergência cardíaca.'),
('joao','1.0.0','risk','question','relevant',3,0,'[]','Ajuda a contextualizar risco cardiovascular; fatores de risco não substituem a avaliação da queixa aguda.'),
('joao','1.0.0','meds','question','relevant',3,0,'[]','Reconciliação de medicamentos e alergias informa a segurança do atendimento.'),
('joao','1.0.0','thrombotic','question','relevant',3,0,'[]','Investiga fatores de risco para tromboembolismo. A ausência deles não exclui embolia por si só.'),
('joao','1.0.0','sudden','question','relevant',3,0,'[]','Início abrupto e máximo desde o primeiro instante pode orientar a investigação de síndrome aórtica, entre outras causas.'),
('joao','1.0.0','xray','exam','complementary',1,0,'[]','Pode ajudar em diagnósticos diferenciais. Radiografia sem alterações não exclui infarto, embolia ou dissecção, nem deve atrasar o ECG.'),
('joao','1.0.0','ddimer','exam','low_value',-8,0,'[]','É útil em estratégias para excluir embolia com probabilidade clínica apropriada. Resultado positivo isolado não confirma embolia e não justifica abandonar a avaliação coronariana.'),
('joao','1.0.0','cbc','exam','complementary',1,0,'[]','Investiga anemia e fornece dados basais. Leucocitose discreta pode ocorrer por estresse; isoladamente não comprova infecção.'),
('joao','1.0.0','renal','exam','complementary',1,0,'[]','Ajuda a planejar cuidados e avaliar risco de alterações eletrolíticas; não define a causa da dor e não deve atrasar medidas urgentes.'),
('joao','1.0.0','ckmb','exam','low_value',-8,0,'[]','Com troponina disponível, CK-MB geralmente não acrescenta valor diagnóstico. Um resultado inicial abaixo do limite não exclui infarto.'),
('joao','1.0.0','coronaryct','exam','inappropriate',-12,0,'[]','É opção em perfis selecionados, como risco intermediário. Com ECG indicativo de infarto com supra, não deve substituir ou atrasar a estratégia urgente de reperfusão.'),
('joao','1.0.0','echo','exam','complementary',1,0,'[]','Avalia função e complicações, e pode apoiar casos duvidosos. Neste cenário, não deve atrasar a resposta ao ECG diagnóstico.'),
('joao','1.0.0','cardiac','exam','relevant',3,0,'[]','Integra o exame inicial. A ausência de sopro ou atrito não exclui causas cardiovasculares graves.'),
('joao','1.0.0','cough','question','relevant',3,0,'["associated"]','Explora infecção e embolia no diagnóstico diferencial da dispneia. Respostas negativas não excluem todas as causas.'),
('joao','1.0.0','syncope','question','relevant',3,0,'["associated"]','Pode identificar sinais de instabilidade e arritmia e contextualizar a sequência dos sintomas.'),
('joao','1.0.0','leg','exam','complementary',1,0,'["thrombotic"]','Sinais de trombose podem aumentar a suspeita de embolia. Exame normal das pernas não a exclui.'),
('joao','1.0.0','pulmonaryct','exam','low_value',-8,0,'["thrombotic"]','Não é rastreamento universal para dor torácica. D-dímero elevado isoladamente não define indicação; considerar a probabilidade clínica e o ECG deste caso.'),
('joao','1.0.0','back','question','relevant',3,0,'["sudden"]','Procura elementos de síndrome aórtica e comprometimento neurológico; respostas negativas não excluem dissecção.'),
('joao','1.0.0','pulses','exam','complementary',1,0,'["sudden"]','Assimetria pode reforçar suspeita de síndrome aórtica. Simetria não exclui essa condição.'),
('joao','1.0.0','antacid','question','complementary',1,0,'["digestive"]','Evita confundir sintomas prévios com o episódio atual. Resposta a antiácido não é teste para excluir origem cardíaca.'),
('joao','1.0.0','lipids','exam','low_value',-8,0,'["risk"]','É útil para planejamento preventivo, mas não esclarece a causa da dor aguda nem deve preceder sua avaliação.'),
('joao','1.0.0','smoking','question','relevant',3,0,'["risk"]','Quantifica a exposição, aproximadamente 30 anos-maço, sem determinar sozinho o diagnóstico.'),
('joao','1.0.0','stimulants','question','relevant',3,0,'["meds"]','Investiga exposições relacionadas a isquemia e arritmias sem presumir uso a partir da aparência do paciente.'),
('joao','1.0.0','oldECG','exam','complementary',1,0,'["ecg"]','Comparação apoia o caráter novo das alterações, mas procurar traçados prévios não deve atrasar o atendimento.'),
('joao','1.0.0','holter','exam','low_value',-8,0,'["syncope"]','Holter investiga arritmias em contextos selecionados. Não substitui ECG imediato ou monitorização durante uma suspeita de síndrome coronariana aguda.'),
('marina','1.0.0','pain','question','relevant',3,0,'[]','Caracteriza a queixa abdominal.'),
('marina','1.0.0','onset','question','relevant',3,0,'[]','Define a evolução temporal.'),
('marina','1.0.0','vomiting','question','relevant',3,0,'[]','Avalia perdas e tolerância à ingestão.'),
('marina','1.0.0','thirst','question','relevant',3,0,'[]','Busca sintomas anteriores à dor.'),
('marina','1.0.0','urine','question','relevant',3,0,'[]','Contextualiza a perda de líquidos.'),
('marina','1.0.0','weight','question','relevant',3,0,'[]','Investiga mudanças anteriores ao episódio agudo.'),
('marina','1.0.0','fever','question','relevant',3,0,'[]','Explora possíveis fatores precipitantes sem excluir infecção apenas pela história.'),
('marina','1.0.0','meds','question','relevant',3,0,'[]','Registra exposições e alergias.'),
('marina','1.0.0','history','question','relevant',3,0,'[]','Verifica antecedentes sem presumir ausência de doença não diagnosticada.'),
('marina','1.0.0','menstrual','question','relevant',3,0,'[]','Inclui causas ginecológicas no diagnóstico diferencial.'),
('marina','1.0.0','vitals','exam','priority',5,1,'[]','Avalia estabilidade inicial.'),
('marina','1.0.0','glucose','exam','priority',5,1,'[]','Identifica hiperglicemia importante.'),
('marina','1.0.0','ketones','exam','priority',5,1,'[]','Documenta cetonemia significativa.'),
('marina','1.0.0','gas','exam','priority',5,1,'[]','Demonstra acidose metabólica.'),
('marina','1.0.0','abdomen','exam','relevant',3,0,'[]','Pesquisa sinais abdominais de alarme; reavaliar a evolução.'),
('marina','1.0.0','hydration','exam','relevant',3,0,'[]','Avalia repercussões das perdas de líquidos.'),
('marina','1.0.0','electrolytes','exam','relevant',3,0,'[]','Potássio sérico normal não afasta depleção corporal na cetoacidose.'),
('marina','1.0.0','renal','exam','relevant',3,0,'[]','Fornece dados para acompanhar função renal e hidratação.'),
('marina','1.0.0','ecg','exam','relevant',3,0,'[]','Avalia ritmo e possíveis repercussões eletrolíticas.'),
('marina','1.0.0','pregnancy','exam','relevant',3,0,'[]','Integra a avaliação da dor abdominal em idade reprodutiva.'),
('marina','1.0.0','radiation','question','relevant',3,0,'["pain"]','Detalha a distribuição da dor.'),
('marina','1.0.0','stools','question','relevant',3,0,'["vomiting"]','Explora sintomas intestinais.'),
('marina','1.0.0','food','question','relevant',3,0,'["vomiting"]','Investiga exposição alimentar compartilhada.'),
('marina','1.0.0','dysuria','question','relevant',3,0,'["urine"]','Distingue poliúria de sintomas urinários infecciosos.'),
('marina','1.0.0','alcohol','question','relevant',3,0,'["meds"]','Investiga contexto de cetose alcoólica.'),
('marina','1.0.0','fasting','question','relevant',3,0,'["weight"]','Explora outras causas de cetose.'),
('marina','1.0.0','family','question','relevant',3,0,'["history"]','Registra antecedentes; não define o tipo de diabetes.'),
('marina','1.0.0','neuro','question','relevant',3,0,'["thirst"]','Investiga repercussões neurológicas.'),
('marina','1.0.0','cbc','exam','complementary',1,0,'["fever"]','Leucocitose isolada não comprova infecção.'),
('marina','1.0.0','urinalysis','exam','complementary',1,0,'["urine"]','Cetonúria apoia a investigação; preferir beta-hidroxibutirato para avaliar cetose.'),
('marina','1.0.0','lactate','exam','complementary',1,0,'["gas"]','Ajuda a avaliar outras contribuições para a acidose.'),
('marina','1.0.0','lipase','exam','complementary',1,0,'["pain"]','Interpretação depende dos sintomas; não substitui reavaliação abdominal.'),
('marina','1.0.0','liver','exam','complementary',1,0,'["abdomen"]','Complementa diferenciais conforme a avaliação abdominal.'),
('marina','1.0.0','osmolality','exam','complementary',1,0,'["glucose"]','Não sustenta hiperosmolaridade de estado hiperglicêmico hiperosmolar.'),
('marina','1.0.0','hba1c','exam','complementary',1,0,'["glucose"]','Sugere hiperglicemia preexistente; não deve atrasar o atendimento.'),
('marina','1.0.0','lungs','exam','complementary',1,0,'["vitals"]','Complementa a avaliação respiratória.'),
('marina','1.0.0','mental','exam','relevant',3,0,'["neuro"]','Documenta o estado neurológico para reavaliação.'),
('marina','1.0.0','ultrasound','exam','low_value',-8,0,'["abdomen"]','Imagem depende da evolução e de suspeitas abdominais específicas.'),
('marina','1.0.0','ct','exam','low_value',-8,0,'["abdomen"]','Não deve atrasar a investigação da emergência metabólica; dor persistente exige reavaliação.'),
('marina','1.0.0','ogtt','exam','inappropriate',-12,0,'["history"]','Sobrecarga oral de glicose é inadequada neste cenário.');
