// Palavras que não fazem parte de nomes de pessoas (minúsculas, sem acentos): cargos, órgãos,
// termos jurídicos e processuais, peças do inquérito, rótulos de formulários, logradouros, meses
// e lugares; órgãos e unidades de saúde; termos médicos; termos de qualificação ("SOLTEIRO",
// "PARDA") e tipos de crime. Uma sequência de palavras capitalizadas é quebrada nessas palavras,
// de modo que "INDICIO FRANCISCO DA SILVA" vira "FRANCISCO DA SILVA" e "Estado do Ceará" é
// descartado.
// O usuário pode acrescentar termos nas configurações.
export const DEFAULT_EXCLUSIONS = `
estado secretaria seguranca publica publico defesa social policia civil militar federal rodoviaria
delegacia delegacias distrito departamento divisao nucleo coordenadoria superintendencia
delegado delegada escrivao escriva escrivaes inspetor inspetora agente agentes investigador
investigadora comissario comissaria perito perita pericia peritos forense criminal criminalistica
juiz juiza juizo promotor promotora promotoria defensor defensora defensoria ministerio poder
judiciario judiciaria tribunal justica vara varas comarca cartorio cartorios oficial oficiala
codigo penal processo processual lei leis decreto artigo art arts inciso alinea paragrafo caput
constituicao republica estatuto sumula
boletim ocorrencia ocorrencias inquerito inqueritos policial termo termos declaracoes declaracao
depoimento depoimentos qualificacao interrogatorio auto autos apresentacao apreensao laudo laudos
exame relatorio despacho portaria oficio certidao mandado prisao flagrante preventiva temporaria
notificacao intimacao representacao denuncia queixa medida medidas protetiva protetivas requisicao
alcunha apelido vulgo mae pai genitora genitor natureza incidencia tipificacao capitulacao local data datas fato fatos relato historico nome nomes filiacao natural naturalidade
profissao endereco telefone telefones email cpf rg cnh cep dn obs observacao observacoes
comunicante vitima vitimas autor autores autora investigado investigada indiciado indiciada
conduzido conduzida testemunha testemunhas informante declarante interrogado interrogada
advogado advogada oab atendente requisitante orgao conclusao
que nada mais lido achado conforme cumpra autue junte intime remetam registre oficie ouca
senhor senhora sr sra dr dra exmo exma ilmo ilma mm gerente atenciosamente resolve determino
represento indicio indicia sugiro instaurar instauro certifico
documento ficticio gerado testes contem dados reais
pefoce pcce pc pm prf pf sspds sesp ssp sds mp mpce tjce tj stf stj detran renavam chassi placa
marca modelo cor honda taurus samsung motorola apple iphone vw volkswagen fiat chevrolet gm ford
toyota hyundai renault yamaha suzuki gol uno palio celta onix hb20 cg titan fan biz
revolver pistola calibre motocicleta moto veiculo veiculos automovel carro celular aparelho
banco agencia conta corrente poupanca pix chave caixa bradesco itau santander nubank
rua avenida av travessa tv alameda rodovia estrada bairro conjunto quadra lote apto apartamento
bloco casa sitio fazenda vila km praca beco viela setor
fortaleza ceara municipio cidade capital interior caucaia maracanau juazeiro
crato iguatu quixada
janeiro fevereiro abril maio junho julho agosto setembro outubro novembro dezembro
segunda terca quarta quinta sexta sabado domingo feira
sim nao total valor reais rs
ltda me eireli epp sa
governo secretaria pericias pericia forense nucleo regional municipal estadual unidade unidades
hospital hospitais misericordia casa upa ubs saude clinica maternidade policlinica instituto iml
ijf samu bombeiros ciops cisp aisp coordenadoria batalhao companhia cpchoque raio guarda urgencia
emergencia atendimento ambulatorio enfermaria pronto fratura fraturas radio ulna tce politrauma
politraumatismo uti cti cirurgia cirurgico cirurgica obito lesao lesoes ferimento ferimentos
hematoma hematomas escoriacao escoriacoes contusao contusoes traumatismo cranioencefalico craniano
diagnostico diagnosticos conduta analgesia imobilizacao sutura internacao internado internada
tomografia rx radiografia leve grave graves moderado moderada esquerda esquerdo direita direito
membro membros superior superiores inferior inferiores torax abdome abdominal cabeca face braco
antebraco perna femur tibia fibula umero clavicula costela costelas perfuracao perfurante
perfurocortante contundente cortante projetil projeteis paf faf hemorragia sangramento choque
parada cardiorrespiratoria exposta curativo medicacao paciente prontuario cns sus crm medico
medica medicos enfermeiro enfermeira plantonista necropsia necroscopico cadaver morte evolucao
observacao queixa brasil brasileiro brasileira brasileiros solteiro solteira casado casada
divorciado divorciada viuvo viuva separado separada uniao estavel convivente alfabetizado
alfabetizada analfabeto analfabeta fundamental medio completo incompleto ensino escolaridade grau
instrucao autonomo autonoma desempregado desempregada agricultor agricultora servente pedreiro
estudante aposentado aposentada domestica domestico comerciante vendedor vendedora motorista
mototaxista lavrador lavradora masculino feminino sexo genero cor raca etnia pardo parda preto
preta negro negra amarelo amarela indigena civil nacionalidade ocupacao documento identidade
expedidor emissor expedicao uf logradouro numero complemento referencia ponto celular fone contato
registro hora horario idade anos envolvido envolvidos envolvida envolvidas tipo condicao situacao
relacao vinculo parentesco participacao dados noticiante noticiantes acusado acusados acusada
acusadas suspeito suspeitos suspeita suspeitas relato zona rural urbana centro distrito localidade
povoado assentamento riacho lagoa seca vizinho vizinha vizinhos residente domiciliado domiciliada
homicidio tentado tentada tentativa consumado lesao corporal roubo furto trafico estupro ameaca
ameacas violencia feminicidio latrocinio receptacao porte posse ilegal arma armas fogo drogas
entorpecentes dano injuria calunia difamacao sequestro extorsao estelionato titulo eleitor
eleitoral passaporte carteira trabalho previdencia social natureza tentativa fls folha folhas
pagina
`
  .split(/\s+/)
  .filter(Boolean);

/** Cargos e funções que indicam autoridade ou servidor no exercício da função (a manter). */
export const AUTHORITY_TITLE =
  /(?<![\p{L}\p{N}])(?:delegad\p{L}(?:\s+de\s+pol[ií]cia(?:\s+civil)?)?|escriv\p{L}{1,3}|inspetor[a]?|agente(?:\s+de\s+pol[ií]cia)?|investigador[a]?|comiss[áa]ri[oa]|perit[oa](?:\s+criminal)?|ju[ií]z[a]?(?:\s+de\s+direito)?|promotor[a]?(?:\s+de\s+justi[çc]a)?|defensor[a]?\s+p[úu]blic[oa]|dpc|mm\.?\s*ju[ií]z[a]?)(?![\p{L}\p{N}])/iu;
