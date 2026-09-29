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
const page =
  `<!doctype html><meta charset=utf-8><title>Lab PDF review</title><style>body{font:14px system-ui;margin:24px}table{border-collapse:collapse;width:100%;table-layout:fixed;margin:8px 0 18px}td,th{border:1px solid #bbb;padding:4px}input,select{width:100%;box-sizing:border-box}th:nth-child(2),td:nth-child(2){width:3rem}th:nth-child(3),td:nth-child(3){width:30%;min-width:18rem}th:nth-child(4),td:nth-child(4){width:5rem}th:nth-child(7),td:nth-child(7){width:6rem}button{margin:5px;padding:7px}</style><h1>Lab PDF review</h1><p>Edit rows, choose their decision, or add rows. Saving writes only <code>reviewed-records.json</code>.</p><main></main><button onclick="save('draft')">Save draft</button><button onclick="save('validated')">Mark validated</button><script>let d,cols=['status','page','sourceLabel','valueText','unit','referenceText','referenceKind','methodText'];let esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('"','&quot;');async function init(){d=await (await fetch('/api/ledger')).json();render()}function field(v,c){return c==='status'?'<select>'+['pending','approved','edited','rejected','added'].map(x=>'<option '+(x==v?'selected':'')+'>'+x+'</option>').join('')+'</select>':'<input value="'+esc(v)+'">'}function render(){document.querySelector('main').innerHTML=d.documents.map((x,i)=>'<h2>'+x.file+'</h2><table><tr>'+cols.map(c=>'<th>'+c+'</th>').join('')+'</tr>'+x.records.map((r,j)=>'<tr data-d='+i+' data-r='+j+'>'+cols.map(c=>'<td>'+field(r[c],c)+'</td>').join('')+'</tr>').join('')+'</table><button onclick="add('+i+')">Add row</button>').join('')}function add(i){d.documents[i].records.push({status:'added',page:1,sourceLabel:'',valueText:'',unit:'',referenceText:null,referenceKind:'missing',methodText:null});render()}async function save(status){document.querySelectorAll('tr[data-d]').forEach(t=>{let r=d.documents[t.dataset.d].records[t.dataset.r];[...t.querySelectorAll('input,select')].forEach((e,i)=>r[cols[i]]=e.value||null);r.page=Number(r.page)});d.status=status;await fetch('/api/ledger',{method:'PUT',body:JSON.stringify(d)});alert('Saved '+status)}init()</script>`;
Deno.serve(async (request) => {
  const url = new URL(request.url);
  if (url.pathname === "/api/ledger" && request.method === "GET") {
    return Response.json(await load());
  }
  if (url.pathname === "/api/ledger" && request.method === "PUT") {
    await Deno.writeTextFile(ledgerPath, await request.text());
    return new Response(null, { status: 204 });
  }
  const singleDocumentView =
    `<script>let currentDocument=0;function previous(){if(currentDocument>0){currentDocument--;render()}}function next(){if(currentDocument<d.documents.length-1){currentDocument++;render()}}render=()=>{let x=d.documents[currentDocument];document.querySelector('main').innerHTML='<p><button onclick="previous()" '+(currentDocument?'':'disabled')+'>Previous</button> PDF '+(currentDocument+1)+' of '+d.documents.length+' <button onclick="next()" '+(currentDocument<d.documents.length-1?'':'disabled')+'>Next</button></p><h2>'+x.file+'</h2><table><tr>'+cols.map(c=>'<th>'+c+'</th>').join('')+'</tr>'+x.records.map((r,j)=>'<tr data-d='+currentDocument+' data-r='+j+'>'+cols.map(c=>'<td>'+field(r[c],c)+'</td>').join('')+'</tr>').join('')+'</table><button onclick="add('+currentDocument+')">Add row</button>'}</script>`;
  return new Response(page + singleDocumentView, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
});
