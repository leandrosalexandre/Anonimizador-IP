// Palavras que não fazem parte de nomes de pessoas (minúsculas, sem acentos): cargos, órgãos,
// termos jurídicos e processuais, peças do inquérito, rótulos de formulários, logradouros, meses
// e lugares. Uma sequência de palavras capitalizadas é quebrada nessas palavras, de modo que
// "INDICIO FRANCISCO DA SILVA" vira "FRANCISCO DA SILVA" e "Estado do Ceará" é descartado.
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
`
  .split(/\s+/)
  .filter(Boolean);

/** Cargos e funções que indicam autoridade ou servidor no exercício da função (a manter). */
export const AUTHORITY_TITLE =
  /(?<![\p{L}\p{N}])(?:delegad\p{L}(?:\s+de\s+pol[ií]cia(?:\s+civil)?)?|escriv\p{L}{1,3}|inspetor[a]?|agente(?:\s+de\s+pol[ií]cia)?|investigador[a]?|comiss[áa]ri[oa]|perit[oa](?:\s+criminal)?|ju[ií]z[a]?(?:\s+de\s+direito)?|promotor[a]?(?:\s+de\s+justi[çc]a)?|defensor[a]?\s+p[úu]blic[oa]|dpc|mm\.?\s*ju[ií]z[a]?)(?![\p{L}\p{N}])/iu;
