// @ts-nocheck — 問題データを作る道具 (むずかしい 132 問。docs/plans/problems-hard.md §5)。生成物は src/data/problems/hard/*.json で、JSON が唯一の出所。
// 正常な問題 (基) の 1 か所を変えて異変を入れ、答え合わせの文言・場所・期待集合・基との差を付ける。1 つの異変 = 1 つの原因の変更。
// 場所は『形の欄が読むセル (Slot.reads) だけ』(設計表 §5。形に載らないセルを場所に入れると V1 で落ちる)。違反が場所に触れない二次の症状は changed が受ける。
// 作り方は設計表 §5 の表のとおり (H-03・H-05 は再計算しない・H-13 は 5%・H-21 は営業 CF の主張の向き・H-23 は反転・H-30 は末尾 1 字落とし)。
import { deriveCards } from '../../src/domain/cards.ts';
import { LABELS } from '../../src/domain/labels.ts';
import { POLICY_TEXT } from './gen.ts';
import { verifyProblem } from '../../src/verifier/index.ts';
import { changedCells } from '../../src/verifier/path.ts';

const clone = (x) => JSON.parse(JSON.stringify(x));
const n = (v) => Number(v).toLocaleString('ja-JP');
const fmt1 = (v) => Number(v).toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** 負の数は △ を付ける (資料の標準)。 */
const sg = (v) => (v < 0 ? `△${n(-v)}` : n(v));
/** 小数第 1 位に四捨五入 (0 から遠い方へ)。 */
const r1 = (x) => (Math.sign(x) * Math.round(Math.abs(x) * 10 + 1e-9)) / 10;
const T = (path) => ({ doc: 'tanshin', path });
const I = (path) => ({ doc: 'ir', path });
const C = (slot) => ({ doc: 'card', card: 0, slot });

/** 設計表の形 (`欄=ta:no-comma`・`倍率=×10` など) を読む。 */
function parseForm(form) {
  const m = /^(欄|倍率|社名|文言|反転|科目名|作り方|欠け)=(.+)$/.exec(form);
  if (!m) return {};
  const [, key, value] = m;
  if (key === '欄') {
    const [slot, style] = value.split(':');
    return { slot, style };
  }
  return { [key]: value };
}

/** 貸借対照表の、負債側の小計・合計を内訳から再計算する (H-01: 買掛金だけを動かし、総資産は元のまま)。 */
function resumLiabilities(b) {
  b.totalCurrentLiabilities = b.payables + b.shortTermDebt + b.incomeTaxesPayable + b.otherCurrentLiabilities;
  b.totalLiabilities = b.totalCurrentLiabilities + b.longTermDebt;
  b.totalLiabilitiesAndNetAssets = b.totalLiabilities + b.totalNetAssets;
}

const AUDIT_WORDING = ['決算短信は監査済みです', '決算短信は公認会計士の監査を受けています', '決算短信は監査法人の監査済みです'];
/** H-30 の誤字の欄 → 項目キー (設計表 §5 の誤字の表。誤字 = 標準の科目名の末尾 1 字を落とした形)。 */
const TYPO_ITEM = {
  ocf: 'tanshin.cashFlow.operatingCashFlow',
  ta: 'tanshin.balanceSheet.totalAssets',
  pbt: 'tanshin.incomeStatement.incomeBeforeTax',
  cash: 'tanshin.balanceSheet.cash',
  cfEnd: 'tanshin.cashFlow.cashEnding',
};
const IR_SLOTS = ['irSales', 'irCashCur', 'irCashPrev', 'irDebtPrev', 'irNetDebtPrev'];

/** 形の欄のラベルと、短信か IR かの語。 */
function slotInfo(p, company, slot) {
  const card = deriveCards(p, company, 'hard', { applyEdits: false });
  const s = card.slots.find((x) => x.key === slot);
  if (slot === 'headline') return { label: '見出し語', doc: 'カード', text: card.headline?.word ?? '' };
  if (!s) throw new Error(`形に無い欄: ${slot}`);
  return { label: s.label, doc: IR_SLOTS.includes(slot) || slot === 'irOcf' || slot === 'irSubseq' || slot === 'irSegs' ? 'IR' : '決算短信', text: s.text };
}

/**
 * 変更の定義。各関数は基の複製 q を変更し、{ places, explanation, ...追加 } を返す。
 * ctx = { base, company, companies (全社), row (設計表の 1 行), form (parseForm の結果), i (その種類の何問目か) }。
 */
const RECIPES = {
  'H-01': (q) => {
    const b = q.tanshin.balanceSheet.current;
    const d = Math.max(20, Math.round((b.payables * 0.1) / 10) * 10);
    b.payables += d;
    resumLiabilities(b);
    return {
      places: [T('balanceSheet.current.totalAssets'), T('balanceSheet.current.totalLiabilitiesAndNetAssets')],
      explanation: `貸借対照表の資産合計は ${n(b.totalAssets)} 百万円ですが、負債純資産合計は ${n(b.totalLiabilitiesAndNetAssets)} 百万円で、差は ${n(d)} です (どの小計も内訳の和と合っています)。貸借対照表は、資産の合計と、負債と純資産の合計が必ず一致します。買掛金が ${n(d)} 多く書かれています。`,
    };
  },
  'H-03': (q) => {
    const cf = q.tanshin.cashFlow;
    const pre = cf.incomeBeforeTax;
    cf.incomeBeforeTax = q.tanshin.incomeStatement.current.netIncome; // 再計算しない
    return {
      places: [T('cashFlow.incomeBeforeTax'), T('incomeStatement.current.incomeBeforeTax')],
      explanation: `キャッシュ・フロー計算書の最初の行 (税金等調整前当期純利益) が ${n(cf.incomeBeforeTax)} 百万円で、損益計算書の当期純利益と同じ値です。日本の基準 (間接法) では、営業活動は損益計算書の税金等調整前当期純利益 ${n(pre)} 百万円から始めます。このため、キャッシュ・フロー計算書の最初の行が損益計算書の税金等調整前当期純利益 ${n(q.tanshin.incomeStatement.current.incomeBeforeTax)} 百万円と合いません。`,
    };
  },
  'H-04': (q) => {
    const cf = q.tanshin.cashFlow;
    const was = cf.cashEnding;
    cf.cashEnding = Math.round(was * 1.05);
    return {
      places: [T('cashFlow.cashEnding'), T('balanceSheet.current.cash')],
      explanation: `キャッシュ・フロー計算書の現金及び現金同等物の期末残高は ${n(cf.cashEnding)} 百万円ですが、貸借対照表の現金及び預金は ${n(q.tanshin.balanceSheet.current.cash)} 百万円です (資金の範囲は現金及び預金なので、同じ値のはずです)。差は ${n(cf.cashEnding - was)} 百万円です。`,
    };
  },
  'H-05': (q, ctx) => {
    const cf = q.tanshin.cashFlow;
    const was = cf.receivablesChange;
    // 20% ずらすは、丸めたあとに 20% を割らないよう切り上げる (設計表 §5)。符号を逆にするのは任意の会社・20% は増減が大きい会社だけ
    cf.receivablesChange = ctx.form['作り方'] === '符号を逆に' ? -was : was + Math.sign(was) * Math.ceil(Math.abs(was) * 0.2);
    const b0 = q.tanshin.balanceSheet.previous.receivables;
    const b1 = q.tanshin.balanceSheet.current.receivables;
    const flipped = ctx.form['作り方'] === '符号を逆に';
    return {
      places: [T('cashFlow.receivablesChange'), T('balanceSheet.previous.receivables'), T('balanceSheet.current.receivables')],
      explanation: `売掛金は ${n(b0)} 百万円から ${n(b1)} 百万円に${b1 > b0 ? '増えた' : '減った'}ので、キャッシュ・フロー計算書の「売上債権 (売掛金) の増減額」は ${sg(was)} (${was < 0 ? '資金が減る' : '資金が増える'}) と書くはずですが、${sg(cf.receivablesChange)} と書かれています。${flipped ? '符号が逆です。' : `${n(Math.abs(cf.receivablesChange - was))} 百万円 (約 2 割) 多く書かれています。`}`,
    };
  },
  'H-13': (q, ctx) => {
    const sales = ctx.form.slot === 'irSales';
    const was = sales ? q.ir.highlights.netSales.amount : q.ir.supplement.cash.current;
    const now = r1(was * 1.05);
    if (sales) q.ir.highlights.netSales.amount = now;
    else q.ir.supplement.cash.current = now;
    const t = q.tanshin;
    return sales
      ? {
          places: [I('highlights.netSales.amount'), T('incomeStatement.current.netSales')],
          explanation: `IR スライド (ハイライト) の売上高は ${fmt1(now)} 億円ですが、決算短信の損益計算書の売上高は ${n(t.incomeStatement.current.netSales)} 百万円 (${fmt1(was)} 億円) です。IR の数字が約 5% 大きくなっています。`,
        }
      : {
          places: [I('supplement.cash.current'), T('balanceSheet.current.cash')],
          explanation: `IR スライド (補足) の現金及び預金 (当期) は ${fmt1(now)} 億円ですが、決算短信の貸借対照表の現金及び預金は ${n(t.balanceSheet.current.cash)} 百万円 (${fmt1(was)} 億円) です。IR の数字が約 5% 大きくなっています。`,
        };
  },
  'H-17': (q, ctx) => {
    const was = q.ir.highlights.netSales.amount;
    const now = ctx.form['倍率'] === '×10' ? r1(was * 10) : r1(was / 10);
    q.ir.highlights.netSales.amount = now;
    return {
      places: [I('highlights.netSales.amount'), T('incomeStatement.current.netSales')],
      explanation: `IR スライド (ハイライト) の売上高は ${fmt1(now)} 億円ですが、決算短信の売上高 ${n(q.tanshin.incomeStatement.current.netSales)} 百万円は ${fmt1(was)} 億円です (1 億円 = 100 百万円)。換算で桁が 1 つずれています。`,
    };
  },
  'H-19': (q, ctx) => {
    const items = q.ir.segments.items;
    const missing = Number(ctx.form['欠け']) - 1; // 欠けるセグメントの添字 (3 = 最後・2 = 真ん中)
    const dropped = items.splice(missing, 1)[0];
    for (const k of ['previous', 'current']) {
      const sum10 = items.reduce((a, it) => a + Math.round(it.profit[k] * 10), 0);
      q.ir.segments.adjustment[k] = (Math.round(q.ir.segments.consolidatedOperatingIncome[k] * 10) - sum10) / 10;
    }
    const names = q.tanshin.notes.segments.current.segments.map((s) => s.name);
    return {
      places: [I('segments.items'), T(`notes.segments.current.segments.${missing}.name`)],
      explanation: `決算短信の注記のセグメントは ${names.length} つ (${names.join('・')}) ですが、IR スライドのセグメント別には ${items.length} つしか載っていません。${dropped.name}が欠けています。`,
    };
  },
  'H-20': (q) => {
    const s = q.ir.supplement;
    const was = s.netDebt.previous;
    // 20% ずらすは、丸めたあとに 20% を割らないよう 0.1 の単位で切り上げる (H-05 と同じ。四捨五入だと 159.2 → 191.0 で 19.97% になる)
    s.netDebt.previous = r1(was + Math.sign(was) * Math.ceil(Math.abs(was) * 0.2 * 10 - 1e-9) / 10);
    return {
      places: [I('supplement.netDebt.previous'), I('supplement.interestBearingDebt.previous'), I('supplement.cash.previous')],
      explanation: `IR スライド (補足) の純有利子負債 (前期) は ${fmt1(s.netDebt.previous)} 億円ですが、有利子負債 (前期) ${fmt1(s.interestBearingDebt.previous)} 億円 − 現金及び預金 (前期) ${fmt1(s.cash.previous)} 億円 = ${fmt1(was)} 億円のはずです (約 2 割のずれ)。`,
    };
  },
  'H-21': (q) => {
    const idx = q.ir.statements.findIndex((s) => s.claims.some((c) => c.metric === 'operatingCashFlow'));
    const st = q.ir.statements[idx];
    const claim = st.claims.find((c) => c.metric === 'operatingCashFlow');
    const was = claim.direction;
    claim.direction = was === 'up' ? 'down' : 'up';
    st.text = was === 'up' ? st.text.replace('プラス', 'マイナス') : st.text.replace('マイナス', 'プラス');
    const ocf = q.tanshin.cashFlow.operatingCashFlow;
    return {
      places: [I(`statements.${idx}`), T('cashFlow.operatingCashFlow')],
      explanation: `IR スライド (補足) は営業活動によるキャッシュ・フローが「${claim.direction === 'up' ? 'プラス' : 'マイナス'}」と言っていますが、決算短信のキャッシュ・フロー計算書の営業活動によるキャッシュ・フローは ${sg(ocf)} 百万円で、${ocf > 0 ? 'プラス' : 'マイナス'}です。文と数字の向きが逆です。`,
    };
  },
  'H-22': (q, ctx) => {
    const w = AUDIT_WORDING[Number(ctx.form['文言']) - 1];
    q.tanshin.summary.auditNote = w;
    return {
      places: [T('summary.auditNote')],
      explanation: `決算短信 (サマリー) の注意書きが「${w}」となっています。決算短信は公認会計士又は監査法人の監査の対象外で、様式には「決算短信は公認会計士又は監査法人の監査の対象外です」と書く決まりです。`,
    };
  },
  'H-23': (q, ctx) => {
    const t = q.tanshin;
    const flag0 = t.summary.accountingPolicyChange;
    if (ctx.form['反転'] === 'flag') t.summary.accountingPolicyChange = !flag0;
    else t.notes.accountingPolicyNote = t.notes.accountingPolicyNote === '該当事項はありません。' ? POLICY_TEXT : '該当事項はありません。';
    const flagNow = t.summary.accountingPolicyChange;
    const hasNote = t.notes.accountingPolicyNote !== '該当事項はありません。';
    return {
      places: [T('summary.accountingPolicyChange'), T('notes.accountingPolicyNote')],
      explanation: `決算短信のサマリーは会計方針の変更を「${flagNow ? '有' : '無'}」としていますが、注記には、${hasNote ? '当期から会計基準の適用指針の改正を適用したと書かれています' : '該当事項はありません (会計方針の変更の説明がありません) と書かれています'}。サマリーの有無と注記が食い違っています。`,
    };
  },
  'H-24': (q) => {
    const ni = q.tanshin.incomeStatement.current.netIncomeParent;
    const gain = Math.max(10, Math.round((ni * 0.58) / 10) * 10);
    const pct = Math.round((gain / ni) * 100);
    q.ir.outlook.subsequentEvent = `期末後に子会社を売却。売却益は約 ${n(gain)} 百万円の見込み。`; // 文欄は 40 字以内
    return {
      places: [T('notes.subsequentEvents'), I('outlook.subsequentEvent')],
      explanation: `決算短信の重要な後発事象は「該当事項はありません。」ですが、IR スライド (見通し) には、期末後に子会社の売却を決定し、売却益が約 ${n(gain)} 百万円 (当期純利益の約 ${pct}%) と書かれています。重要な後発事象は注記に書くものです。`,
    };
  },
  'H-28': (q, ctx) => {
    const word = ctx.form['科目名'];
    q.labelOverrides = { 'tanshin.balanceSheet.receivables': word };
    return {
      places: [{ doc: 'tanshin', itemKey: 'tanshin.balanceSheet.receivables' }],
      explanation: `貸借対照表の資産の部に「${word}」があります。${word}は負債の科目で、負債の部に置くものです。資産の部のこの行は、売掛金のはずです。`,
    };
  },
  'H-29': (q, ctx) => {
    const { slot } = ctx.form;
    const right = IR_SLOTS.includes(slot) ? '億円' : '百万円';
    const wrong = IR_SLOTS.includes(slot) ? '百万円' : '億円';
    q.cardEdits = [{ card: 0, slot, op: 'unit', unit: wrong }];
    const info = slotInfo(q, ctx.company, slot);
    return {
      places: [C(slot)],
      explanation: `「${info.label}」(${info.doc}) の単位が「${wrong}」になっています。${info.doc}の金額の単位は「${right}」で、同じ資料のほかの金額は「${right}」です。`,
    };
  },
  'H-30': (q, ctx) => {
    const { slot } = ctx.form;
    const key = TYPO_ITEM[slot];
    const standard = LABELS[key];
    q.labelOverrides = { [key]: standard.slice(0, -1) };
    return {
      places: [{ doc: 'tanshin', itemKey: key }],
      explanation: `科目名が「${standard.slice(0, -1)}」と書かれています。正しくは「${standard}」で、最後の 1 字が抜けています (誤字)。`,
    };
  },
  'H-31': (q, ctx) => {
    const { slot } = ctx.form;
    q.cardEdits = [{ card: 0, slot, op: 'drop' }];
    const info = slotInfo(q, ctx.company, slot);
    return {
      places: [C(slot)],
      explanation: `「${info.label}」(${info.doc}) の欄がありません。この資料には毎回この欄があります。ここに欄があるはずです。`,
    };
  },
  'H-32': (q, ctx) => {
    const { slot, style } = ctx.form;
    q.cardEdits = [{ card: 0, slot, op: 'format', style }];
    const right = slotInfo(q, ctx.company, slot);
    const shown = deriveCards(q, ctx.company, 'hard').slots.find((s) => s.key === slot).text;
    return {
      places: [C(slot)],
      explanation: `「${right.label}」の数字が ${shown} と書かれています。桁区切り (カンマ) の位置が違います。正しくは ${right.text} です。`,
    };
  },
  'H-33': (q, ctx) => {
    const { slot } = ctx.form;
    q.cardEdits = [{ card: 0, slot, op: 'dup' }];
    const info = slotInfo(q, ctx.company, slot);
    return {
      places: [C(slot)],
      explanation: `「${info.label}」の欄が 2 回表示されています。同じ欄は 1 回だけ載ります。`,
    };
  },
  'H-34': (q, ctx) => {
    const { slot } = ctx.form;
    q.cardEdits = [{ card: 0, slot, op: 'sign' }];
    const info = slotInfo(q, ctx.company, slot);
    const shown = deriveCards(q, ctx.company, 'hard').slots.find((s) => s.key === slot).text;
    return {
      places: [C(slot)],
      explanation: `「${info.label}」の数字に負の記号 △ が付いて ${shown} と書かれています。値は ${info.text} で、この科目の数字が負になることはありません。`,
    };
  },
  'H-35': (q, ctx) => {
    const other = ctx.companies.find((c) => c.id === ctx.form['社名']);
    q.ir.header.companyName = other.name;
    return {
      places: [I('header.companyName')],
      explanation: `IR スライドの表題の社名は「${other.name}」ですが、決算短信の社名は「${ctx.company.name}」です。同じ会社の資料なのに、社名が違います。`,
    };
  },
};

/** 異変を入れる: 基の複製を変え、場所・期待集合・文言・基 (base)・基との差 (changed) を付ける。 */
export function inject(base, company, companies, row, i) {
  const q = clone(base);
  const recipe = RECIPES[row.kind];
  if (!recipe) throw new Error(`未実装の種類: ${row.kind}`);
  const { places, explanation } = recipe(q, { base, company, companies, row, form: parseForm(row.form), i });
  const result = verifyProblem(q, company);
  const expectedRules = [...new Set(result.hard.map((v) => v.rule))].sort();
  // キーの並び: id・difficulty・会社・期・段・短信・IR のあとに、見た目の差し替え・形のずれ・異変 (正常の土台と同じ順)
  const problem = {
    id: row.id,
    difficulty: q.difficulty,
    companyId: q.companyId,
    fiscalYear: q.fiscalYear,
    tier: row.tier,
    tanshin: q.tanshin,
    ir: q.ir,
    ...(q.labelOverrides ? { labelOverrides: q.labelOverrides } : {}),
    ...(q.cardEdits ? { cardEdits: q.cardEdits } : {}),
    anomaly: { kind: row.kind, places, explanation, expectedRules, base: base.id, changed: [] },
  };
  problem.anomaly.changed = changedCells(base, problem);
  return problem;
}
