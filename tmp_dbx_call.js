// 按计划文件依次调用 DBX MCP 工具：node tmp_dbx_call.js <plan.json>
const { spawn } = require('child_process');
const fs = require('fs');

const planPath = process.argv[2];
if (!planPath) { console.error('usage: node tmp_dbx_call.js <plan.json>'); process.exit(1); }
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

const child = spawn('npx', ['-y', '@dbx-app/mcp-server'], { stdio: ['pipe', 'pipe', 'pipe'], shell: true });

let buf = '';
const pending = new Map();
child.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let m;
    try { m = JSON.parse(line); } catch { continue; }
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  }
});
child.stderr.on('data', (d) => { const s = d.toString().trim(); if (s) console.error('STDERR:', s.slice(0, 200)); });

function rpc(method, params, id, t = 90000) {
  return new Promise((res) => {
    pending.set(id, res);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); res({ __timeout: true, id }); } }, t);
  });
}

(async () => {
  await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'dbx-call', version: '0.1.0' } }, 1, 30000);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  let id = 10;
  let outAll = '';
  for (const step of plan) {
    const r = await rpc('tools/call', { name: step.tool, arguments: step.args || {} }, id++);
    outAll += '\n=== STEP: ' + step.tool + ' ' + JSON.stringify(step.args || {}) + ' ===\n';
    const c = r && r.result && r.result.content;
    let stepText = '';
    if (c) {
      for (const part of c) stepText += (part.text ? part.text : JSON.stringify(part)) + '\n';
      if (r.result.isError) stepText += 'IS_ERROR: true\n';
    } else {
      stepText += JSON.stringify(r) + '\n';
    }
    outAll += stepText;
    console.log('\n=== STEP:', step.tool, '===');
    console.log(stepText.slice(0, 4000));
  }
  fs.writeFileSync('e:/company_code/microgpt/tmp_dbx_out.txt', outAll);
  console.log('\n[FULL OUTPUT SAVED] e:/company_code/microgpt/tmp_dbx_out.txt');
  process.exit(0);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
