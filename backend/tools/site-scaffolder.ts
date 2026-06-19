/**
 * Site Scaffolder — quickly create structured workflow folders
 *
 * Usage:
 *   npx tsx tools/site-scaffolder.ts create --site aadhaar --domain myaadhaar.uidai.gov.in \
 *     --workflows "download,update,address-change,link-mobile"
 */

import fs from 'fs/promises';
import path from 'path';

const WORKFLOWS_DIR = path.resolve(process.cwd(), 'workflows');

interface SiteConfig {
  siteName: string;
  domain: string;
  category?: string;
  portalType?: string;
  workflows: string[];
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function generateWorkflowTemplate(
  siteName: string,
  domain: string,
  workflowName: string,
  category: string,
  portalType: string
): Record<string, unknown> {
  const slug = slugify(workflowName);
  const siteSlug = slugify(siteName);
  return {
    id: `${siteSlug}-${slug}`,
    siteId: `${siteSlug}-${domain.split('.')[0]}`,
    name: `${siteName} — ${workflowName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
    category,
    trigger: `${workflowName.replace(/-/g, ' ')} ${siteName.toLowerCase()}`,
    triggerPhrases: [
      `${workflowName.replace(/-/g, ' ')}`,
      `${siteName.toLowerCase()} ${workflowName.replace(/-/g, ' ')}`,
    ],
    portalType,
    entryUrl: `https://${domain}/`,
    pageUrlPatterns: [domain.replace(/\./g, '\\\\.')],
    requiredInputs: [],
    requiredFiles: [],
    instructions: `Workflow for ${workflowName.replace(/-/g, ' ')} on ${siteName}. Record with: npx playwright codegen https://${domain}`,
    starterActionPlan: [
      {
        id: 's1',
        order: 1,
        action: 'navigate',
        value: `https://${domain}/`,
        timeout: 30000,
        retries: 2,
        description: `Navigate to ${siteName} portal`,
        humanDelay: true,
      },
      {
        id: 's2',
        order: 2,
        action: 'pauseForUserInput',
        expectedInput: 'text',
        timeout: 180000,
        contextMessage: 'Please provide the required details to proceed.',
        description: 'Collect user input',
      },
    ],
    errorRecoveryPlan: [],
    isActive: false,
    version: 1,
    metadata: {
      createdAt: new Date().toISOString(),
      status: 'template',
      recordCommand: `npx playwright codegen https://${domain}`,
    },
  };
}

export async function scaffoldSite(config: SiteConfig): Promise<string[]> {
  const siteDir = path.join(WORKFLOWS_DIR, slugify(config.siteName));
  await fs.mkdir(siteDir, { recursive: true });

  const createdFiles: string[] = [];
  const category = config.category ?? 'general';
  const portalType = config.portalType ?? 'general';

  // Create site.json metadata
  const siteMetaPath = path.join(siteDir, 'site.json');
  const siteMeta = {
    name: config.siteName,
    domain: config.domain,
    category,
    portalType,
    entryUrl: `https://${config.domain}/`,
    description: `All workflows for ${config.siteName}`,
    workflows: config.workflows.map(w => `${slugify(config.siteName)}-${slugify(w)}`),
    recordCommand: `npx playwright codegen https://${config.domain}`,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(siteMetaPath, JSON.stringify(siteMeta, null, 2) + '\n');
  createdFiles.push(siteMetaPath);

  // Create workflow templates
  for (const workflowName of config.workflows) {
    const fileName = `${slugify(workflowName)}.json`;
    const filePath = path.join(siteDir, fileName);

    // Don't overwrite existing workflows
    try {
      await fs.access(filePath);
      console.log(`  ⏭  Skipped ${fileName} (already exists)`);
      continue;
    } catch {} // File doesn't exist, create it

    const template = generateWorkflowTemplate(
      config.siteName,
      config.domain,
      workflowName,
      category,
      portalType
    );
    await fs.writeFile(filePath, JSON.stringify(template, null, 2) + '\n');
    createdFiles.push(filePath);
    console.log(`  ✅ Created ${fileName}`);
  }

  return createdFiles;
}

// ─── Bulk Scaffolder — create many sites at once ─────────────

const INDIA_SITES: SiteConfig[] = [
  {
    siteName: 'Aadhaar',
    domain: 'myaadhaar.uidai.gov.in',
    category: 'aadhaar',
    portalType: 'aadhaar',
    workflows: [
      'download-aadhaar',
      'update-name-dob',
      'address-change',
      'link-mobile',
      'check-status',
      'order-pvc',
      'verify-aadhaar',
    ],
  },
  {
    siteName: 'PAN',
    domain: 'eportal.incometax.gov.in',
    category: 'pan',
    portalType: 'government',
    workflows: [
      'download-pan',
      'apply-pan',
      'link-aadhaar-pan',
      'correction-pan',
      'check-pan-status',
      'verify-pan',
    ],
  },
  {
    siteName: 'Passport',
    domain: 'passportindia.gov.in',
    category: 'passport',
    portalType: 'government',
    workflows: [
      'apply-new-passport',
      'renew-passport',
      'check-status',
      'appointment-booking',
      'tatkaal-passport',
    ],
  },
  {
    siteName: 'SSC',
    domain: 'ssc.gov.in',
    category: 'ssc',
    portalType: 'jobs',
    workflows: [
      'job-application',
      'admit-card-download',
      'result-check',
      'answer-key',
    ],
  },
  {
    siteName: 'DigiLocker',
    domain: 'digilocker.gov.in',
    category: 'digilocker',
    portalType: 'government',
    workflows: [
      'download-document',
      'upload-document',
      'share-document',
      'link-aadhaar',
    ],
  },
  {
    siteName: 'EPFO',
    domain: 'unifiedportal-mem.epfindia.gov.in',
    category: 'epfo',
    portalType: 'government',
    workflows: [
      'check-balance',
      'download-passbook',
      'withdraw-pf',
      'transfer-pf',
      'update-kyc',
    ],
  },
  {
    siteName: 'RationCard',
    domain: 'nfsa.gov.in',
    category: 'ration',
    portalType: 'government',
    workflows: [
      'apply-ration-card',
      'check-status',
      'update-details',
      'download-card',
    ],
  },
  {
    siteName: 'VoterID',
    domain: 'voters.eci.gov.in',
    category: 'voter',
    portalType: 'government',
    workflows: [
      'apply-voter-id',
      'check-status',
      'download-voter-id',
      'correction',
      'search-name',
    ],
  },
  {
    siteName: 'DrivingLicense',
    domain: 'parivahan.gov.in',
    category: 'driving',
    portalType: 'government',
    workflows: [
      'apply-learner-license',
      'apply-driving-license',
      'renew-license',
      'international-permit',
      'check-status',
    ],
  },
  {
    siteName: 'IRCTC',
    domain: 'www.irctc.co.in',
    category: 'railway',
    portalType: 'general',
    workflows: [
      'book-ticket',
      'check-pnr',
      'cancel-ticket',
      'check-availability',
    ],
  },
];

export async function scaffoldAllSites(): Promise<void> {
  console.log('\n🏗️  Scaffolding workflow folders for all configured sites...\n');
  for (const site of INDIA_SITES) {
    console.log(`📁 ${site.siteName} (${site.domain})`);
    await scaffoldSite(site);
    console.log('');
  }
  console.log(`✅ Done! Created templates for ${INDIA_SITES.length} sites.`);
  console.log(`\n💡 Next steps:`);
  console.log(`  1. Record interactions: npx playwright codegen https://SITE_URL`);
  console.log(`  2. Convert recording:  npx tsx tools/workflow-cli.ts convert -i recording.ts -o workflows/site/task.json`);
  console.log(`  3. Set isActive: true in the workflow JSON when ready`);
  console.log(`  4. Restart backend to load new workflows\n`);
}
