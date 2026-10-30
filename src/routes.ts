export interface AppRoute {
  path: string;
  label: string;
  /** Texto curto exibido no topo da tela. */
  summary: string;
}

/** Ordem do fluxo de trabalho (SPEC, Fase 0). */
export const ROUTES: readonly AppRoute[] = [
  {
    path: '/cofres',
    label: 'Cofres',
    summary: 'Cada inquérito fica num cofre criptografado, protegido por senha.',
  },
  {
    path: '/documentos',
    label: 'Documentos',
    summary: 'Importe os PDFs do inquérito e confira o texto extraído de cada folha.',
  },
  {
    path: '/revisao',
    label: 'Revisão',
    summary: 'Revise os dados pessoais encontrados e atribua papéis aos envolvidos.',
  },
  {
    path: '/exportar',
    label: 'Exportar',
    summary: 'Gere o texto pseudonimizado para colar na IA.',
  },
  {
    path: '/reidentificar',
    label: 'Reidentificar',
    summary: 'Cole a análise devolvida pela IA para restaurar os nomes reais.',
  },
  {
    path: '/configuracoes',
    label: 'Configurações',
    summary: 'Ajustes de bloqueio, listas de exclusão e opções de exportação.',
  },
];
