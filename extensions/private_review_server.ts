import { parseMeasurementBlock } from "./reports/lab_pdf_candidate_review.ts";
import { testables } from "./models/lab_pdf_extractor.ts";

type Status = "pending" | "approved" | "edited" | "rejected" | "added";
type Row = {
  status: Status;
  page: number;
  sourceLabel: string;
  valueText: string;
  unit: string;
  referenceText: string | null;
  referenceKind: string;
  methodText: string | null;
};
type Ledger = {
  schemaVersion: 1;
  status: "draft" | "validated";
  documents: Array<
    { file: string; sourceSha256: string; pageCount: number; records: Row[] }
  >;
};
const root = Deno.env.get("LAB_PDF_PRIVATE_FIXTURES_DIR");
if (!root) {
  throw new Error(
    "Set LAB_PDF_PRIVATE_FIXTURES_DIR to the ignored .private directory.",
  );
}
const ledgerPath = `${root}/reviewed-records.json`;

async function draft(): Promise<Ledger> {
  const documents: Ledger["documents"] = [];
  for await (const entry of Deno.readDir(`${root}/fixtures`)) {
    if (!entry.isFile || !entry.name.endsWith(".pdf")) continue;
    const document = await testables.extractDocument(
      `${root}/fixtures/${entry.name}`,
    );
    const records: Row[] = [];
    for (const page of document.pages) {
      for (let index = 0; index < page.lines.length; index++) {
        const block = parseMeasurementBlock(
          document.sourceFileName,
          page.number,
          page.lines,
          index,
        );
        if (!block) {
          continue;
        }
        const candidate = block.candidate;
        records.push({
          status: "pending",
          page: candidate.page,
          sourceLabel: candidate.sourceLabel,
          valueText: candidate.valueText,
          unit: candidate.unit,
          referenceText: candidate.referenceText,
          referenceKind: candidate.referenceKind,
          methodText: candidate.methodText,
        });
        index = block.endIndex;
      }
    }
    documents.push({
      file: `fixtures/${entry.name}`,
      sourceSha256: document.sourceSha256,
      pageCount: document.pageCount,
      records,
    });
  }
  return { schemaVersion: 1, status: "draft", documents };
}
async function load(): Promise<Ledger> {
  try {
    const existing = JSON.parse(await Deno.readTextFile(ledgerPath)) as Ledger;
    return existing.documents.length ? existing : await draft();
  } catch {
    return await draft();
  }
}
function sameRecord(left: Row, right: Row): boolean {
  return left.page === right.page && left.sourceLabel === right.sourceLabel &&
    left.valueText === right.valueText && left.unit === right.unit &&
    left.referenceText === right.referenceText &&
    left.referenceKind === right.referenceKind &&
    left.methodText === right.methodText;
}

async function latestWithApprovals(): Promise<Ledger> {
  const latest = await draft();
  const saved = await load();
  for (const document of latest.documents) {
    const previous = saved.documents.find((item) =>
      item.file === document.file
    );
    if (!previous) continue;
    for (const record of document.records) {
      const matchingRecord = previous.records.find((item) =>
        sameRecord(item, record)
      );
      if (matchingRecord) record.status = matchingRecord.status;
    }
  }
  return latest;
}
const page = `<!doctype html>
<meta charset="utf-8">
<title>Lab PDF review</title>
<style>
  :root{color-scheme:dark;--bg:#060b10;--surface:#0a1318;--surface-active:#102127;--line:#28444c;--line-strong:#4a7378;--text:#bfd4cf;--muted:#749195;--cyan:#8ec9c8;--yellow:#d5d67d;--green:#9fca84;--red:#d88d81}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.01em}
  .shell{max-width:1800px;margin:0 auto;padding:48px}
  header{border-bottom:1px solid var(--line-strong);padding-bottom:28px;margin-bottom:32px}
  h1,h2{font:inherit;letter-spacing:.08em;text-transform:uppercase;color:var(--cyan);margin:0}
  h1{font-size:18px} h2{font-size:12px}
  .eyebrow{color:var(--yellow);font-size:11px;letter-spacing:.16em;text-transform:uppercase;margin:0 0 10px}
  .description{max-width:72ch;color:var(--muted);margin:16px 0 0}
  button,input,select,textarea{font:inherit;border-radius:0}
  button{appearance:none;border:1px solid var(--line-strong);background:transparent;color:var(--cyan);cursor:pointer;padding:8px 10px;letter-spacing:.03em}
  button:hover,button:focus-visible{background:var(--surface-active);outline:none;border-color:var(--cyan)}
  button:focus-visible,input:focus,select:focus,textarea:focus{outline:1px solid var(--yellow);outline-offset:2px}
  input,select,textarea{width:100%;background:transparent;border:0;color:var(--text);padding:5px 2px}
  select{color:var(--yellow)} textarea{min-height:5.5rem;resize:vertical;line-height:1.35}
  table{border-collapse:collapse;width:100%;table-layout:fixed;margin:16px 0 20px;border-top:1px solid var(--line-strong);border-bottom:1px solid var(--line-strong)}
  td,th{border-bottom:1px solid var(--line);padding:8px;vertical-align:top;text-align:left;overflow-wrap:anywhere}
  th{color:var(--muted);font-weight:400;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
  tr:last-child td{border-bottom:0} tr[data-state="approved"] select{color:var(--green)} tr[data-state="pending"] select{color:var(--yellow)} tr[data-state="rejected"] select{color:var(--red)}
  th:nth-child(2),td:nth-child(2){width:3.5rem} th:nth-child(3),td:nth-child(3){width:30%;min-width:18rem} th:nth-child(4),td:nth-child(4){width:5rem} th:nth-child(7),td:nth-child(7){width:7rem}
  .actions{display:flex;gap:10px;margin-top:32px;padding-top:20px;border-top:1px solid var(--line)}
  .review-layout{display:grid;grid-template-columns:minmax(18rem,25rem) minmax(0,1fr);gap:36px}
  .document-picker{align-self:start;max-height:calc(100vh - 8rem);overflow:auto;position:sticky;top:24px;border-top:1px solid var(--line-strong)}
  .document-picker h2{padding:12px 10px;border-bottom:1px solid var(--line)}
  .document-choice{display:block;margin:0;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line);padding:12px 10px}
  .document-choice.selected{background:var(--surface-active);box-shadow:inset 3px 0 var(--yellow)}
  .document-file{display:block;color:var(--text);overflow-wrap:anywhere}.document-choice.selected .document-file{color:var(--cyan)}
  .document-counts{display:block;color:var(--muted);font-size:11px;margin-top:5px;line-height:1.5}
  .document-choice.approved .document-file,.document-choice.approved .document-counts{color:var(--green)}
  .document-choice.warning .document-file,.document-choice.warning .document-counts{color:var(--yellow)}
  .document-choice.critical .document-file,.document-choice.critical .document-counts{color:var(--red)}
  .document-choice.approved.selected{box-shadow:inset 3px 0 var(--green)}.document-choice.warning.selected{box-shadow:inset 3px 0 var(--yellow)}.document-choice.critical.selected{box-shadow:inset 3px 0 var(--red)}
  .review-document>h2{padding:12px 0;border-bottom:1px solid var(--line-strong);overflow-wrap:anywhere}
  @media(max-width:950px){.shell{padding:28px 20px}.review-layout{display:block}.document-picker{max-height:none;position:static;margin-bottom:28px}.actions{flex-wrap:wrap}}
</style>
<div class="shell">
  <header><p class="eyebrow">Local instrument / review console</p><h1>Lab PDF review</h1><p class="description">Edit candidate rows, choose their decision, or add records. Saving writes only <code>reviewed-records.json</code>.</p></header>
  <main></main>
  <footer class="actions"><button onclick="save('draft')">Save draft</button><button onclick="save('validated')">Mark validated</button></footer>
</div>
<script>
  let d,cols=['status','page','sourceLabel','valueText','unit','referenceText','referenceKind','methodText'];
  let esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  let displayFile=file=>esc(String(file??'').replace(/^fixtures\\//u,''));
  async function init(){d=await (await fetch('/api/ledger')).json();render()}
  function field(v,c){return c==='status'?'<select>'+['pending','approved','edited','rejected','added'].map(x=>'<option '+(x==v?'selected':'')+'>'+x+'</option>').join('')+'</select>':c==='referenceText'?'<textarea>'+esc(v)+'</textarea>':'<input value="'+esc(v)+'">'}
  function captureVisibleRows(){document.querySelectorAll('tr[data-d]').forEach(t=>{let r=d.documents[t.dataset.d].records[t.dataset.r];[...t.querySelectorAll('input,select,textarea')].forEach((e,i)=>r[cols[i]]=e.value||null);r.page=Number(r.page)})}
  function render(){document.querySelector('main').innerHTML=d.documents.map((x,i)=>'<h2>'+displayFile(x.file)+'</h2><table><tr>'+cols.map(c=>'<th>'+c+'</th>').join('')+'</tr>'+x.records.map((r,j)=>'<tr data-d='+i+' data-r='+j+' data-state="'+r.status+'">'+cols.map(c=>'<td>'+field(r[c],c)+'</td>').join('')+'</tr>').join('')+'</table><button onclick="add('+i+')">Add row</button>').join('')}
  function add(i){captureVisibleRows();d.documents[i].records.push({status:'added',page:1,sourceLabel:'',valueText:'',unit:'',referenceText:null,referenceKind:'missing',methodText:null});render()}
  async function save(status){captureVisibleRows();d.status=status;await fetch('/api/ledger',{method:'PUT',body:JSON.stringify(d)});alert('Saved '+status)}
  init()
</script>`;
Deno.serve(async (request) => {
  const url = new URL(request.url);
  if (url.pathname === "/api/ledger" && request.method === "GET") {
    return Response.json(
      url.searchParams.has("fresh")
        ? await latestWithApprovals()
        : await load(),
    );
  }
  if (url.pathname === "/api/ledger" && request.method === "PUT") {
    const ledger = JSON.parse(await request.text());
    await Deno.writeTextFile(
      ledgerPath,
      `${JSON.stringify(ledger, null, 2)}\n`,
    );
    return new Response(null, { status: 204 });
  }
  const documentPickerView = `<script>
    let currentDocument=0;
    let states=['pending','approved','edited','rejected','added'];
    async function latest(){if(confirm('Replace this view with the latest extracted candidates? The saved ledger is unchanged until you save.')){d=await (await fetch('/api/ledger?fresh=1')).json();currentDocument=0;render()}}
    document.querySelector('button[onclick="save(\\'draft\\')"]').insertAdjacentHTML('beforebegin','<button onclick="latest()">Load latest extraction</button>');
    function choose(i){captureVisibleRows();currentDocument=i;render()}
    function counts(x){return states.map(s=>[s,x.records.filter(r=>r.status===s).length]).filter(([,count])=>count>0).map(([state,count])=>state+': '+count).join(' · ')||'no candidates'}
    function health(x){let count=s=>x.records.filter(r=>r.status===s).length;if(count('rejected'))return 'critical';if(!x.records.length||count('pending')||count('added')||count('edited'))return 'warning';return 'approved'}
    render=()=>{let x=d.documents[currentDocument];document.querySelector('main').innerHTML='<div class="review-layout"><aside class="document-picker"><h2>Documents</h2>'+d.documents.map((item,i)=>'<button class="document-choice '+health(item)+' '+(i===currentDocument?'selected':'')+'" onclick="choose('+i+')"><span class="document-file">'+displayFile(item.file)+'</span><span class="document-counts">'+counts(item)+'</span></button>').join('')+'</aside><section class="review-document"><h2>'+displayFile(x.file)+'</h2><table><tr>'+cols.map(c=>'<th>'+c+'</th>').join('')+'</tr>'+x.records.map((r,j)=>'<tr data-d='+currentDocument+' data-r='+j+' data-state="'+r.status+'">'+cols.map(c=>'<td>'+field(r[c],c)+'</td>').join('')+'</tr>').join('')+'</table><button onclick="add('+currentDocument+')">Add row</button></section></div>'}
  </script>`;
  return new Response(page + documentPickerView, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
});
