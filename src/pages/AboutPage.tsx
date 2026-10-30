import { Link } from 'react-router';

export function AboutPage() {
  return (
    <section aria-labelledby="titulo-pagina">
      <h1 id="titulo-pagina">Sobre</h1>
      <p className="summary">
        Anonimizador de IP · versão {__APP_VERSION__} ({__BUILD_DATE__})
      </p>

      <div className="panel">
        <h2>Nada sai deste aparelho</h2>
        <ul>
          <li>
            O app não tem servidor, não envia dados pela rede e não se comunica com nenhuma IA. O
            texto pseudonimizado só sai do aparelho quando você o copia ou baixa.
          </li>
          <li>
            Não há analytics, telemetria nem relatórios de erro. Nenhuma fonte ou biblioteca é
            baixada de fora.
          </li>
          <li>
            Depois de instalado, funciona sem internet: leitura de PDF, OCR, detecção, exportação e
            reidentificação acontecem neste aparelho.
          </li>
        </ul>
      </div>

      <div className="panel">
        <h2>Segurança</h2>
        <ul>
          <li>
            O conteúdo de cada cofre (textos, imagens, PDFs e entidades) é gravado só cifrado, com
            AES-GCM de 256 bits e chave derivada da senha (PBKDF2-SHA-256, 600.000 iterações).
          </li>
          <li>
            A senha e a chave nunca são gravadas. Sem a senha, o cofre não pode ser aberto, e não há
            recuperação.
          </li>
          <li>
            O nome do cofre e as datas ficam visíveis para listar os cofres: não use nomes de
            pessoas.
          </li>
          <li>
            Arquivos baixados (texto exportado, análise reidentificada, PDF pesquisável) não são
            cifrados.
          </li>
        </ul>
      </div>

      <div className="panel">
        <h2>Limitações</h2>
        <ul>
          <li>
            <strong>A revisão humana é obrigatória.</strong> A detecção automática pode deixar
            passar dados pessoais ou marcar palavras comuns.
          </li>
          <li>
            A pseudonimização <strong>não elimina o risco de identificação pelo contexto</strong>{' '}
            (datas, locais, profissões, relações familiares, descrição dos fatos).
          </li>
          <li>
            Textos manuscritos e números de folha escritos à mão não são reconhecidos pelo OCR.
          </li>
          <li>A qualidade do OCR depende da digitalização: confira as páginas escaneadas.</li>
        </ul>
      </div>

      <div className="panel">
        <h2>Software de terceiros</h2>
        <p className="hint">
          pdf.js (Apache 2.0), Tesseract e tesseract.js (Apache 2.0), React (MIT), pdf-lib (MIT),
          idb (ISC) e lista de prenomes do Censo IBGE 2010 (dados públicos, via
          brazilian-gender-assumption, MIT). Todos empacotados no próprio app.
        </p>
      </div>
      <p>
        <Link to="/como-usar">Como usar</Link>
      </p>
    </section>
  );
}
