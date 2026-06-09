import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import Module from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'demo-output');
const frameDir = path.join(outDir, 'frames');
const videoDir = path.join(outDir, 'video-raw');
const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ffmpegPath = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'ffmpeg-1011', 'ffmpeg-win64.exe');
const bundledNodeModules = path.join(process.env.USERPROFILE || '', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules');
const bundledPnpmModules = path.join(bundledNodeModules, '.pnpm', 'node_modules');

process.env.NODE_PATH = [bundledNodeModules, bundledPnpmModules, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();
const require = Module.createRequire(import.meta.url);
const { chromium } = require('playwright');

const baseUrl = process.env.DEMO_URL || 'http://localhost:3000';
const viewport = { width: 1280, height: 720 };
const cuts = [];
let serverProcess = null;

async function main() {
  await ensureServer();
  await prepareOutput();

  const browser = await chromium.launch({
    headless: true,
    executablePath: edgePath
  });
  const context = await browser.newContext({
    viewport,
    recordVideo: { dir: videoDir, size: viewport }
  });
  const page = await context.newPage();

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await cut(page, '01-home', '첫 화면', 'AI 협업 캔버스의 로그인/회원가입 진입 화면입니다.');

  await page.click('#goLoginBtn');
  await cut(page, '02-login', '계정 로그인', '데모 계정으로 학습자 또는 교수자가 접속할 수 있습니다.');
  await page.fill('#loginUsername', 'minseo');
  await page.fill('#loginPassword', 'student123');
  await page.click('#loginBtn');
  await page.waitForSelector('#projectScreen.screen.active', { timeout: 10000 });
  await cut(page, '03-projects', '프로젝트 선택', '더미 데이터가 채워진 대학생 과제 관리 서비스 프로젝트를 선택합니다.');

  await page.locator('[data-project="project-1"]').click();
  await page.waitForSelector('#appScreen.screen.active', { timeout: 10000 });
  await cut(page, '04-student-canvas', '학습자 협업 캔버스', 'CPS 단계에 따라 발산 공간과 수렴 공간을 오가며 팀 아이디어를 축적합니다.');

  await page.click('#phaseConvergeBtn');
  await cut(page, '05-problem-definition', '문제 정의와 HMW', '문제 탐색 수렴 공간에서는 사용자, 어려움, 원인, HMW 문장을 구조화합니다.');

  await page.click('[data-stage="1"]');
  await page.click('#phaseConvergeBtn');
  await page.locator('.criteria-input').first().fill('사용 편의성');
  await page.locator('.matrix-score').first().fill('5');
  await page.locator('.matrix-score').nth(1).fill('4');
  await cut(page, '06-decision-matrix', '평가행렬 워크시트', '발산 공간의 아이디어가 자동으로 들어오고, 평가 준거와 0~5점 점수를 조정합니다.');

  await clickText(page, '요약');
  await page.waitForTimeout(1000);
  await cut(page, '07-ai-help', 'AI 도움', 'AI 도움은 단계별 5회 제한 안에서 요약, 질문, 빠진 관점, 자기점검을 제공합니다.');

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.click('#goLoginBtn');
  await page.fill('#loginUsername', 'teacher');
  await page.fill('#loginPassword', 'teacher123');
  await page.click('#loginBtn');
  await page.waitForSelector('#projectScreen.screen.active', { timeout: 10000 });
  await page.locator('[data-project="project-1"]').click();
  await page.waitForSelector('#appScreen.screen.active', { timeout: 10000 });
  await cut(page, '08-teacher-dashboard', '교수자 대시보드', '교수자는 팀별 협동 온도, AI 활용, 학습자 활동 리스트를 확인합니다.');

  await page.locator('[data-team-view="1조"]').click();
  await page.waitForTimeout(800);
  await page.locator('#teacherTeamDetail').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await cut(page, '09-team-view', '조별 학습자 화면 보기', '팀 보기에서는 해당 조의 발산/수렴 카드와 최근 로그를 학습자 화면 형태로 관찰합니다.');

  await page.waitForTimeout(1200);
  const video = page.video();
  await context.close();
  await browser.close();

  const webmPath = await video.path();
  const targetWebm = path.join(outDir, 'demo.webm');
  await fs.copyFile(webmPath, targetWebm);
  await writeGuide();
  await writeCaptions();
  await convertToMp4(targetWebm, path.join(outDir, 'demo.mp4'));

  if (serverProcess) serverProcess.kill();
  console.log(`Demo assets generated in ${outDir}`);
}

async function ensureServer() {
  try {
    const res = await fetch(baseUrl);
    if (res.ok) return;
  } catch {}

  serverProcess = spawn('node', ['server.js'], {
    cwd: root,
    detached: false,
    stdio: 'ignore',
    windowsHide: true
  });
  await new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(async () => {
      try {
        const res = await fetch(baseUrl);
        if (res.ok) {
          clearInterval(timer);
          resolve();
        }
      } catch {}
      if (Date.now() - started > 15000) {
        clearInterval(timer);
        reject(new Error('Local server did not start within 15 seconds.'));
      }
    }, 500);
  });
}

async function prepareOutput() {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(frameDir, { recursive: true });
  await fs.mkdir(videoDir, { recursive: true });
}

async function cut(page, slug, title, description) {
  await page.waitForTimeout(900);
  const filename = `${slug}.png`;
  await page.screenshot({ path: path.join(frameDir, filename), fullPage: false });
  cuts.push({ slug, title, description, filename });
}

async function clickText(page, text) {
  await page.getByText(text, { exact: true }).click();
  await page.waitForTimeout(700);
}

async function writeGuide() {
  const lines = [
    '# AI 협업 캔버스 시연 컷별 설명',
    '',
    ...cuts.flatMap((cut, index) => [
      `## ${String(index + 1).padStart(2, '0')}. ${cut.title}`,
      `- 이미지: \`frames/${cut.filename}\``,
      `- 기능 설명: ${cut.description}`,
      ''
    ])
  ];
  await fs.writeFile(path.join(outDir, 'cut-guide.md'), lines.join('\n'), 'utf8');
}

async function writeCaptions() {
  const secondsPerCut = 9;
  const blocks = cuts.map((cut, index) => {
    const start = index * secondsPerCut;
    const end = start + secondsPerCut;
    return [
      String(index + 1),
      `${srtTime(start)} --> ${srtTime(end)}`,
      `${cut.title}: ${cut.description}`,
      ''
    ].join('\n');
  });
  await fs.writeFile(path.join(outDir, 'captions.srt'), blocks.join('\n'), 'utf8');
}

function srtTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},000`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

async function convertToMp4(input, output) {
  if (!ffmpegPath || spawnSync(ffmpegPath, ['-version'], { stdio: 'ignore' }).status !== 0) {
    console.warn('ffmpeg not found. Keeping WebM only.');
    await fs.writeFile(path.join(outDir, 'mp4-note.txt'), 'MP4 변환용 전체 ffmpeg를 찾지 못해 demo.webm만 생성했습니다.\n', 'utf8');
    return;
  }
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-y', '-i', input, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output], {
      stdio: 'pipe',
      windowsHide: true
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('exit', async (code) => {
      if (code === 0) return resolve();
      await fs.writeFile(
        path.join(outDir, 'mp4-note.txt'),
        [
          'demo.webm은 정상 생성되었습니다.',
          'Playwright가 설치한 ffmpeg는 WebM 녹화용 경량 빌드라 MP4 변환 옵션을 지원하지 않습니다.',
          '전체 ffmpeg가 설치되면 아래 명령으로 MP4 변환이 가능합니다:',
          `ffmpeg -y -i "${input}" -c:v libx264 -pix_fmt yuv420p "${output}"`,
          '',
          'ffmpeg stderr:',
          stderr
        ].join('\n'),
        'utf8'
      );
      console.warn('MP4 conversion skipped. See demo-output/mp4-note.txt.');
      resolve();
    });
  });
}

main().catch((error) => {
  if (serverProcess) serverProcess.kill();
  console.error(error);
  process.exit(1);
});
