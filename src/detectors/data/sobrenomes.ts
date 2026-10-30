// Sobrenomes comuns no Brasil (sem acentos, minúsculas). Reforçam a detecção de nomes; não precisam
// ser exaustivos, pois a detecção também usa a lista de prenomes, rótulos e gatilhos do texto.
export const SOBRENOMES = `
silva santos oliveira souza sousa rodrigues ferreira alves pereira lima gomes costa ribeiro
martins carvalho almeida lopes soares fernandes vieira barbosa rocha dias nascimento andrade
moreira nunes marques machado mendes freitas cardoso ramos goncalves santana teixeira araujo
melo mello cavalcante cavalcanti batista neves monteiro moura borges correia pinto castro campos
reis farias faria cunha bezerra azevedo sampaio xavier medeiros pires miranda brito barros
siqueira matos mattos queiroz lins duarte coelho tavares cruz leite sales salles maia magalhaes
nogueira peixoto amaral aguiar morais moraes paiva vasconcelos holanda albuquerque bastos braga
brandao bueno camargo caldeira castilho chaves coutinho damasceno diniz domingues dourado estevam
fonseca franco frota furtado galvao garcia godoy guedes guimaraes henrique jesus lacerda leal
leao leitao lemos macedo maciel magalhaes malta marinho mascarenhas meireles meneses menezes
mesquita mota motta muniz nobre noronha novaes novais olinda pacheco padilha paes pais parente
passos pedrosa peres pimentel pinheiro porto prado quintela rabelo rangel rego resende rezende
ribas sa sabino saldanha salgado sena sena serra severo simoes sobral sobrinho tabosa teles
telles torres trindade valente vasconcellos veloso viana vidal vilar vilela xavier ximenes
abreu acioly adriano afonso aguiar alencar alexandre amorim antunes aragao arruda assis avila
bandeira barreto barreira barroso belo benevides bento bessa bittencourt bonfim calado calixto
camara campelo canuto cardeal carneiro carvalhal casimiro cavalheiro cesar cidrao colares
conceicao cordeiro cortez couto crispim dantas eloi estrela evangelista falcao feitosa felix
figueiredo filho fontenele forte frazao freire gadelha gaspar girao gois gomes gondim gurgel
honorio inacio jucá juca junior jacinto jorge justino landim leandro linhares loiola loyola
lucena luna magno mamede marques marrocos martins matias mendonca mourao neto nepomuceno nobrega
norões oliveira onofre pamplona patricio pessoa pimenta pontes quaresma quezado rebouças reboucas
rolim romao rosa rufino sabóia saboia sacramento santiago saraiva sobreira tome uchoa ventura
vieira xenofonte bessa bonfim farias holanda
`
  .split(/\s+/)
  .filter(Boolean);
