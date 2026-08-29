// Guarda contra deriva entre o CÓDIGO e os manifestos de deploy.
//
// Existe por causa de um achado real: o render.yaml foi escrito antes do
// quadro colaborativo e ninguém voltou nele -- faltavam 6 variáveis do
// apps/web (LOGTO_*, SUPABASE_JWT_SECRET e as duas NEXT_PUBLIC_SUPABASE_*).
// Nada disso falha o build: o deploy sobe e a feature simplesmente não
// funciona. As duas NEXT_PUBLIC_* são o caso pior, porque o valor é
// CONGELADO no bundle em tempo de build -- setar no painel depois não
// conserta, só um rebuild.
//
// Sem dependência de propósito: js-yaml existe só transitivamente aqui,
// e uma guarda de CI que quebra quando uma dependência de terceiro
// muda de lugar tem o mesmo problema que ela deveria evitar. O
// render.yaml tem estrutura simples e estável; um parser de linha
// resolve e não acrescenta superfície.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Variáveis que o código lê mas que NÃO devem estar no render.yaml, cada
// uma com o motivo. Sem motivo escrito, não entra nesta lista -- é o que
// impede a allowlist de virar "lugar onde a gente esconde o que falta".
const ALLOWED_ABSENT = {
  NODE_ENV: "definida pela plataforma/Docker, não pelo blueprint",
  PORT: "o Render injeta sozinho",
  NEXT_RUNTIME: "definida pelo próprio Next.js em runtime",
  ZAPSIGN_SANDBOX_API_TOKEN:
    "ZAPSIGN_ENV está fixo em 'production' no render.yaml, então zapsign-client.ts nunca lê o token de sandbox naquele ambiente",
};

const APPS = [
  { dir: "apps/web", service: "araci-web" },
  { dir: "apps/api", service: "araci-api" },
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mts|cts)$/.test(entry)) out.push(full);
  }
  return out;
}

function envVarsReadBy(appDir) {
  const found = new Set();
  for (const file of walk(join(ROOT, appDir, "src"))) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) found.add(m[1]);
  }
  return found;
}

// Escopo POR SERVIÇO importa: uma variável que o apps/web precisa não
// adianta estar declarada só no serviço do apps/api. Um check que
// olhasse o arquivo inteiro passaria nesse caso e é justamente o erro
// que dá mais trabalho pra achar depois.
function parseRenderServices(text) {
  const services = [];
  let current = null;
  let inServices = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^services:/.test(line)) { inServices = true; continue; }
    if (/^[A-Za-z]/.test(line)) { inServices = /^services:/.test(line); continue; }
    if (!inServices) continue;
    // Só um serviço de topo abre em exatamente 2 espaços -- o
    // "- type:" aninhado dentro de fromService fica bem mais fundo.
    const type = line.match(/^ {2}- type: *(\S+)/);
    if (type) { current = { type: type[1], name: null, keys: new Set() }; services.push(current); continue; }
    if (!current) continue;
    const name = line.match(/^ {4}name: *(\S+)/);
    if (name && !current.name) { current.name = name[1]; continue; }
    const key = line.match(/^ +- key: *([A-Z0-9_]+)/);
    if (key) current.keys.add(key[1]);
  }
  return services;
}

const problems = [];

const renderText = readFileSync(join(ROOT, "render.yaml"), "utf8");
const services = parseRenderServices(renderText);

for (const { dir, service } of APPS) {
  const svc = services.find((s) => s.name === service);
  if (!svc) {
    problems.push(`render.yaml: serviço "${service}" não encontrado (o parser ou o blueprint mudou de forma).`);
    continue;
  }
  for (const name of [...envVarsReadBy(dir)].sort()) {
    if (svc.keys.has(name) || name in ALLOWED_ABSENT) continue;
    problems.push(`render.yaml / ${service}: falta "${name}" — lido por ${dir}/src.`);
  }
}

// NEXT_PUBLIC_* são congeladas no bundle em tempo de build: precisam de
// ARG no Dockerfile (não basta env de runtime) e precisam estar no
// "env" do turbo, senão um acerto de cache serve bundle com valor velho.
const webPublic = [...envVarsReadBy("apps/web")].filter((n) => n.startsWith("NEXT_PUBLIC_")).sort();

const dockerfile = readFileSync(join(ROOT, "apps/web/Dockerfile"), "utf8");
const args = new Set([...dockerfile.matchAll(/^ARG +([A-Z0-9_]+)/gm)].map((m) => m[1]));
for (const name of webPublic) {
  if (!args.has(name)) {
    problems.push(
      `apps/web/Dockerfile: falta "ARG ${name}" — sem isso o valor entra como undefined no bundle e NÃO dá pra corrigir no painel depois.`,
    );
  }
}

const turbo = readFileSync(join(ROOT, "turbo.json"), "utf8").replace(/^\s*\/\/.*$/gm, "");
const turboEnv = new Set(JSON.parse(turbo).tasks?.build?.env ?? []);
for (const name of webPublic) {
  if (!turboEnv.has(name)) {
    problems.push(`turbo.json: falta "${name}" em tasks.build.env — um acerto de cache pode publicar bundle com valor antigo.`);
  }
}

if (problems.length > 0) {
  console.error("Deriva entre o código e os manifestos de deploy:\n");
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    `\nCorrija o manifesto, ou (se a ausência for correta) adicione a variável em ALLOWED_ABSENT em ${"scripts/check-deploy-config.mjs"} COM o motivo.`,
  );
  process.exit(1);
}

console.log(
  `Manifestos de deploy conferem com o código (${services.length} serviços no render.yaml, ${webPublic.length} NEXT_PUBLIC_* no apps/web).`,
);
