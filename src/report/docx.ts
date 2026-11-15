// Gera o .docx do relatório no padrão do modelo: brasões no cabeçalho, título centralizado e
// sublinhado, quadro de referência, parágrafos justificados com recuo, citações recuadas, local
// e data, assinatura centralizada e rodapé da unidade. Tudo montado no aparelho (WordprocessingML
// escrito à mão + ZIP sem compressão).
import type { Block, ReportTemplate, Run } from './model';
import { zipStore, type ZipEntry } from './zip';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FONT = 'Arial';
const cm = (n: number) => Math.round(n * 567); // twips
const emu = (n: number) => Math.round(n * 360000);

function run(r: Run, opts: { size?: number; underline?: boolean } = {}): string {
  const props = [
    `<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>`,
    r.bold ? '<w:b/>' : '',
    r.italic ? '<w:i/>' : '',
    opts.underline ? '<w:u w:val="single"/>' : '',
    `<w:sz w:val="${opts.size ?? 22}"/><w:szCs w:val="${opts.size ?? 22}"/>`,
  ].join('');
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${esc(r.text)}</w:t></w:r>`;
}

interface ParaOpts {
  align?: 'both' | 'center' | 'left' | 'right';
  firstLine?: number;
  left?: number;
  line?: number;
  before?: number;
  after?: number;
  size?: number;
  underline?: boolean;
  keepNext?: boolean;
}

function para(runs: Run[], o: ParaOpts = {}): string {
  const props = [
    o.keepNext ? '<w:keepNext/>' : '',
    `<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 0}" w:line="${o.line ?? 360}" w:lineRule="auto"/>`,
    `<w:ind w:left="${o.left ?? 0}" w:firstLine="${o.firstLine ?? 0}"/>`,
    `<w:jc w:val="${o.align ?? 'both'}"/>`,
  ].join('');
  const body = runs
    .map((r) =>
      run(r, { ...(o.size ? { size: o.size } : {}), ...(o.underline ? { underline: true } : {}) }),
    )
    .join('');
  return `<w:p><w:pPr>${props}</w:pPr>${body}</w:p>`;
}

function referenceTable(lines: Run[][]): string {
  const border = (side: string) =>
    `<w:${side} w:val="single" w:sz="8" w:space="0" w:color="000000"/>`;
  const cell = lines.map((l) => para(l, { line: 360 })).join('');
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${[
      'top',
      'left',
      'bottom',
      'right',
    ]
      .map(border)
      .join('')}</w:tblBorders>` +
    `<w:tblCellMar><w:left w:w="120" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tr><w:tc><w:tcPr><w:tcW w:w="5000" w:type="pct"/></w:tcPr>${cell}</w:tc></w:tr></w:tbl>` +
    para([], { after: 120 })
  );
}

function blockXml(block: Block): string {
  switch (block.kind) {
    case 'title':
      return para([{ text: block.text, bold: true }], {
        align: 'center',
        size: 28,
        underline: true,
        before: 240,
        after: 360,
      });
    case 'reference':
      return referenceTable(block.lines);
    case 'vocative':
      return para(block.runs, { left: cm(1.5), align: 'left', after: 60 });
    case 'heading':
      return para([{ text: block.text, bold: true }], {
        align: 'left',
        underline: true,
        before: 360,
        after: 120,
        keepNext: true,
      });
    case 'paragraph':
      return para(block.runs, { firstLine: cm(1.5), after: 120 });
    case 'quote':
      return para(block.runs, { left: cm(4), size: 20, line: 240, before: 120, after: 240 });
    case 'date':
      return para([{ text: block.text }], {
        firstLine: cm(1.5),
        before: 360,
        after: 360,
        align: 'left',
      });
    case 'signature':
      return block.lines.map((l) => para([l], { align: 'center', line: 240 })).join('');
  }
}

function image(relId: string, id: number, name: string, widthCm: number, heightCm: number): string {
  const cx = emu(widthCm);
  const cy = emu(heightCm);
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${name}"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
    `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// Página A4 com margens de 2,5 cm (esq.) e 2 cm (dir.): área útil de 16,5 cm.
const PAGE = {
  width: 11906,
  height: 16838,
  left: cm(2.5),
  right: cm(2),
  top: cm(3.2),
  bottom: cm(2.8),
};
const TEXT_WIDTH = PAGE.width - PAGE.left - PAGE.right;

export interface ReportImages {
  left: Uint8Array;
  right: Uint8Array;
}

export function buildDocx(
  blocks: readonly Block[],
  template: ReportTemplate,
  images: ReportImages | null,
): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const document =
    `${XML}<w:document ${NS}><w:body>${blocks.map(blockXml).join('')}` +
    `<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/>` +
    `<w:pgSz w:w="${PAGE.width}" w:h="${PAGE.height}"/>` +
    `<w:pgMar w:top="${PAGE.top}" w:right="${PAGE.right}" w:bottom="${PAGE.bottom}" w:left="${PAGE.left}" w:header="${cm(1)}" w:footer="${cm(0.9)}" w:gutter="0"/>` +
    `</w:sectPr></w:body></w:document>`;

  // Cabeçalho: brasão da Polícia Civil à esquerda e do Governo do Estado à direita (tabulação).
  const headerRuns = images
    ? image('rIdLeft', 1, 'Polícia Civil', 6.9, 1.58) +
      '<w:r><w:tab/></w:r>' +
      image('rIdRight', 2, 'Governo do Estado', 4.7, 1.7)
    : run({ text: 'POLÍCIA CIVIL DO ESTADO DO CEARÁ', bold: true }) +
      '<w:r><w:tab/></w:r>' +
      run({ text: 'GOVERNO DO ESTADO DO CEARÁ', bold: true });
  const header =
    `${XML}<w:hdr ${NS}><w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="${TEXT_WIDTH}"/></w:tabs>` +
    `<w:spacing w:after="240"/></w:pPr>${headerRuns}</w:p></w:hdr>`;

  const footerLines = template.unitLines.map((l) => l.trim()).filter(Boolean);
  const footer = `${XML}<w:ftr ${NS}>${(footerLines.length ? footerLines : [''])
    .map((l) => para([{ text: l, italic: true }], { align: 'center', size: 18, line: 240 }))
    .join('')}</w:ftr>`;

  const styles =
    `${XML}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr>` +
    `<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/><w:sz w:val="22"/><w:szCs w:val="22"/>` +
    `<w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;

  const contentTypes =
    `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` +
    `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` +
    `</Types>`;
  const rels = (items: [string, string, string][]) =>
    `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items
      .map(
        ([id, type, target]) =>
          `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`,
      )
      .join('')}</Relationships>`;

  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
    {
      name: '_rels/.rels',
      data: enc.encode(rels([['rId1', 'officeDocument', 'word/document.xml']])),
    },
    { name: 'word/document.xml', data: enc.encode(document) },
    {
      name: 'word/_rels/document.xml.rels',
      data: enc.encode(
        rels([
          ['rIdStyles', 'styles', 'styles.xml'],
          ['rIdHeader', 'header', 'header1.xml'],
          ['rIdFooter', 'footer', 'footer1.xml'],
        ]),
      ),
    },
    { name: 'word/styles.xml', data: enc.encode(styles) },
    { name: 'word/header1.xml', data: enc.encode(header) },
    { name: 'word/footer1.xml', data: enc.encode(footer) },
  ];
  if (images) {
    entries.push(
      {
        name: 'word/_rels/header1.xml.rels',
        data: enc.encode(
          rels([
            ['rIdLeft', 'image', 'media/pcce.png'],
            ['rIdRight', 'image', 'media/ceara.png'],
          ]),
        ),
      },
      { name: 'word/media/pcce.png', data: images.left },
      { name: 'word/media/ceara.png', data: images.right },
    );
  }
  return zipStore(entries);
}
