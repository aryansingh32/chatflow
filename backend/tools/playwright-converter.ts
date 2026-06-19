/**
 * Playwright Codegen → ChatFlow Workflow Converter
 *
 * Parses output from `npx playwright codegen` and converts each
 * Playwright action into our ActionStep JSON format.
 *
 * Features:
 *  - Auto-detects captcha images → inserts pauseForUserInput(captcha)
 *  - Auto-detects OTP fields → inserts pauseForUserInput(otp)
 *  - Auto-detects file inputs → inserts pauseForUserInput(file) + upload
 *  - Converts all Playwright locator strategies to our target format
 *  - Generates proper IDs, ordering, descriptions
 */

import fs from 'fs/promises';
import path from 'path';

export interface ConvertedWorkflow {
  id: string;
  siteId: string;
  name: string;
  category: string;
  trigger: string;
  triggerPhrases: string[];
  portalType: string;
  entryUrl: string;
  pageUrlPatterns: string[];
  requiredInputs: string[];
  requiredFiles: string[];
  instructions: string;
  starterActionPlan: any[];
  errorRecoveryPlan: any[];
  isActive: boolean;
  version: number;
  metadata: Record<string, unknown>;
}

// ─── Pattern Matchers ────────────────────────────────────────

const CAPTCHA_PATTERNS = [
  /captcha/i, /recaptcha/i, /hcaptcha/i, /security.?code/i,
  /verify.?image/i, /challenge/i, /securitykey/i,
];

const OTP_PATTERNS = [
  /otp/i, /one.?time/i, /verification.?code/i, /sms.?code/i,
  /mobile.?code/i, /totp/i, /pin.?code/i,
];

const FILE_PATTERNS = [
  /type=['"]?file['"]?/i, /upload/i, /attach/i, /browse/i,
];

const PASSWORD_PATTERNS = [
  /type=['"]?password['"]?/i, /passwd/i,
];

// ─── Playwright Action Parsers ───────────────────────────────

interface ParsedAction {
  method: string;
  locator: string;
  locatorType: 'css' | 'text' | 'role' | 'testid' | 'xpath';
  roleName?: string;
  roleOptions?: Record<string, unknown>;
  value?: string;
  url?: string;
}

function parseLocator(raw: string): { value: string; type: 'css' | 'text' | 'role' | 'testid' | 'xpath'; roleName?: string; roleOptions?: Record<string, unknown> } {
  // page.getByRole('button', { name: 'Submit' })
  const roleMatch = raw.match(/getByRole\(\s*['"](\w+)['"]\s*(?:,\s*\{([^}]*)\})?\s*\)/);
  if (roleMatch) {
    const opts: Record<string, unknown> = {};
    if (roleMatch[2]) {
      const nameMatch = roleMatch[2].match(/name:\s*['"\/]([^'"\/]+)['"\/]/);
      if (nameMatch) opts.name = nameMatch[1];
      if (/exact:\s*true/.test(roleMatch[2])) opts.exact = true;
    }
    return { value: opts.name as string ?? roleMatch[1], type: 'role', roleName: roleMatch[1], roleOptions: opts };
  }

  // page.getByText('...')
  const textMatch = raw.match(/getByText\(\s*['"]([^'"]+)['"]\s*(?:,\s*\{[^}]*\})?\s*\)/);
  if (textMatch) return { value: textMatch[1], type: 'text' };

  // page.getByPlaceholder('...')
  const placeholderMatch = raw.match(/getByPlaceholder\(\s*['"]([^'"]+)['"]\s*\)/);
  if (placeholderMatch) return { value: `[placeholder*='${placeholderMatch[1]}']`, type: 'css' };

  // page.getByLabel('...')
  const labelMatch = raw.match(/getByLabel\(\s*['"]([^'"]+)['"]\s*\)/);
  if (labelMatch) return { value: labelMatch[1], type: 'text' };

  // page.getByTestId('...')
  const testIdMatch = raw.match(/getByTestId\(\s*['"]([^'"]+)['"]\s*\)/);
  if (testIdMatch) return { value: testIdMatch[1], type: 'testid' };

  // page.locator('selector')
  const locatorMatch = raw.match(/locator\(\s*['"]([^'"]+)['"]\s*\)/);
  if (locatorMatch) {
    const sel = locatorMatch[1];
    if (sel.startsWith('//') || sel.startsWith('xpath=')) return { value: sel, type: 'xpath' };
    if (sel.startsWith('text=') || sel.startsWith('text/')) return { value: sel, type: 'text' };
    return { value: sel, type: 'css' };
  }

  return { value: raw, type: 'css' };
}

function parseLine(line: string): ParsedAction | null {
  const trimmed = line.trim().replace(/;$/, '').replace(/\bawait\s+/, '');
  if (!trimmed.startsWith('page.') && !trimmed.startsWith('await page.')) return null;
  const normalized = trimmed.replace(/^(await\s+)?page\./, '');

  // page.goto('url')
  const gotoMatch = normalized.match(/goto\(\s*['"]([^'"]+)['"]\s*\)/);
  if (gotoMatch) return { method: 'goto', locator: '', locatorType: 'css', url: gotoMatch[1] };

  // page.waitForURL('url')
  const waitUrlMatch = normalized.match(/waitForURL\(\s*['"]([^'"]+)['"]/);
  if (waitUrlMatch) return { method: 'waitForURL', locator: '', locatorType: 'css', url: waitUrlMatch[1] };

  // page.waitForTimeout(ms)
  const waitTimeoutMatch = normalized.match(/waitForTimeout\(\s*(\d+)\s*\)/);
  if (waitTimeoutMatch) return { method: 'waitForTimeout', locator: '', locatorType: 'css', value: waitTimeoutMatch[1] };

  // .click()
  if (normalized.endsWith('.click()') || /\.click\(\s*\)/.test(normalized)) {
    const loc = parseLocator(normalized);
    return { method: 'click', ...loc };
  }

  // .dblclick()
  if (/\.dblclick\(\s*\)/.test(normalized)) {
    const loc = parseLocator(normalized);
    return { method: 'dblclick', ...loc };
  }

  // .fill('value')
  const fillMatch = normalized.match(/\.fill\(\s*['"]([^'"]*)['"]\s*\)/);
  if (fillMatch) {
    const loc = parseLocator(normalized);
    return { method: 'fill', ...loc, value: fillMatch[1] };
  }

  // .type('value')  (deprecated but codegen may emit it)
  const typeMatch = normalized.match(/\.type\(\s*['"]([^'"]*)['"]\s*\)/);
  if (typeMatch) {
    const loc = parseLocator(normalized);
    return { method: 'fill', ...loc, value: typeMatch[1] };
  }

  // .press('key')
  const pressMatch = normalized.match(/\.press\(\s*['"]([^'"]+)['"]\s*\)/);
  if (pressMatch) {
    const loc = parseLocator(normalized);
    return { method: 'press', ...loc, value: pressMatch[1] };
  }

  // .selectOption('value')
  const selectMatch = normalized.match(/\.selectOption\(\s*['"]([^'"]+)['"]\s*\)/);
  if (selectMatch) {
    const loc = parseLocator(normalized);
    return { method: 'selectOption', ...loc, value: selectMatch[1] };
  }

  // .check()
  if (/\.check\(\s*\)/.test(normalized)) {
    const loc = parseLocator(normalized);
    return { method: 'check', ...loc };
  }

  // .uncheck()
  if (/\.uncheck\(\s*\)/.test(normalized)) {
    const loc = parseLocator(normalized);
    return { method: 'uncheck', ...loc };
  }

  // .setInputFiles('path')
  const fileMatch = normalized.match(/\.setInputFiles\(\s*['"]([^'"]+)['"]\s*\)/);
  if (fileMatch) {
    const loc = parseLocator(normalized);
    return { method: 'setInputFiles', ...loc, value: fileMatch[1] };
  }

  // .hover()
  if (/\.hover\(\s*\)/.test(normalized)) {
    const loc = parseLocator(normalized);
    return { method: 'hover', ...loc };
  }

  // .scrollIntoViewIfNeeded()
  if (/\.scrollIntoViewIfNeeded/.test(normalized)) {
    const loc = parseLocator(normalized);
    return { method: 'scroll', ...loc };
  }

  // page.keyboard.press('key')
  const kbPressMatch = normalized.match(/keyboard\.press\(\s*['"]([^'"]+)['"]\s*\)/);
  if (kbPressMatch) return { method: 'pressKey', locator: '', locatorType: 'css', value: kbPressMatch[1] };

  // page.keyboard.type('text')
  const kbTypeMatch = normalized.match(/keyboard\.type\(\s*['"]([^'"]*)['"]\s*\)/);
  if (kbTypeMatch) return { method: 'keyboardType', locator: '', locatorType: 'css', value: kbTypeMatch[1] };

  // page.mouse.click(x, y)
  const mouseClickMatch = normalized.match(/mouse\.click\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (mouseClickMatch) return { method: 'mouseClick', locator: '', locatorType: 'css', value: `${mouseClickMatch[1]},${mouseClickMatch[2]}` };

  return null;
}

// ─── Smart Detection ─────────────────────────────────────────

function isCaptchaRelated(selector: string): boolean {
  return CAPTCHA_PATTERNS.some(p => p.test(selector));
}

function isOtpRelated(selector: string): boolean {
  return OTP_PATTERNS.some(p => p.test(selector));
}

function isFileInput(selector: string): boolean {
  return FILE_PATTERNS.some(p => p.test(selector));
}

function isPasswordField(selector: string): boolean {
  return PASSWORD_PATTERNS.some(p => p.test(selector));
}

// ─── Converter ───────────────────────────────────────────────

export function convertPlaywrightToWorkflow(
  scriptContent: string,
  options: {
    workflowId: string;
    workflowName: string;
    category?: string;
    siteId?: string;
    portalType?: string;
    triggerPhrases?: string[];
  }
): ConvertedWorkflow {
  const lines = scriptContent.split('\n');
  const actions: ParsedAction[] = [];
  const requiredInputs: Set<string> = new Set();
  const requiredFiles: Set<string> = new Set();
  let entryUrl = '';

  // Parse all lines
  for (const line of lines) {
    const action = parseLine(line);
    if (action) {
      actions.push(action);
      if (action.method === 'goto' && !entryUrl) entryUrl = action.url!;
    }
  }

  // Convert to ActionSteps with smart detection
  const steps: any[] = [];
  let stepCounter = 1;

  for (const action of actions) {
    const stepId = `s${stepCounter}`;

    switch (action.method) {
      case 'goto': {
        steps.push({
          id: stepId,
          order: stepCounter,
          action: 'navigate',
          value: action.url,
          timeout: 30000,
          retries: 2,
          description: `Navigate to ${new URL(action.url!).hostname}`,
          humanDelay: true,
        });
        break;
      }

      case 'click': {
        const target = buildTarget(action);
        steps.push({
          id: stepId,
          order: stepCounter,
          action: 'click',
          target,
          timeout: 15000,
          retries: 2,
          description: `Click ${action.value || action.locator || 'element'}`,
        });
        break;
      }

      case 'dblclick': {
        const target = buildTarget(action);
        steps.push({
          id: stepId,
          order: stepCounter,
          action: 'doubleClick',
          target,
          timeout: 15000,
          retries: 1,
          description: `Double-click ${action.value || action.locator || 'element'}`,
        });
        break;
      }

      case 'fill': {
        const target = buildTarget(action);
        const selector = action.locator;
        const value = action.value ?? '';

        // Auto-detect captcha fields
        if (isCaptchaRelated(selector)) {
          const pauseId = `${stepId}_pause`;
          steps.push({
            id: pauseId,
            order: stepCounter++,
            action: 'pauseForUserInput',
            expectedInput: 'captcha',
            target: { value: `img[alt*='CAPTCHA']`, type: 'css' },
            timeout: 180000,
            contextMessage: 'Please enter the CAPTCHA code shown on the live screen.',
            description: 'Wait for user to solve CAPTCHA',
          });
          requiredInputs.add('captcha');
          steps.push({
            id: stepId,
            order: stepCounter,
            action: 'fill',
            target,
            value: `{{userInput:${pauseId}}}`,
            timeout: 10000,
            retries: 2,
            description: 'Enter CAPTCHA',
            humanType: true,
          });
          break;
        }

        // Auto-detect OTP fields
        if (isOtpRelated(selector)) {
          const pauseId = `${stepId}_pause`;
          steps.push({
            id: pauseId,
            order: stepCounter++,
            action: 'pauseForUserInput',
            expectedInput: 'otp',
            timeout: 300000,
            contextMessage: 'Please enter the OTP sent to your registered mobile number.',
            description: 'Wait for user to enter OTP',
          });
          requiredInputs.add('otp');
          steps.push({
            id: stepId,
            order: stepCounter,
            action: 'fill',
            target,
            value: `{{userInput:${pauseId}}}`,
            timeout: 10000,
            retries: 2,
            description: 'Enter OTP',
            humanType: true,
          });
          break;
        }

        // Auto-detect password fields
        if (isPasswordField(selector)) {
          const pauseId = `${stepId}_pause`;
          steps.push({
            id: pauseId,
            order: stepCounter++,
            action: 'pauseForUserInput',
            expectedInput: 'password',
            timeout: 180000,
            contextMessage: 'Please enter your password.',
            description: 'Wait for user to enter password',
          });
          requiredInputs.add('password');
          steps.push({
            id: stepId,
            order: stepCounter,
            action: 'fill',
            target,
            value: `{{userInput:${pauseId}}}`,
            timeout: 10000,
            retries: 2,
            description: 'Enter password',
            humanType: true,
          });
          break;
        }

        // Regular fill — use the recorded value or ask user
        if (value && value.length > 0) {
          // If the recorded value looks like real user data, make it a pause
          const looksLikeUserData = value.length > 3 && !/^(test|demo|example)/i.test(value);
          if (looksLikeUserData) {
            const pauseId = `${stepId}_pause`;
            steps.push({
              id: pauseId,
              order: stepCounter++,
              action: 'pauseForUserInput',
              expectedInput: 'text',
              timeout: 180000,
              contextMessage: `Please provide the value for this field.`,
              description: `Ask user for input (detected: "${value.slice(0, 20)}...")`,
            });
            requiredInputs.add('text_input');
            steps.push({
              id: stepId,
              order: stepCounter,
              action: 'fill',
              target,
              value: `{{userInput:${pauseId}}}`,
              timeout: 10000,
              retries: 2,
              description: `Fill field`,
              humanType: true,
            });
          } else {
            steps.push({
              id: stepId,
              order: stepCounter,
              action: 'fill',
              target,
              value,
              timeout: 10000,
              retries: 2,
              description: `Fill field with "${value}"`,
              humanType: true,
            });
          }
        }
        break;
      }

      case 'selectOption': {
        const target = buildTarget(action);
        steps.push({
          id: stepId,
          order: stepCounter,
          action: 'select',
          target,
          value: action.value,
          timeout: 10000,
          retries: 2,
          description: `Select "${action.value}"`,
        });
        break;
      }

      case 'check': {
        steps.push({
          id: stepId,
          order: stepCounter,
          action: 'check',
          target: buildTarget(action),
          timeout: 10000,
          retries: 1,
          description: `Check checkbox`,
        });
        break;
      }

      case 'uncheck': {
        steps.push({
          id: stepId,
          order: stepCounter,
          action: 'uncheck',
          target: buildTarget(action),
          timeout: 10000,
          retries: 1,
          description: `Uncheck checkbox`,
        });
        break;
      }

      case 'setInputFiles': {
        const pauseId = `${stepId}_pause`;
        steps.push({
          id: pauseId,
          order: stepCounter++,
          action: 'pauseForUserInput',
          expectedInput: 'file',
          timeout: 300000,
          contextMessage: 'Please upload the required file.',
          description: 'Wait for user to provide file',
        });
        requiredFiles.add('document');
        steps.push({
          id: stepId,
          order: stepCounter,
          action: 'upload',
          target: buildTarget(action),
          value: `{{userFile:document}}`,
          timeout: 30000,
          retries: 1,
          description: 'Upload file',
        });
        break;
      }

      case 'hover': {
        steps.push({
          id: stepId,
          order: stepCounter,
          action: 'mouseMove',
          target: buildTarget(action),
          timeout: 5000,
          description: 'Hover over element',
        });
        break;
      }

      case 'scroll': {
        steps.push({
          id: stepId,
          order: stepCounter,
          action: 'scroll',
          target: buildTarget(action),
          value: 'down',
          description: 'Scroll element into view',
        });
        break;
      }

      case 'press':
      case 'pressKey': {
        steps.push({
          id: stepId,
          order: stepCounter,
          action: 'pressKey',
          value: action.value,
          ...(action.locator ? { target: buildTarget(action) } : {}),
          timeout: 5000,
          description: `Press ${action.value}`,
        });
        break;
      }

      case 'keyboardType': {
        steps.push({
          id: stepId,
          order: stepCounter,
          action: 'fill',
          value: action.value,
          timeout: 10000,
          description: `Type "${action.value}"`,
          humanType: true,
        });
        break;
      }

      case 'waitForURL': {
        steps.push({
          id: stepId,
          order: stepCounter,
          action: 'waitForNavigation',
          value: action.url,
          timeout: 30000,
          retries: 1,
          description: `Wait for navigation to ${action.url}`,
        });
        break;
      }

      case 'waitForTimeout': {
        steps.push({
          id: stepId,
          order: stepCounter,
          action: 'waitForTimeout',
          value: action.value,
          timeout: parseInt(action.value ?? '5000') + 2000,
          description: `Wait ${action.value}ms`,
        });
        break;
      }

      case 'mouseClick': {
        const [x, y] = (action.value ?? '0,0').split(',');
        steps.push({
          id: stepId,
          order: stepCounter,
          action: 'mouseMove',
          metadata: { x: parseInt(x), y: parseInt(y), click: true },
          timeout: 5000,
          description: `Click at coordinates (${x}, ${y})`,
        });
        break;
      }

      default:
        continue; // Skip unknown actions
    }

    stepCounter++;
  }

  // Build the domain pattern from entryUrl
  let domain = '';
  let pageUrlPatterns: string[] = [];
  if (entryUrl) {
    try {
      domain = new URL(entryUrl).hostname;
      pageUrlPatterns = [domain.replace(/\./g, '\\\\.')];
    } catch {}
  }

  return {
    id: options.workflowId,
    siteId: options.siteId ?? domain,
    name: options.workflowName,
    category: options.category ?? 'general',
    trigger: options.workflowName.toLowerCase(),
    triggerPhrases: options.triggerPhrases ?? [options.workflowName.toLowerCase()],
    portalType: options.portalType ?? 'general',
    entryUrl,
    pageUrlPatterns,
    requiredInputs: [...requiredInputs],
    requiredFiles: [...requiredFiles] as any[],
    instructions: `Workflow for ${options.workflowName}. Auto-generated from Playwright recording.`,
    starterActionPlan: steps,
    errorRecoveryPlan: [],
    isActive: true,
    version: 1,
    metadata: {
      generatedAt: new Date().toISOString(),
      source: 'playwright-converter',
      originalStepCount: actions.length,
    },
  };
}

function buildTarget(action: ParsedAction) {
  const target: any = {
    value: action.locator,
    type: action.locatorType,
  };
  if (action.roleName) target.roleName = action.roleName;
  if (action.roleOptions && Object.keys(action.roleOptions).length > 0) {
    target.roleOptions = action.roleOptions;
  }
  return target;
}

// ─── File I/O ────────────────────────────────────────────────

export async function convertFile(
  inputPath: string,
  outputPath: string,
  options: Parameters<typeof convertPlaywrightToWorkflow>[1]
): Promise<ConvertedWorkflow> {
  const content = await fs.readFile(inputPath, 'utf8');
  const workflow = convertPlaywrightToWorkflow(content, options);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(workflow, null, 2) + '\n');
  console.log(`✅ Converted ${inputPath} → ${outputPath} (${workflow.starterActionPlan.length} steps)`);
  return workflow;
}
