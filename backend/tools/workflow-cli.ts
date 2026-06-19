#!/usr/bin/env node
/**
 * ChatFlow Workflow CLI
 *
 * Commands:
 *   record <url>                    — Launch Playwright codegen and save recording
 *   convert -i <file> -o <out>      — Convert a Playwright script to workflow JSON
 *   scaffold --all                  — Create all site workflow folders
 *   scaffold --site <name> --domain <domain> --workflows <w1,w2>
 *   list                            — List all workflow files
 *   validate <path>                 — Validate a workflow JSON file
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { convertFile, convertPlaywrightToWorkflow } from './playwright-converter.js';
import { scaffoldSite, scaffoldAllSites } from './site-scaffolder.js';

const WORKFLOWS_DIR = path.resolve(process.cwd(), 'workflows');

// ─── CLI Argument Parser ─────────────────────────────────────

function parseArgs(argv: string[]): { command: string; flags: Record<string, string>; positional: string[] } {
  const args = argv.slice(2);
  const command = args[0] ?? 'help';
  const flags: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--') && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = 'true';
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = 'true';
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, flags, positional };
}

// ─── Commands ────────────────────────────────────────────────

async function cmdRecord(flags: Record<string, string>, positional: string[]) {
  const url = positional[0] ?? flags.url;
  if (!url) {
    console.error('❌ Usage: workflow-cli record <url>');
    console.error('   Example: workflow-cli record https://myaadhaar.uidai.gov.in');
    process.exit(1);
  }

  const outputFile = flags.o ?? flags.output ?? `recording-${Date.now()}.ts`;
  console.log(`\n🎬 Recording interactions on ${url}`);
  console.log(`   Output: ${outputFile}`);
  console.log(`   Press Ctrl+C in the browser when done.\n`);

  const child = spawn('npx', [
    'playwright', 'codegen',
    '--target', 'javascript',
    '--output', outputFile,
    url,
  ], { stdio: 'inherit', shell: true });

  child.on('close', (code) => {
    if (code === 0) {
      console.log(`\n✅ Recording saved to ${outputFile}`);
      console.log(`\n💡 Convert it: npx tsx tools/workflow-cli.ts convert -i ${outputFile} -o workflows/site/task.json --name "Task Name"`);
    }
  });
}

async function cmdConvert(flags: Record<string, string>) {
  const inputFile = flags.i ?? flags.input;
  const outputFile = flags.o ?? flags.output;
  const name = flags.name ?? 'Unnamed Workflow';
  const id = flags.id ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const category = flags.category ?? 'general';
  const siteId = flags.site ?? flags.siteId;
  const portalType = flags.portal ?? 'general';

  if (!inputFile || !outputFile) {
    console.error('❌ Usage: workflow-cli convert -i <input.ts> -o <output.json> --name "Workflow Name"');
    process.exit(1);
  }

  await convertFile(inputFile, outputFile, {
    workflowId: id,
    workflowName: name,
    category,
    siteId,
    portalType,
    triggerPhrases: flags.triggers ? flags.triggers.split(',').map(t => t.trim()) : undefined,
  });
}

async function cmdScaffold(flags: Record<string, string>) {
  if (flags.all === 'true') {
    await scaffoldAllSites();
    return;
  }

  const siteName = flags.site ?? flags.name;
  const domain = flags.domain;
  const workflows = (flags.workflows ?? flags.w ?? '').split(',').map(w => w.trim()).filter(Boolean);

  if (!siteName || !domain || !workflows.length) {
    console.error('❌ Usage: workflow-cli scaffold --site <name> --domain <domain> --workflows <w1,w2,w3>');
    console.error('   Or:    workflow-cli scaffold --all');
    process.exit(1);
  }

  console.log(`\n📁 Scaffolding ${siteName} (${domain})`);
  await scaffoldSite({
    siteName,
    domain,
    category: flags.category,
    portalType: flags.portal,
    workflows,
  });
}

async function cmdList() {
  console.log('\n📋 Workflow Files:\n');
  const walk = async (dir: string, prefix = ''): Promise<void> => {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch { return; }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        console.log(`${prefix}📁 ${entry.name}/`);
        await walk(fullPath, prefix + '  ');
      } else if (entry.name.endsWith('.json') && entry.name !== 'site.json') {
        try {
          const raw = JSON.parse(await fs.readFile(fullPath, 'utf8'));
          const active = raw.isActive !== false ? '✅' : '⬜';
          const steps = raw.starterActionPlan?.length ?? 0;
          console.log(`${prefix}${active} ${entry.name} — ${raw.name ?? 'unnamed'} (${steps} steps)`);
        } catch {
          console.log(`${prefix}❓ ${entry.name} — parse error`);
        }
      }
    }
  };

  await walk(WORKFLOWS_DIR);
  console.log('');
}

async function cmdValidate(positional: string[]) {
  const filePath = positional[0];
  if (!filePath) {
    console.error('❌ Usage: workflow-cli validate <workflow.json>');
    process.exit(1);
  }

  try {
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!raw.id) errors.push('Missing "id"');
    if (!raw.name) errors.push('Missing "name"');
    if (!raw.entryUrl) errors.push('Missing "entryUrl"');
    if (!raw.starterActionPlan?.length) errors.push('Missing or empty "starterActionPlan"');

    // Validate each step
    const seenIds = new Set<string>();
    for (const step of raw.starterActionPlan ?? []) {
      if (!step.id) errors.push(`Step missing "id"`);
      if (seenIds.has(step.id)) errors.push(`Duplicate step id: ${step.id}`);
      seenIds.add(step.id);
      if (!step.action) errors.push(`Step ${step.id}: missing "action"`);

      if (step.action === 'navigate' && !step.value) errors.push(`Step ${step.id}: navigate needs "value" (URL)`);
      if (step.action === 'fill' && !step.target?.value) errors.push(`Step ${step.id}: fill needs "target.value"`);
      if (step.action === 'click' && !step.target?.value) errors.push(`Step ${step.id}: click needs "target.value"`);
      if (step.timeout && step.timeout < 1000) warnings.push(`Step ${step.id}: timeout ${step.timeout}ms seems too low`);

      // Check for template values that need replacement
      if (step.value?.includes('{{userInput:') || step.value?.includes('{{userFile:')) {
        const refId = step.value.match(/\{\{userInput:(\w+)\}\}/)?.[1];
        if (refId && !seenIds.has(refId)) {
          errors.push(`Step ${step.id}: references {{userInput:${refId}}} but step "${refId}" hasn't been defined yet`);
        }
      }
    }

    if (!raw.triggerPhrases?.length) warnings.push('No "triggerPhrases" — workflow won\'t match user messages');
    if (raw.isActive === false) warnings.push('Workflow is set to isActive: false');

    console.log(`\n📋 Validating: ${filePath}\n`);
    if (errors.length === 0 && warnings.length === 0) {
      console.log('✅ Valid! No issues found.\n');
    }
    if (errors.length) {
      console.log('❌ Errors:');
      errors.forEach(e => console.log(`   • ${e}`));
    }
    if (warnings.length) {
      console.log('⚠️  Warnings:');
      warnings.forEach(w => console.log(`   • ${w}`));
    }
    console.log(`\n📊 Summary: ${raw.starterActionPlan?.length ?? 0} steps, ${raw.requiredInputs?.length ?? 0} inputs, ${raw.requiredFiles?.length ?? 0} files\n`);

    if (errors.length) process.exit(1);
  } catch (err) {
    console.error(`❌ Failed to parse ${filePath}: ${(err as Error).message}`);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
🔧 ChatFlow Workflow CLI

Commands:
  record <url>                    Record interactions via Playwright codegen
  convert -i <file> -o <out>      Convert Playwright script to workflow JSON
    --name "Name"                   Workflow name (required)
    --id <id>                       Workflow ID (auto-generated from name)
    --category <cat>                Category (default: general)
    --site <siteId>                 Site ID
    --portal <type>                 Portal type (government|jobs|education|banking|general|aadhaar)
    --triggers "phrase1,phrase2"    Trigger phrases (comma-separated)
  scaffold --all                  Create folders for all configured Indian sites
  scaffold --site <n> --domain <d> --workflows <w1,w2>
                                  Create folder for a specific site
  list                            List all workflows
  validate <file>                 Validate a workflow JSON file
  help                            Show this help

Examples:
  npx tsx tools/workflow-cli.ts record https://myaadhaar.uidai.gov.in
  npx tsx tools/workflow-cli.ts convert -i recording.ts -o workflows/aadhaar/download.json --name "Download Aadhaar"
  npx tsx tools/workflow-cli.ts scaffold --all
  npx tsx tools/workflow-cli.ts list
  npx tsx tools/workflow-cli.ts validate workflows/aadhaar/download.json
`);
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const { command, flags, positional } = parseArgs(process.argv);

  switch (command) {
    case 'record':   return cmdRecord(flags, positional);
    case 'convert':  return cmdConvert(flags);
    case 'scaffold': return cmdScaffold(flags);
    case 'list':     return cmdList();
    case 'validate': return cmdValidate(positional);
    case 'help':
    default:         return showHelp();
  }
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
