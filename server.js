import express from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import TurndownService from 'turndown';
import gfmPkg from 'turndown-plugin-gfm';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import simpleGit from 'simple-git';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const SENHA = process.env.SENHA || '';
const ROOT = path.resolve(process.env.NOTAS_DIR || path.join(DIR, 'notas'));
const MIDIA = path.join(ROOT, '_midia');
fs.mkdirSync(ROOT, { recursive: true });

const TIPOS = ['tutorial', 'erro-solucao', 'ideia', 'anotacao'];
const MODELOS = {
  tutorial: '// Objetivo\n\n// Pré-requisitos\n\n// Passos\n\n# comando aqui\n\n// Validação\n\n// Problemas comuns\n',
  'erro-solucao': '// Sintoma\n\n// Causa\n\n// Solução\n\n# comando aqui\n\n// Como verificar\n',
  ideia: '// Ideia\n\n// Por que vale a pena\n\n// Próximos passos\n',
  anotacao: ''
};

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slug = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const dia = d => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || ''));
const limpaTags = t => [...new Set((Array.isArray(t) ? t : String(t || '').split(',')).map(slug).filter(Boolean))];

// Git: histórico de cada nota
const git = simpleGit(ROOT, { config: ['user.name=NEXUM', 'user.email=cerebro@local'] });
async function commit(msg) {
  try {
    if (!fs.existsSync(path.join(ROOT, '.git'))) await git.init();
    await git.add('-A');
    await git.commit(msg);
  } catch (e) { console.error('git:', e.message); }
}

// Leitura dos arquivos e índice de busca (reconstruído a partir dos .md)
function lerTodas() {
  const out = [];
  for (const t of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!t.isDirectory() || /^[._]/.test(t.name)) continue;
    for (const f of fs.readdirSync(path.join(ROOT, t.name))) {
      if (!f.endsWith('.md')) continue;
      const { data, content } = matter(fs.readFileSync(path.join(ROOT, t.name, f), 'utf8'));
      const nome = f.slice(0, -3);
      out.push({
        id: `${t.name}/${nome}`, tema: t.name, titulo: data.titulo || nome,
        tipo: TIPOS.includes(data.tipo) ? data.tipo : 'anotacao',
        tags: [].concat(data.tags || []).map(String),
        criado: dia(data.criado), atualizado: dia(data.atualizado), corpo: content,
        _t: norm(data.titulo || nome), _g: norm([].concat(data.tags || []).join(' ')), _c: norm(content),
        resumo: content.replace(/```[\s\S]*?```/g, '').replace(/[#>*`_\[\]!]/g, '').replace(/\s+/g, ' ').trim().slice(0, 140)
      });
    }
  }
  return out;
}
let cache = [];
const reindexar = () => { cache = lerTodas(); };
function trecho(n, termos) {
  const pos = termos.map(t => n._c.indexOf(t)).filter(x => x >= 0).sort((x, y) => x - y);
  const ini = Math.max(0, (pos[0] ?? 0) - 50);
  const seg = n.corpo.slice(ini, ini + 160).replace(/\s/g, ' ');
  const ns = norm(seg);
  let out = '';
  if (ns.length !== seg.length) out = esc(seg);
  else {
    const m = new Array(seg.length).fill(false);
    for (const t of termos) for (let p = ns.indexOf(t); p >= 0; p = ns.indexOf(t, p + 1)) for (let k = p; k < p + t.length; k++) m[k] = true;
    for (let k = 0; k < seg.length; k++) out += (m[k] && !m[k - 1] ? '<mark>' : '') + esc(seg[k]) + (m[k] && !m[k + 1] ? '</mark>' : '');
  }
  return (ini > 0 ? '…' : '') + out + '…';
}
function buscar({ q, tema, tipo, tag }) {
  let lista = [...cache].sort((a, b) => b.atualizado.localeCompare(a.atualizado));
  const termos = norm(q || '').match(/[\p{L}\p{N}]+/gu) || [];
  if (termos.length) {
    lista = lista.map(n => {
      if (!termos.every(t => n._t.includes(t) || n._g.includes(t) || n._c.includes(t))) return null;
      const pts = termos.reduce((s, t) => s + (n._t.includes(t) ? 10 : 0) + (n._g.includes(t) ? 5 : 0) + Math.min(n._c.split(t).length - 1, 5), 0);
      return { ...n, pts, trecho: trecho(n, termos) };
    }).filter(Boolean).sort((a, b) => b.pts - a.pts);
  }
  return lista.filter(n => (!tema || n.tema === tema) && (!tipo || n.tipo === tipo) && (!tag || n.tags.includes(tag)))
    .map(({ corpo, _t, _g, _c, pts, ...r }) => r);
}
const conta = arr => Object.entries(arr.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {}))
  .map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome));
const md = new MarkdownIt({ html: false, linkify: true });

// ---------- Renderização própria: caixas de código, títulos com âncora, passos e avisos ----------
const PROMPT = { bash: '$', sh: '$', shell: '$', console: '$', powershell: 'PS>', ps1: 'PS>' };
md.renderer.rules.fence = (tokens, i) => {
  const t = tokens[i], lang = (t.info || '').trim().split(/\s+/)[0].toLowerCase(), p = PROMPT[lang] || '';
  const txt = t.content.replace(/\n$/, '');
  const linhas = txt.split('\n').map(l => `<span class="ln" data-p="${p}">${esc(l)}</span>`).join('');
  return `<div class="codigo${p ? ' prompt' : ''}" data-raw="${esc(txt)}"><button type="button" class="copiar" title="Copiar">Copiar</button><pre><code>${linhas}</code></pre></div>\n`;
};
md.renderer.rules.heading_open = (tokens, i, o, e, self) => {
  if (['h2', 'h3'].includes(tokens[i].tag)) tokens[i].attrSet('id', slug(tokens[i + 1].content) || 'secao');
  return self.renderToken(tokens, i, o);
};
md.renderer.rules.ordered_list_open = (tokens, i, o, e, self) => {
  const st = tokens[i].attrGet('start');
  if (st) tokens[i].attrSet('style', `counter-reset:p ${Number(st) - 1}`);
  return self.renderToken(tokens, i, o);
};
const callouts = h => h
  .replace(/<blockquote>(\s*<p><strong>(?:aten[çc][ãa]o|cuidado|aviso|importante|perigo))/gi, '<blockquote class="aviso">$1')
  .replace(/<blockquote>(\s*<p><strong>(?:dica|obs|nota|observa[çc][ãa]o))/gi, '<blockquote class="nota">$1');
const renderMd = s => callouts(md.render(paraMarkdown(s)));
const estatisticas = corpo => {
  const pilha = []; let passos = 0, blocos = 0;
  for (const k of md.parse(paraMarkdown(corpo), {})) {
    if (k.type === 'fence') blocos++;
    else if (k.type === 'ordered_list_open' || k.type === 'bullet_list_open') pilha.push(k.type);
    else if (k.type === 'ordered_list_close' || k.type === 'bullet_list_close') pilha.pop();
    else if (k.type === 'list_item_open' && pilha.length === 1 && pilha[0] === 'ordered_list_open') passos++;
  }
  return { passos, blocos, minutos: Math.max(1, Math.round(String(corpo || '').split(/\s+/).length / 200)) };
};
const sumario = corpo => { const t = md.parse(paraMarkdown(corpo), {}); return t.map((k, i) => k.type === 'heading_open' && k.tag === 'h2' ? { id: slug(t[i + 1].content) || 'secao', texto: t[i + 1].content } : null).filter(Boolean); };

// ---------- Normalização na importação: dá o padrão do sistema ao texto vindo do Word ----------
// <<normalizar
const FORTE = /^(\$ |sudo |apt(-get)? |dpkg |systemctl |journalctl |service |cd |ls |cat |nano |vim? |chmod |chown |mkdir |rm |cp |mv |tar |curl |wget |ssh |scp |rsync |ip |ping |nft |iptables |ufw |mount |umount |fdisk |lsblk |blkid |df |du |free |kill |grep |sed |awk |echo |export |source |docker |git |npm |node |python3? |pip3? |qm |pct |pvesm |pvecm |pveam |zfs |zpool |proxmox-\S+ |wg |wg-quick |openssl |hostnamectl |timedatectl |crontab |\.\/|(Get|Set|New|Remove|Import|Start|Stop|Restart|Invoke|Test|Enable|Disable|Add|Install)-\w+|ipconfig|netsh |gpupdate|nslookup|tracert|robocopy|winget |choco |msiexec |wsl )/;
const FRACO = /^(\[[\w .-]+\]|[A-Za-z][\w.-]*\s*=\s*\S.*|\/[\w.\-]+(\/[\w.\-]*)+|[A-Z]:\\\S.*)$/;
const desesc = s => s.replace(/\\([\\`*_{}\[\]()#+\-.!>~|<])/g, '$1');
function tipoLinha(l, editor) {
  const r = desesc(l).trim();
  if (!r) return 'b';
  if (/^\s*\\#/.test(l) || (editor && /^\s*#(\s|$)/.test(l))) return 'm';
  const mk = l.match(/^\s*#\s+(.+)$/);
  if (mk && (FORTE.test(mk[1]) || FRACO.test(mk[1]))) return 'm';
  if (/^([-*+]|\d+[.)])\s/.test(l.trim())) return 'p';
  const n = r.split(/\s+/).length;
  if (FORTE.test(r) && n <= 30 && !(n > 12 && /[a-zà-ú]\.$/i.test(r))) return 'f';
  return FRACO.test(r) ? 'w' : 'p';
}
const PS = /(^|\n)\s*((Get|Set|New|Remove|Import|Start|Stop|Restart|Invoke|Test|Enable|Disable|Add|Install)-\w+|\$\w+\s*=)|[A-Z]:\\|ipconfig|netsh /;
const linguagem = t => {
  if (PS.test(t)) return 'powershell';
  const ls = t.split('\n').filter(x => x.trim());
  if (ls.some(x => FORTE.test(x.trim()))) return 'bash';
  if (ls.every(x => FRACO.test(x.trim()))) return 'ini';
  return ls.every(x => /^\s*([\w.-]+:(\s|$)|-\s|[{}\[\]])/.test(x)) ? 'yaml' : 'bash';
};
function normalizar(texto, titulo, editor = false) {
  let linhas = String(texto || '').replace(/\r/g, '').split('\n').map(l => l.replace(/\s+$/, ''));
  const i0 = linhas.findIndex(l => l.trim());
  if (!editor && i0 >= 0) {
    const h1 = linhas[i0].match(/^#\s+(.+)$/), qtdH1 = linhas.filter(l => /^#\s/.test(l)).length;
    const txt = desesc((h1 ? h1[1] : linhas[i0]).replace(/^#+\s*|^\/\/+\s*|\*\*/g, '')).trim();
    if ((h1 && qtdH1 === 1) || norm(txt) === norm(titulo || '')) { if (h1 && qtdH1 === 1) titulo = txt; linhas.splice(i0, 1); }
  }
  let fence = false;
  const marca = linhas.map(l => { if (/^\s*```/.test(l)) { fence = !fence; return 'x'; } return fence ? 'x' : tipoLinha(l, editor); });
  const cod = m => m === 'f' || m === 'w' || m === 'm';
  const out = [];
  for (let i = 0; i < linhas.length;) {
    if (cod(marca[i])) {
      let j = i, ult = i;
      while (j < linhas.length && (cod(marca[j]) || (!editor && marca[j] === 'b' && marca[j + 1] === marca[ult]))) { if (marca[j] !== 'b') ult = j; j++; }
      const ms = marca.slice(i, ult + 1), nf = ms.filter(x => x === 'f' || x === 'm').length, nw = ms.filter(x => x === 'w').length;
      if (nf >= 1 || nw >= 2) {
        const ind = (linhas[i].match(/^ +/) || [''])[0];
        const txt = linhas.slice(i, ult + 1).map((l, k) => { const d = desesc(l.startsWith(ind) ? l.slice(ind.length) : l); return ms[k] === 'm' ? d.replace(/^\s*#\s?/, '') : d; }).join('\n');
        out.push('', ind + '```' + linguagem(txt), ...txt.split('\n').map(x => ind + x), ind + '```', '');
        i = ult + 1; continue;
      }
    }
    out.push(linhas[i]); i++;
  }
  fence = false;
  const niveis = [];
  out.forEach(l => { if (/^\s*```/.test(l)) fence = !fence; else if (!fence) { const m = l.match(/^(#{1,6})\s/); if (m) niveis.push(m[1].length); } });
  const desloc = niveis.length ? 2 - Math.min(...niveis) : 0, nivelNegrito = niveis.length ? 3 : 2;
  fence = false;
  const fim = out.map(l => {
    if (/^\s*```/.test(l)) { fence = !fence; return l; }
    if (fence) return l;
    let m;
    if ((m = l.match(/^\s*(\/{2,4})\s+(.+)$/))) return '#'.repeat(m[1].length) + ' ' + desesc(m[2]).replace(/^\*\*(.*)\*\*$/, '$1');
    if ((m = l.match(/^(#{1,6})\s+(.*)$/))) return '#'.repeat(Math.min(4, Math.max(2, m[1].length + desloc))) + ' ' + desesc(m[2]).replace(/^\*\*(.*)\*\*$/, '$1');
    if ((m = l.match(/^\*\*([^*]{3,80}?)\*\*:?$/)) && !/[.!?]$/.test(m[1])) return '#'.repeat(nivelNegrito) + ' ' + desesc(m[1]).replace(/:$/, '');
    l = l.replace(/^(\s*)(\d+)\\\.\s/, '$1$2. ').replace(/^(\s*)\\([-*+])\s/, '$1$2 ');
    if ((m = l.match(/^(?:\*\*)?(Obs\.?|Observação|Nota|Atenção|Cuidado|Aviso|Importante|Dica|Perigo)(?:\*\*)?\s*[:\-–]\s*(?:\*\*)?(.+)$/i))) return `> **${m[1].replace(/\.$/, '')}:** ${m[2]}`;
    return l;
  });
  return { titulo, corpo: paraNotacao(fim.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n') };
}
// Notação do sistema: "// Título" (2 a 4 barras) e "# código" (linhas seguidas formam uma caixa)
function paraMarkdown(texto) {
  const ls = String(texto || '').replace(/\r/g, '').split('\n'), out = [], marca = /^(\s*)#(?: (.*))?$/;
  let fence = false;
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i];
    if (/^\s*```/.test(l)) { fence = !fence; out.push(l); continue; }
    if (fence) { out.push(l); continue; }
    let m = l.match(/^\s*(\/{2,4})\s+(.+)$/);
    if (m) { out.push('#'.repeat(m[1].length) + ' ' + m[2]); continue; }
    if ((m = l.match(marca))) {
      const ind = m[1], bloco = [m[2] ?? ''];
      for (let n; i + 1 < ls.length && (n = ls[i + 1].match(marca)) && n[1] === ind; i++) bloco.push(n[2] ?? '');
      out.push(ind + '```' + linguagem(bloco.join('\n')), ...bloco.map(x => ind + x), ind + '```');
      continue;
    }
    out.push(l);
  }
  return out.join('\n');
}
function paraNotacao(texto) {
  let fence = false, ind = '';
  const out = [];
  for (const l of String(texto || '').split('\n')) {
    const f = l.match(/^(\s*)```/);
    if (f) { fence = !fence; if (fence) ind = f[1]; continue; }
    if (fence) { const c = l.startsWith(ind) ? l.slice(ind.length) : l; out.push(ind + (c.trim() ? '# ' + c : '#')); continue; }
    const h = l.match(/^(#{2,6})\s+(.*)$/);
    out.push(h ? '/'.repeat(Math.min(4, h[1].length)) + ' ' + h[2] : l);
  }
  return out.join('\n');
}
// normalizar>>

// ---------- Leitura do docx: códigos em fonte monoespaçada e caixas de uma célula ----------
const MONO = /consolas|courier|lucida console|mono|menlo|cascadia|source code|fira code/i;
const marcaCodigo = mammoth.transforms?.paragraph?.(p => {
  const runs = (p.children || []).filter(r => r.type === 'run' && (r.children || []).some(c => c.type === 'text' && c.value.trim()));
  return runs.length && runs.every(r => MONO.test(r.font || '')) ? { ...p, styleId: 'Codigo', styleName: 'Codigo' } : p;
});
const des = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
function prepararHtml(html) {
  html = html.replace(/<table>\s*(?:<tbody>)?\s*<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>\s*(?:<\/tbody>)?\s*<\/table>/g, (m, inner) => {
    const txt = inner.replace(/<\/p>\s*<p>/g, '\n').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '');
    const ls = des(txt).split('\n').filter(l => l.trim());
    if (!ls.some(l => FORTE.test(l.trim().replace(/^#\s?/, '')) || /^#\s/.test(l.trim()))) return `<blockquote>${inner}</blockquote>`;
    const limpo = ls.every(l => /^\s*#/.test(l)) ? txt.split('\n').map(l => l.replace(/^\s*#\s?/, '')).join('\n') : txt;
    return `<pre><code>${limpo}</code></pre>`;
  });
  return html.replace(/<pre><code>[\s\S]*?<\/code><\/pre>/g, m => m.replace(/<br\s*\/?>/g, '\n'));
}
const achar = (t, s) => cache.find(n => n.id === `${t}/${s}`);

const app = express();
app.use((req, res, next) => {
  if (!SENHA) return next();
  const h = req.headers.authorization || '';
  const cred = h.startsWith('Basic ') ? Buffer.from(h.slice(6), 'base64').toString() : '';
  const a = Buffer.from(cred.slice(cred.indexOf(':') + 1)), b = Buffer.from(SENHA);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
  res.set('WWW-Authenticate', 'Basic realm="NEXUM"').status(401).send('Autenticação necessária');
});
app.use(express.json({ limit: '5mb' }));
app.use('/midia', express.static(MIDIA));
app.use(express.static(path.join(DIR, 'public')));

app.get('/api/meta', (req, res) => res.json({
  tipos: TIPOS, modelos: MODELOS, temas: conta(cache.map(n => n.tema)), tags: conta(cache.flatMap(n => n.tags))
}));
app.get('/api/notas', (req, res) => res.json(buscar(req.query)));
app.get('/api/notas/:tema/:slug', (req, res) => {
  const n = achar(req.params.tema, req.params.slug);
  if (!n) return res.status(404).json({ erro: 'Nota não encontrada.' });
  const { _t, _g, _c, ...r } = n;
  res.json({ ...r, html: renderMd(n.corpo), toc: sumario(n.corpo), stats: estatisticas(n.corpo), notacao: paraNotacao(n.corpo) });
});
app.post('/api/preview', (req, res) => res.json({ html: renderMd(req.body.corpo) }));
app.post('/api/normalizar', (req, res) => res.json(normalizar(req.body.corpo, '', true)));

app.put('/api/notas', async (req, res) => {
  const { id, titulo, tema, tipo, tags, corpo } = req.body;
  if (!String(titulo || '').trim()) return res.status(400).json({ erro: 'Informe um título.' });
  const t = slug(tema) || 'geral';
  const antigo = id ? cache.find(n => n.id === id) : null;
  let nome = antigo ? antigo.id.split('/')[1] : slug(titulo) || 'sem-titulo';
  if (!antigo) { const base = nome; let i = 2; while (fs.existsSync(path.join(ROOT, t, nome + '.md'))) nome = `${base}-${i++}`; }
  const hoje = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(path.join(ROOT, t), { recursive: true });
  const meta = { titulo: titulo.trim(), tipo: TIPOS.includes(tipo) ? tipo : 'anotacao', tema: t, tags: limpaTags(tags), criado: antigo?.criado || hoje, atualizado: hoje };
  fs.writeFileSync(path.join(ROOT, t, nome + '.md'), matter.stringify(String(corpo || ''), meta));
  if (antigo && antigo.id !== `${t}/${nome}`) fs.rmSync(path.join(ROOT, antigo.id + '.md'));
  reindexar();
  await commit(`${antigo ? 'Atualiza' : 'Cria'}: ${meta.titulo}`);
  res.json({ id: `${t}/${nome}` });
});
app.delete('/api/notas/:tema/:slug', async (req, res) => {
  const n = achar(req.params.tema, req.params.slug);
  if (!n) return res.status(404).json({ erro: 'Nota não encontrada.' });
  fs.rmSync(path.join(ROOT, n.id + '.md'));
  reindexar();
  await commit(`Remove: ${n.titulo}`);
  res.json({ ok: true });
});
app.get('/api/historico/:tema/:slug', async (req, res) => {
  const n = achar(req.params.tema, req.params.slug);
  if (!n) return res.json([]);
  try { res.json((await git.log({ file: n.id + '.md', maxCount: 30 })).all.map(c => ({ hash: c.hash.slice(0, 7), data: c.date.slice(0, 10), msg: c.message }))); }
  catch { res.json([]); }
});

// Upload: converte para Markdown e devolve o rascunho (nada é salvo aqui)
const up = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
td.use(gfmPkg.gfm);
const imagens = mammoth.images.imgElement(async img => {
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[img.contentType];
  if (!ext) return { src: '' };
  const buf = await img.readAsBuffer();
  const nome = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16) + '.' + ext;
  fs.mkdirSync(MIDIA, { recursive: true });
  fs.writeFileSync(path.join(MIDIA, nome), buf);
  return { src: '/midia/' + nome };
});
app.post('/api/upload', up.single('arquivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
  const original = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const ext = path.extname(original).toLowerCase();
  try {
    let corpo;
    if (ext === '.docx') corpo = td.turndown(prepararHtml((await mammoth.convertToHtml({ buffer: req.file.buffer }, { convertImage: imagens, transformDocument: marcaCodigo, styleMap: ["p[style-name='Codigo'] => pre > code:separator('\\n')"] })).value));
    else if (ext === '.md') corpo = req.file.buffer.toString('utf8');
    else if (ext === '.txt') corpo = req.file.buffer.toString('utf8').replace(/^(\s*)#/gm, '$1\\#');
    else return res.status(400).json({ erro: 'Formato não suportado. Envie .docx, .md ou .txt.' });
    res.json(normalizar(corpo, path.basename(original, ext)));
  } catch (e) { res.status(500).json({ erro: 'Não foi possível converter o arquivo: ' + e.message }); }
});

reindexar();
await commit('Início');
app.listen(PORT, '0.0.0.0', () => console.log(`NEXUM em http://localhost:${PORT}  (${cache.length} notas)`));
