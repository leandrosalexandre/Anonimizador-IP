import { Link } from 'react-router';

const STEPS: { title: string; body: string; to: string; link: string }[] = [
  {
    title: 'Crie um cofre para o inquérito',
    body: 'Um cofre por IP, com senha forte. No nome, use só o número do procedimento e a unidade — nunca nomes de pessoas. Não há como recuperar a senha.',
    to: '/cofres',
    link: 'Cofres',
  },
  {
    title: 'Importe os PDFs',
    body: 'Selecione os arquivos do IP (com texto ou escaneados). Confira o número das folhas (fls.) e ajuste o deslocamento se a numeração não for detectada.',
    to: '/documentos',
    link: 'Documentos',
  },
  {
    title: 'Faça o OCR das páginas escaneadas',
    body: 'Toque em “Fazer OCR das páginas sem texto” e mantenha o app aberto. Em “Conferir”, compare a imagem com o texto e corrija as palavras destacadas em amarelo.',
    to: '/documentos',
    link: 'Documentos',
  },
  {
    title: 'Revise os dados pessoais',
    body: 'Detecte os dados pessoais, atribua os papéis (vítima, autor, testemunha…), mantenha as autoridades, descarte falsos positivos e marque o que a detecção perdeu. Confira o resultado lado a lado.',
    to: '/revisao',
    link: 'Revisão',
  },
  {
    title: 'Exporte o texto pseudonimizado',
    body: 'Resolva a varredura residual (o que ainda parece dado pessoal) e copie ou baixe o texto, dividido em partes se o IP for longo.',
    to: '/exportar',
    link: 'Exportar',
  },
  {
    title: 'Peça a análise à IA',
    body: 'Cole o texto na IA (por exemplo, o Claude) e faça as perguntas. Peça que mantenha os marcadores entre colchetes e cite as folhas. Copie a resposta.',
    to: '/exportar',
    link: 'Exportar',
  },
  {
    title: 'Reidentifique a análise',
    body: 'Cole a resposta da IA para ver os nomes reais. Confira os marcadores desconhecidos em vermelho. O texto reidentificado contém dados reais: não o envie a serviços externos.',
    to: '/reidentificar',
    link: 'Reidentificar',
  },
];

export function HelpPage() {
  return (
    <section aria-labelledby="titulo-pagina">
      <h1 id="titulo-pagina">Como usar</h1>
      <p className="summary">O fluxo completo, em 7 passos. Tudo acontece neste aparelho.</p>
      <ol className="help-steps">
        {STEPS.map((step) => (
          <li key={step.title}>
            <h2>{step.title}</h2>
            <p>{step.body}</p>
            <Link to={step.to}>Ir para {step.link}</Link>
          </li>
        ))}
      </ol>
      <div className="panel">
        <h2>Dicas</h2>
        <ul>
          <li>
            O cofre fecha quando você toca em “Bloquear”, após 10 minutos sem uso ou ao fechar o
            app. Ajuste em <Link to="/configuracoes">Configurações</Link>.
          </li>
          <li>
            Para levar o inquérito a outro aparelho ou guardar uma cópia, use “Exportar” na tela{' '}
            <Link to="/cofres">Cofres</Link> (arquivo .ipcofre, cifrado com a senha do cofre).
          </li>
          <li>Ao concluir o caso, apague o cofre deste aparelho.</li>
        </ul>
      </div>
    </section>
  );
}
