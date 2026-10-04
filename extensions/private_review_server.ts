import { extractMeasurementCandidates } from "./reports/lab_pdf_candidate_review.ts";
import { testables } from "./models/lab_pdf_extractor.ts";

type Status = "pending" | "approved" | "edited" | "rejected" | "added";
type Row = {
  status: Status;
  page: number;
  sourceLabel: string;
  sourceSection: string | null;
  valueText: string;
  unit: string | null;
  referenceText: string | null;
  referenceKind: string;
  methodText: string | null;
  matchesLedger?: boolean;
  assertionViolation?: "unexpected" | "missing";
};
type DocumentEntry = {
  file: string;
  sourceSha256: string;
  pageCount: number;
  sourceDate: string | null;
  sourceIssuer: string | null;
  records: Row[];
  parsingAssertion?: "complete";
  assertionChanges?: { unexpected: number; missing: number };
};
type Ledger = {
  schemaVersion: 1;
  documents: DocumentEntry[];
};
const root = Deno.env.get("LAB_PDF_PRIVATE_FIXTURES_DIR");
if (!root) {
  throw new Error(
    "Set LAB_PDF_PRIVATE_FIXTURES_DIR to the ignored .private directory.",
  );
}
const ledgerPath = `${root}/reviewed-records.json`;

function normalizeUnit(unit: string | null): string | null {
  return unit?.trim() === "" ? null : unit;
}

function normalizeLedger(ledger: Ledger): Ledger {
  for (const document of ledger.documents) {
    document.sourceDate = document.sourceDate || null;
    document.sourceIssuer = document.sourceIssuer?.trim() || null;
    for (const record of document.records) {
      record.unit = normalizeUnit(record.unit);
    }
  }
  return ledger;
}

async function draft(): Promise<Ledger> {
  const documents: Ledger["documents"] = [];
  for await (const entry of Deno.readDir(`${root}/fixtures`)) {
    if (!entry.isFile || !entry.name.endsWith(".pdf")) continue;
    const document = await testables.extractDocument(
      `${root}/fixtures/${entry.name}`,
    );
    const records: Row[] = extractMeasurementCandidates(document).map((
      candidate,
    ) => ({
      status: "pending",
      page: candidate.page,
      sourceLabel: candidate.sourceLabel,
      sourceSection: candidate.sourceSection,
      valueText: candidate.valueText,
      unit: normalizeUnit(candidate.unit),
      referenceText: candidate.referenceText,
      referenceKind: candidate.referenceKind,
      methodText: candidate.methodText,
    }));
    documents.push({
      file: `fixtures/${entry.name}`,
      sourceSha256: document.sourceSha256,
      pageCount: document.pageCount,
      sourceDate: null,
      sourceIssuer: null,
      records,
    });
  }
  return { schemaVersion: 1, documents };
}
async function load(): Promise<Ledger> {
  try {
    const existing = JSON.parse(await Deno.readTextFile(ledgerPath)) as Ledger;
    return existing.documents.length
      ? normalizeLedger(existing)
      : await draft();
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return await draft();
    throw error;
  }
}
function sameRecord(left: Row, right: Row): boolean {
  return left.page === right.page && left.sourceLabel === right.sourceLabel &&
    (left.sourceSection ?? null) === (right.sourceSection ?? null) &&
    left.valueText === right.valueText &&
    (left.unit || null) === (right.unit || null) &&
    left.referenceText === right.referenceText &&
    left.referenceKind === right.referenceKind &&
    left.methodText === right.methodText;
}

function isConfirmedRecord(record: Row): boolean {
  return record.status === "approved" || record.status === "edited" ||
    record.status === "added";
}

/** An asserted document never silently loses a manually confirmed record. */
function retainAssertedRecords(next: Ledger, saved: Ledger): Ledger {
  for (const savedDocument of saved.documents) {
    if (savedDocument.parsingAssertion !== "complete") continue;
    const nextDocument = next.documents.find((document) =>
      document.file === savedDocument.file
    );
    if (!nextDocument) continue;
    if (
      nextDocument.sourceDate !== savedDocument.sourceDate ||
      nextDocument.sourceIssuer !== savedDocument.sourceIssuer
    ) {
      delete nextDocument.parsingAssertion;
      continue;
    }
    nextDocument.parsingAssertion = "complete";
    for (const expected of savedDocument.records) {
      if (
        isConfirmedRecord(expected) &&
        !nextDocument.records.some((record) => sameRecord(record, expected))
      ) {
        nextDocument.records.push({ ...expected });
      }
    }
  }
  return next;
}

/** Re-extract local PDFs and apply decisions only to matching candidates. */
async function freshLedger(): Promise<Ledger> {
  const latest = await draft();
  const saved = await load();
  for (const document of latest.documents) {
    const previous = saved.documents.find((item) =>
      item.file === document.file
    );
    if (!previous) {
      for (const record of document.records) record.matchesLedger = false;
      continue;
    }
    for (const record of document.records) {
      const matchingRecord = previous.records.find((item) =>
        sameRecord(item, record)
      );
      record.matchesLedger = matchingRecord !== undefined;
      if (matchingRecord) record.status = matchingRecord.status;
    }
    document.sourceIssuer = previous.sourceIssuer;
    document.sourceDate = previous.sourceDate;
    if (previous.parsingAssertion !== "complete") continue;
    if (!previous.sourceDate) continue;
    if (!previous.sourceIssuer) continue;

    document.parsingAssertion = "complete";
    const unexpected = document.records.filter((record) =>
      record.matchesLedger !== true
    );
    for (const record of unexpected) record.assertionViolation = "unexpected";

    const missing = previous.records.filter((expected) =>
      isConfirmedRecord(expected) &&
      !document.records.some((actual) => sameRecord(actual, expected))
    );
    for (const record of missing) {
      document.records.push({
        ...record,
        matchesLedger: false,
        assertionViolation: "missing",
      });
    }
    document.assertionChanges = {
      unexpected: unexpected.length,
      missing: missing.length,
    };
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
  .shell{max-width:1800px;margin:0 auto;padding:32px 48px}
  header{position:sticky;top:0;z-index:10;background:var(--bg);border-bottom:1px solid var(--line-strong);padding:16px 0;margin:-16px 0 22px}
  .header-content{display:flex;align-items:start;gap:24px;justify-content:space-between}
  h1,h2{font:inherit;letter-spacing:.08em;text-transform:uppercase;color:var(--cyan);margin:0}
  h1{font-size:18px} h2{font-size:12px}
  .description{max-width:72ch;color:var(--muted);margin:8px 0 0}
  button,input,select,textarea{font:inherit;border-radius:0}
  button{appearance:none;border:1px solid var(--line-strong);background:transparent;color:var(--cyan);cursor:pointer;padding:8px 10px;letter-spacing:.03em}
  button:hover,button:focus-visible{background:var(--surface-active);outline:none;border-color:var(--cyan)}
  button:focus-visible,input:focus,textarea:focus{outline:1px solid var(--yellow);outline-offset:2px}
  input,select,textarea{width:100%;background:transparent;border:0;color:var(--text);padding:3px 0}
  .status-control{width:7.5rem;border-bottom:1px solid var(--line-strong);color:var(--yellow);outline:0}
  .status-control:focus{border-color:var(--cyan);outline:0}
  .status-control option{background:var(--surface);color:var(--text)}.status-control option:nth-child(1){color:var(--yellow)}.status-control option:nth-child(2){color:var(--green)}.status-control option:nth-child(3),.status-control option:nth-child(5){color:var(--yellow)}.status-control option:nth-child(4){color:var(--red)}
  tr[data-ledger-change="true"] td:first-child{box-shadow:inset 3px 0 var(--yellow)}
  textarea{resize:vertical;line-height:1.35}.table-reference{min-height:4.6rem}
  table{border-collapse:collapse;width:100%;table-layout:fixed;margin:10px 0 14px}
  td,th{border-bottom:1px solid var(--line);padding:6px 8px;vertical-align:top;text-align:left;overflow-wrap:anywhere}
  th{color:var(--muted);font-weight:400;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
  tr:last-child td{border-bottom:0} tr[data-state="approved"] select{color:var(--green)} tr[data-state="pending"] select{color:var(--yellow)} tr[data-state="rejected"] select{color:var(--red)}
  tr[data-assertion-violation] td:first-child{box-shadow:inset 3px 0 var(--red)} tr[data-assertion-violation="missing"] td{color:var(--red)}
  th:nth-child(1),td:nth-child(1){width:8rem} th:nth-child(2),td:nth-child(2){width:3.5rem} th:nth-child(3),td:nth-child(3){width:28%;min-width:17rem} th:nth-child(4),td:nth-child(4){width:21%;min-width:14rem} th:nth-child(5),td:nth-child(5){width:5rem} th:nth-child(6),td:nth-child(6){width:5rem} th:nth-child(8),td:nth-child(8){width:7rem}
  .actions{display:flex;gap:10px}
  .save-notice{color:var(--green);font-size:11px;letter-spacing:.06em;opacity:0;text-transform:uppercase;transition:opacity .2s ease;white-space:nowrap}
  .save-notice.visible{opacity:1}
  .document-picker{position:relative;margin-top:14px;width:min(70vw,64rem)}
  .document-trigger{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;width:100%;padding:8px 10px;text-align:left}
  .document-trigger-label{color:var(--muted);font-size:11px;letter-spacing:.08em;text-transform:uppercase}.document-trigger-file{color:var(--cyan);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.document-trigger-counts{color:var(--muted);font-size:11px;white-space:nowrap}
  .document-trigger[data-health="approved"]{border-color:var(--green)}.document-trigger[data-health="approved"] .document-trigger-file{color:var(--green)}.document-trigger[data-health="warning"]{border-color:var(--yellow)}.document-trigger[data-health="warning"] .document-trigger-file{color:var(--yellow)}.document-trigger[data-health="critical"]{border-color:var(--red)}.document-trigger[data-health="critical"] .document-trigger-file{color:var(--red)}
  .document-menu{position:absolute;z-index:20;top:calc(100% + 6px);left:0;width:100%;max-height:min(65vh,48rem);overflow:auto;border:1px solid var(--line-strong);background:var(--bg);padding:4px}
  .document-choice{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;width:100%;border:0;border-left:3px solid transparent;padding:9px 10px;text-align:left}
  .document-choice:hover,.document-choice:focus-visible{background:var(--surface-active);outline:0}.document-file{color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.document-counts{color:var(--muted);font-size:11px;white-space:nowrap}
  .document-choice.approved{border-left-color:var(--green)}.document-choice.approved .document-file{color:var(--green)}.document-choice.warning{border-left-color:var(--yellow)}.document-choice.warning .document-file{color:var(--yellow)}.document-choice.critical{border-left-color:var(--red)}.document-choice.critical .document-file{color:var(--red)}.document-choice.selected{background:var(--surface-active)}
  .current-file{display:grid;gap:3px;margin-top:9px;color:var(--muted);font-size:11px;letter-spacing:.08em;text-transform:uppercase}
  .current-file input{color:var(--cyan);cursor:text;letter-spacing:0;text-transform:none}
  .provenance-fields{display:grid;grid-template-columns:minmax(12rem,1fr) minmax(18rem,2fr);gap:18px;margin:0 0 14px}.provenance-fields label{display:grid;gap:3px;color:var(--muted);font-size:11px;letter-spacing:.08em;text-transform:uppercase}.provenance-fields input{border-bottom:1px solid var(--line-strong);color:var(--cyan);letter-spacing:0;text-transform:none}
  .assertion-note{margin:0 0 16px;color:var(--muted);font-size:12px;letter-spacing:.03em}.assertion-note.complete{color:var(--green)}.assertion-note.failed{color:var(--red)}
  .loading{color:var(--yellow);letter-spacing:.05em;text-transform:uppercase}
  @media(max-width:950px){.shell{padding:28px 20px}header{margin:-16px 0 22px}.header-content{gap:14px}.document-picker{width:64vw}.actions{flex-wrap:wrap}.document-trigger,.document-choice{grid-template-columns:minmax(0,1fr)}.provenance-fields{grid-template-columns:1fr}}
</style>
<div class="shell">
  <header><div class="header-content"><div><h1>Lab PDF review</h1><p class="description">Edit candidate rows, choose their decision, or add records.<br>Saving writes only <code>reviewed-records.json</code>.</p><div class="document-picker"><button id="document-trigger" class="document-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" onclick="toggleDocumentMenu()"></button><div id="document-menu" class="document-menu" role="listbox" hidden></div></div><label class="current-file"><span>Selected filename — click to select</span><input id="current-file" readonly onclick="this.select()"></label></div><div class="actions"><span id="save-notice" class="save-notice" role="status" aria-live="polite"></span><button id="assert-complete" type="button" onclick="assertComplete()">Assert parsing complete</button><button onclick="save()">Save</button></div></div></header>
  <main aria-busy="true"><p class="loading">Extracting PDFs…</p></main>
</div>
<script>
  let d,baseline,columns=[['status','Review'],['page','Page'],['sourceSection','Section'],['sourceLabel','Analyte'],['valueText','Value'],['unit','Unit'],['referenceText','Reference'],['referenceKind','Reference type'],['methodText','Method']],cols=columns.map(([key])=>key);
  let esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  let displayFile=file=>esc(String(file??'').replace(/^fixtures\\//u,''));
  let setCurrentFile=file=>document.querySelector('#current-file').value=String(file??'').replace(/^fixtures\\//u,'');
  async function init(){d=await (await fetch('/api/ledger')).json();baseline=structuredClone(d);document.querySelector('main').setAttribute('aria-busy','false');render()}
  function field(v,c,r){if(c==='status')return '<select class="status-control">'+['pending','approved','edited','rejected','added'].map(x=>'<option '+(x==v?'selected':'')+'>'+x+'</option>').join('')+'</select>';if(c==='referenceText'&&(r.referenceKind==='table'||String(v??'').includes('\\n'))){let rows=Math.min(8,Math.max(3,String(v??'').split('\\n').length));return '<textarea class="table-reference" rows="'+rows+'">'+esc(v)+'</textarea>'}return '<input value="'+esc(v)+'">'}
  function captureVisibleRows(){document.querySelectorAll('tr[data-d]').forEach(t=>{let r=d.documents[t.dataset.d].records[t.dataset.r];[...t.querySelectorAll('input,select,textarea')].forEach((e,i)=>r[cols[i]]=e.value||null);r.page=Number(r.page)})}
  function sameVisibleRecord(left,right){return cols.every(c=>c==='unit'?(left[c]||null)===(right[c]||null):(left[c]??null)===(right[c]??null))}
  function markUnsaved(t){let row=t.closest('tr[data-d]');if(!row)return;captureVisibleRows();let r=d.documents[row.dataset.d].records[row.dataset.r],original=baseline.documents[row.dataset.d]?.records[row.dataset.r];r.matchesLedger=original?.matchesLedger===true&&sameVisibleRecord(r,original);row.dataset.ledgerChange=String(r.matchesLedger===false)}
  function render(){document.querySelector('main').innerHTML=d.documents.map((x,i)=>'<h2>'+displayFile(x.file)+'</h2><table><tr>'+columns.map(([,label])=>'<th>'+label+'</th>').join('')+'</tr>'+x.records.map((r,j)=>'<tr data-d='+i+' data-r='+j+' data-state="'+r.status+'" data-ledger-change="'+(r.matchesLedger===false)+'">'+cols.map(c=>'<td>'+field(r[c],c,r)+'</td>').join('')+'</tr>').join('')+'</table><button onclick="add('+i+')">Add row</button>').join('')}
  function add(i){captureVisibleRows();let document=d.documents[i],record={status:'added',page:1,sourceLabel:'',sourceSection:null,valueText:'',unit:'',referenceText:null,referenceKind:'missing',methodText:null,matchesLedger:false};if(document.parsingAssertion==='complete'){record.assertionViolation='unexpected';document.assertionChanges={unexpected:(document.assertionChanges?.unexpected||0)+1,missing:document.assertionChanges?.missing||0}}document.records.push(record);render()}
  let saveNoticeTimer;
  function showSaved(message='Saved'){let notice=document.querySelector('#save-notice');notice.textContent=message;notice.classList.add('visible');clearTimeout(saveNoticeTimer);saveNoticeTimer=setTimeout(()=>notice.classList.remove('visible'),2200)}
  async function save(message='Saved'){captureVisibleRows();captureProvenance();await fetch('/api/ledger',{method:'PUT',body:JSON.stringify(d)});d.documents.forEach(x=>x.records.forEach(r=>r.matchesLedger=true));baseline=structuredClone(d);render();showSaved(message)}
  init()
</script>`;
Deno.serve(async (request) => {
  const url = new URL(request.url);
  if (url.pathname === "/api/ledger" && request.method === "GET") {
    return Response.json(await freshLedger());
  }
  if (url.pathname === "/api/ledger" && request.method === "PUT") {
    const ledger = retainAssertedRecords(
      normalizeLedger(JSON.parse(await request.text()) as Ledger),
      await load(),
    );
    for (const document of ledger.documents) {
      delete document.assertionChanges;
      for (const record of document.records) delete record.matchesLedger;
      for (const record of document.records) delete record.assertionViolation;
    }
    await Deno.writeTextFile(
      ledgerPath,
      `${JSON.stringify(ledger, null, 2)}\n`,
    );
    return new Response(null, { status: 204 });
  }
  const documentPickerView = `<script>
    let currentDocument=0,documentMenuOpen=false;
    let states=['pending','approved','edited','rejected','added'];
    function choose(i){captureVisibleRows();captureProvenance();currentDocument=i;documentMenuOpen=false;render()}
    function toggleDocumentMenu(){documentMenuOpen=!documentMenuOpen;renderDocumentPicker()}
    function assertionTotal(x){return (x.assertionChanges?.unexpected||0)+(x.assertionChanges?.missing||0)}
    function assertionText(x){let changes=x.assertionChanges;if(assertionTotal(x))return 'assertion failed: '+(changes.unexpected?'+'+changes.unexpected+' unexpected':'')+(changes.unexpected&&changes.missing?' · ':'')+(changes.missing?'-'+changes.missing+' missing':'');return x.parsingAssertion==='complete'?'parsing complete':''}
    function counts(x){let recordCounts=states.map(s=>[s,x.records.filter(r=>r.status===s).length]).filter(([,count])=>count>0).map(([state,count])=>state+': '+count).join(' · ')||'no candidates',assertion=assertionText(x);return assertion?recordCounts+' · '+assertion:recordCounts}
    function health(x){let count=s=>x.records.filter(r=>r.status===s).length;if(assertionTotal(x)||count('rejected'))return 'critical';if(x.parsingAssertion==='complete'&&x.sourceDate&&x.sourceIssuer&&x.records.every(r=>r.status==='approved'))return 'approved';return 'warning'}
    function captureProvenance(){let dateInput=document.querySelector('#source-date'),issuerInput=document.querySelector('#source-issuer');if(!dateInput||!issuerInput)return;let x=d.documents[currentDocument],date=dateInput.value||null,issuer=issuerInput.value.trim()||null;if(x.sourceDate===date&&x.sourceIssuer===issuer)return;x.sourceDate=date;x.sourceIssuer=issuer;if(x.parsingAssertion==='complete'){delete x.parsingAssertion;delete x.assertionChanges}}
    function renderAssertionAction(x){let button=document.querySelector('#assert-complete'),hasDate=!!x.sourceDate,hasIssuer=!!String(x.sourceIssuer??'').trim(),hasPending=x.records.some(r=>r.status==='pending'),hasViolations=assertionTotal(x)>0;button.disabled=x.parsingAssertion==='complete'||!hasDate||!hasIssuer||hasPending||hasViolations;button.textContent=x.parsingAssertion==='complete'?'Parsing complete':'Assert parsing complete';button.title=!hasDate?'Set the report date before asserting parsing complete':!hasIssuer?'Set the report issuer before asserting parsing complete':hasPending?'Resolve all pending rows before asserting parsing complete':hasViolations?'Resolve assertion changes before asserting parsing complete':'Lock the currently reviewed parsing result as complete'}
    function renderDocumentPicker(){let x=d.documents[currentDocument],trigger=document.querySelector('#document-trigger'),menu=document.querySelector('#document-menu');setCurrentFile(x.file);renderAssertionAction(x);trigger.dataset.health=health(x);trigger.setAttribute('aria-expanded',String(documentMenuOpen));trigger.innerHTML='<span><span class="document-trigger-label">Document</span><br><span class="document-trigger-file" title="'+displayFile(x.file)+'">'+displayFile(x.file)+'</span></span><span class="document-trigger-counts">'+esc(counts(x))+'</span>';menu.hidden=!documentMenuOpen;menu.innerHTML=d.documents.map((item,i)=>'<button role="option" aria-selected="'+(i===currentDocument)+'" class="document-choice '+health(item)+' '+(i===currentDocument?'selected':'')+'" onclick="choose('+i+')"><span class="document-file" title="'+displayFile(item.file)+'">'+displayFile(item.file)+'</span><span class="document-counts">'+esc(counts(item))+'</span></button>').join('')}
    function assertComplete(){captureVisibleRows();captureProvenance();let x=d.documents[currentDocument];if(!x.sourceDate||!x.sourceIssuer||x.records.some(r=>r.status==='pending')||assertionTotal(x))return;x.parsingAssertion='complete';x.assertionChanges={unexpected:0,missing:0};save('Parsing assertion saved')}
    function provenanceFields(x){return '<div class="provenance-fields"><label><span>Report date</span><input id="source-date" type="date" value="'+esc(x.sourceDate)+'" onchange="captureProvenance()"></label><label><span>Report issuer</span><input id="source-issuer" value="'+esc(x.sourceIssuer)+'" oninput="captureProvenance()"></label></div>'}
    render=()=>{let x=d.documents[currentDocument],assertion=assertionText(x),note=assertion?'<p class="assertion-note '+(assertionTotal(x)?'failed':'complete')+'">'+esc(assertion)+(assertionTotal(x)?'. Re-extraction differs from the asserted result.':'')+'</p>':'';renderDocumentPicker();document.querySelector('main').innerHTML='<section class="review-document">'+note+provenanceFields(x)+'<table><tr>'+columns.map(([,label])=>'<th>'+label+'</th>').join('')+'</tr>'+x.records.map((r,j)=>'<tr data-d='+currentDocument+' data-r='+j+' data-state="'+r.status+'" data-ledger-change="'+(r.matchesLedger===false)+'" '+(r.assertionViolation?'data-assertion-violation="'+r.assertionViolation+'" title="Parser assertion: '+r.assertionViolation+' record"':'')+' oninput="markUnsaved(this)" onchange="markUnsaved(this)">'+cols.map(c=>'<td>'+field(r[c],c,r)+'</td>').join('')+'</tr>').join('')+'</table><button onclick="add('+currentDocument+')">Add row</button></section>'}
  </script>`;
  return new Response(page + documentPickerView, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
});
