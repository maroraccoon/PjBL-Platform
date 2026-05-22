const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

const aiResponses = {
  perspective: '다른 사람의 입장에서 보면 무엇이 불편할까요? 학생, 교사, 보호자, 운영자 관점으로 하나씩 나누어 생각해 보세요.',
  counter: '좋아 보이는 해결책도 예상하지 못한 문제가 생길 수 있습니다. 비용, 시간, 개인정보, 접근성 중 하나를 골라 다시 점검해 보세요.',
  elaborate: '아이디어를 더 구체화하려면 대상, 필요한 준비물, 성공했는지 확인하는 방법을 각각 한 문장으로 적어보세요.',
  criteria: '선택 기준으로는 실행 가능성, 도움이 되는 정도, 공정성, 확인 가능성을 사용할 수 있습니다.'
};

const demoUsers = [
  { id: 'teacher-01', username: 'teacher', password: 'teacher123', role: 'teacher', name: '김교수', team: 'all-teams' },
  { id: 'stu-01', username: 'minseo', password: 'student123', role: 'student', name: '김민서', team: 'Team A' },
  { id: 'stu-02', username: 'junho', password: 'student123', role: 'student', name: '이준호', team: 'Team A' },
  { id: 'stu-03', username: 'seoyeon', password: 'student123', role: 'student', name: '박서연', team: 'Team A' },
  { id: 'stu-04', username: 'doyoon', password: 'student123', role: 'student', name: '최도윤', team: 'Team B' },
  { id: 'stu-05', username: 'harin', password: 'student123', role: 'student', name: '정하린', team: 'Team B' },
  { id: 'stu-06', username: 'jihu', password: 'student123', role: 'student', name: '오지후', team: 'Team C' },
  { id: 'stu-07', username: 'yujin', password: 'student123', role: 'student', name: '한유진', team: 'Team C' },
  { id: 'stu-08', username: 'jia', password: 'student123', role: 'student', name: '송지아', team: 'Team D' }
];

const sessions = new Map();
const streams = new Map();
let store = loadStore();

function loadStore() {
  try {
    const loaded = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    if (!loaded.meta?.eventSeq && !loaded.states?.['project-1']?.events?.length) {
      const seeded = createDefaultStore();
      saveStore(seeded);
      return seeded;
    }
    return loaded;
  } catch (error) {
    const initial = createDefaultStore();
    saveStore(initial);
    return initial;
  }
}

function saveStore(nextStore = store) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(nextStore, null, 2));
}

function createDefaultStore() {
  const now = Date.now();
  const projects = [
    { id: 'project-1', name: '학교 공간 개선 프로젝트', topic: '학생들이 쉬는 시간을 더 잘 보낼 수 있는 학교 공간 만들기', teams: 4, createdBy: 'system', createdAt: new Date(now - 86400000).toISOString() },
    { id: 'project-2', name: '지역 문제 해결 프로젝트', topic: '우리 동네에서 발견한 불편함을 해결하는 서비스 제안', teams: 3, createdBy: 'system', createdAt: new Date(now - 86400000).toISOString() },
    { id: 'project-3', name: '친환경 생활 실천 프로젝트', topic: '교실에서 실천할 수 있는 자원 절약 방법 설계', teams: 5, createdBy: 'system', createdAt: new Date(now - 86400000).toISOString() }
  ];
  const events = Array.from({ length: 24 }, (_, index) => {
    const types = ['cps_stage_transition', 'phase_switch', 'idea_created', 'artifact_revision_event', 'ai_interaction_event'];
    const user = demoUsers[(index % 4) + 1];
    return {
      eventId: `evt-${String(index + 1).padStart(4, '0')}`,
      sessionId: 'demo-session-2026-05-18',
      projectId: 'project-1',
      teamId: user.team,
      actorId: index % 7 === 0 ? 'ai-01' : user.id,
      actorName: index % 7 === 0 ? 'AI 팀원' : user.name,
      actorRole: index % 7 === 0 ? 'ai_scaffold' : 'learner',
      eventType: types[index % types.length],
      cpsStage: ['problem_exploration', 'idea_generation', 'solution_design', 'action_planning'][Math.min(3, Math.floor(index / 6))],
      activityMode: index % 3 === 0 ? 'convergence' : 'divergence',
      timestamp: new Date(now - (24 - index) * 180000).toISOString(),
      payload: { mock: true }
    };
  }).reverse();

  return {
    meta: { eventSeq: 24, noteSeq: 3, revisionSeq: 3 },
    projects,
    states: {
      'project-1': {
        notes: [
          { id: 'note-1', stage: 'problem_exploration', mode: 'divergence', author: '김민서', actorId: 'stu-01', teamId: 'Team A', text: '쉬는 시간에 앉아서 이야기할 수 있는 공간이 부족하다.', timestamp: new Date(now - 7200000).toISOString() },
          { id: 'note-2', stage: 'problem_exploration', mode: 'divergence', author: '이준호', actorId: 'stu-02', teamId: 'Team A', text: '복도와 계단 주변에 학생들이 몰려 이동이 불편하다.', timestamp: new Date(now - 6840000).toISOString() },
          { id: 'note-3', stage: 'problem_exploration', mode: 'convergence', author: '팀 합의', actorId: 'stu-03', teamId: 'Team A', text: '학생들이 짧은 쉬는 시간에 안전하게 머물 공간을 찾기 어렵다.', timestamp: new Date(now - 6300000).toISOString() }
        ],
        events,
        revisions: [
          { version: 'v0.3', by: '박서연', timestamp: new Date(now - 4800000).toISOString(), delta: 27, title: '선택 기준 반영', note: '실행 가능성과 도움이 되는 정도를 기준으로 우선순위를 정했습니다.', type: 'edit' },
          { version: 'AI', by: 'AI', timestamp: new Date(now - 5400000).toISOString(), delta: 9, title: '힌트 제공', note: '관점 확장 질문을 제공했습니다.', type: 'ai' },
          { version: 'v0.2', by: '이준호', timestamp: new Date(now - 6000000).toISOString(), delta: 34, title: '아이디어 묶기', note: '비슷한 아이디어를 세 가지 방향으로 묶었습니다.', type: 'edit' }
        ],
        aiFeed: [
          { by: 'AI', text: '문제를 더 넓게 보려면 공간 부족, 이동 동선, 안전, 소음 관점을 나누어 살펴보세요.', timestamp: new Date(now - 5400000).toISOString() }
        ]
      },
      'project-2': emptyProjectState(),
      'project-3': emptyProjectState()
    }
  };
}

function emptyProjectState() {
  return { notes: [], events: [], revisions: [], aiFeed: [] };
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('요청 본문이 너무 큽니다.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error('JSON 형식이 올바르지 않습니다.'));
      }
    });
  });
}

function getToken(req, url) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return url.searchParams.get('token');
}

function requireSession(req, res, url) {
  const token = getToken(req, url);
  const session = token ? sessions.get(token) : null;
  if (!session) {
    sendJson(res, 401, { error: '로그인이 필요합니다.' });
    return null;
  }
  session.lastSeen = Date.now();
  return session;
}

function publicUser(user) {
  const { password, ...rest } = user;
  return rest;
}

function projectState(projectId) {
  if (!store.states[projectId]) store.states[projectId] = emptyProjectState();
  return store.states[projectId];
}

function addEvent(projectId, user, eventType, cpsStage, activityMode, payload = {}, actorOverride = null) {
  store.meta.eventSeq += 1;
  const actor = actorOverride || user;
  const event = {
    eventId: `evt-${String(store.meta.eventSeq).padStart(4, '0')}`,
    sessionId: `session-${projectId}`,
    projectId,
    teamId: actor.team || user.team || 'all-teams',
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role === 'teacher' ? 'instructor' : actor.role === 'ai_scaffold' ? 'ai_scaffold' : 'learner',
    eventType,
    cpsStage,
    activityMode,
    timestamp: new Date().toISOString(),
    payload
  };
  projectState(projectId).events.unshift(event);
  return event;
}

function buildState(projectId, viewer) {
  const project = store.projects.find((item) => item.id === projectId);
  const state = projectState(projectId);
  state.notes.forEach((note) => {
    if (!Array.isArray(note.replies)) note.replies = [];
  });
  const students = demoUsers.filter((user) => user.role === 'student');
  const now = Date.now();
  const roster = students.map((student) => {
    const session = [...sessions.values()].find((item) => item.user.id === student.id && item.projectId === projectId);
    const online = Boolean(session && now - session.lastSeen < 30000);
    const minutes = session ? Math.max((now - session.loginAt) / 60000, 0.1) : 0;
    const studentEvents = state.events.filter((event) => event.actorId === student.id);
    const divergence = studentEvents.filter((event) => event.activityMode === 'divergence').length;
    const convergence = studentEvents.filter((event) => event.activityMode === 'convergence').length;
    return {
      id: student.id,
      username: student.username,
      name: student.name,
      team: student.team,
      online,
      minutes,
      eventCount: studentEvents.length,
      divergence,
      convergence,
      rate: minutes ? studentEvents.length / minutes : 0
    };
  });

  const teams = [...new Set(students.map((student) => student.team))].map((team) => {
    const teamEvents = state.events.filter((event) => event.teamId === team);
    const ideaCount = teamEvents.filter((event) => event.eventType === 'idea_created').length;
    return { name: team, eventCount: teamEvents.length, ideaCount };
  });
  const targetTeam = viewer.role === 'student'
    ? viewer.team
    : teams.slice().sort((a, b) => b.ideaCount - a.ideaCount)[0]?.name || 'Team A';
  const teamIdeaCount = state.events.filter((event) => event.teamId === targetTeam && event.eventType === 'idea_created').length;

  return {
    project,
    notes: state.notes,
    events: state.events,
    revisions: state.revisions,
    aiFeed: state.aiFeed,
    roster,
    teams,
    aiUnlock: {
      team: targetTeam,
      teamIdeaCount,
      unlocked: teamIdeaCount >= 10
    }
  };
}

function broadcast(projectId) {
  const projectStreams = streams.get(projectId);
  if (!projectStreams) return;
  for (const client of projectStreams) {
    const data = JSON.stringify(buildState(projectId, client.user));
    client.res.write(`event: project:update\n`);
    client.res.write(`data: ${data}\n\n`);
  }
}

function addStream(projectId, user, res) {
  if (!streams.has(projectId)) streams.set(projectId, new Set());
  const client = { user, res };
  streams.get(projectId).add(client);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });
  res.write(`event: project:update\n`);
  res.write(`data: ${JSON.stringify(buildState(projectId, user))}\n\n`);
  return () => streams.get(projectId)?.delete(client);
}

async function handleApi(req, res, url) {
  try {
    if (req.method === 'POST' && url.pathname === '/api/login') {
      const body = await readBody(req);
      const user = demoUsers.find((item) => item.username === body.username && item.password === body.password && item.role === body.role);
      if (!user) return sendJson(res, 401, { error: '계정 정보가 올바르지 않습니다.' });
      const token = crypto.randomBytes(24).toString('hex');
      sessions.set(token, { token, user: publicUser(user), loginAt: Date.now(), lastSeen: Date.now(), projectId: null });
      return sendJson(res, 200, { token, user: publicUser(user) });
    }

    const session = requireSession(req, res, url);
    if (!session) return;

    if (req.method === 'POST' && url.pathname === '/api/heartbeat') {
      const body = await readBody(req);
      session.projectId = body.projectId || session.projectId;
      if (session.projectId) broadcast(session.projectId);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/api/projects') {
      return sendJson(res, 200, { projects: store.projects });
    }

    if (req.method === 'POST' && url.pathname === '/api/projects') {
      if (session.user.role !== 'teacher') return sendJson(res, 403, { error: '교수자만 프로젝트를 만들 수 있습니다.' });
      const body = await readBody(req);
      const project = {
        id: `project-${Date.now()}`,
        name: String(body.name || '새 프로젝트').trim(),
        topic: String(body.topic || '새로운 PjBL 탐구 주제').trim(),
        teams: 1,
        createdBy: 'teacher',
        createdAt: new Date().toISOString()
      };
      store.projects.unshift(project);
      store.states[project.id] = emptyProjectState();
      saveStore();
      return sendJson(res, 201, { project });
    }

    const noteMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/notes\/([^/]+)(?:\/(replies))?$/);
    if (noteMatch) {
      const [, projectId, noteId, noteAction] = noteMatch;
      const project = store.projects.find((item) => item.id === projectId);
      if (!project) return sendJson(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
      session.projectId = projectId;
      const state = projectState(projectId);
      const note = state.notes.find((item) => item.id === noteId);
      if (!note) return sendJson(res, 404, { error: '노트를 찾을 수 없습니다.' });
      if (!Array.isArray(note.replies)) note.replies = [];

      if (req.method === 'POST' && noteAction === 'replies') {
        const body = await readBody(req);
        const text = String(body.text || '').trim();
        if (!text) return sendJson(res, 400, { error: '답글 내용을 입력하세요.' });
        const reply = {
          id: `reply-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          author: session.user.name,
          actorId: session.user.id,
          actorRole: session.user.role,
          text,
          timestamp: new Date().toISOString()
        };
        note.replies.unshift(reply);
        note.updatedAt = reply.timestamp;
        addEvent(projectId, session.user, 'note_replied', note.stage, note.mode, { noteId, replyId: reply.id, text });
        saveStore();
        broadcast(projectId);
        return sendJson(res, 201, { reply, state: buildState(projectId, session.user) });
      }

      const canModify = session.user.role === 'teacher' || note.actorId === session.user.id;
      if (!canModify) return sendJson(res, 403, { error: '본인이 작성한 노트만 수정하거나 삭제할 수 있습니다.' });

      if (req.method === 'PATCH' && !noteAction) {
        const body = await readBody(req);
        const text = String(body.text || '').trim();
        if (!text) return sendJson(res, 400, { error: '노트 내용을 입력하세요.' });
        note.text = text;
        note.editedAt = new Date().toISOString();
        addEvent(projectId, session.user, 'note_updated', note.stage, note.mode, { noteId, text });
        saveStore();
        broadcast(projectId);
        return sendJson(res, 200, { note, state: buildState(projectId, session.user) });
      }

      if (req.method === 'DELETE' && !noteAction) {
        state.notes = state.notes.filter((item) => item.id !== noteId);
        addEvent(projectId, session.user, 'note_deleted', note.stage, note.mode, { noteId, deletedText: note.text });
        saveStore();
        broadcast(projectId);
        return sendJson(res, 200, { state: buildState(projectId, session.user) });
      }

      return sendJson(res, 405, { error: '허용되지 않는 노트 요청입니다.' });
    }

    const match = url.pathname.match(/^\/api\/projects\/([^/]+)\/(state|stream|notes|events|ai)$/);
    if (!match) return sendJson(res, 404, { error: 'API를 찾을 수 없습니다.' });

    const [, projectId, action] = match;
    const project = store.projects.find((item) => item.id === projectId);
    if (!project) return sendJson(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
    session.projectId = projectId;

    if (req.method === 'GET' && action === 'state') {
      return sendJson(res, 200, buildState(projectId, session.user));
    }

    if (req.method === 'GET' && action === 'stream') {
      const cleanup = addStream(projectId, session.user, res);
      req.on('close', cleanup);
      return;
    }

    if (req.method === 'POST' && action === 'notes') {
      if (session.user.role !== 'student') return sendJson(res, 403, { error: '학생만 노트를 입력할 수 있습니다.' });
      const body = await readBody(req);
      const text = String(body.text || '').trim();
      if (!text) return sendJson(res, 400, { error: '내용을 입력하세요.' });
      store.meta.noteSeq += 1;
      const note = {
        id: `note-${store.meta.noteSeq}`,
        stage: body.stage || 'problem_exploration',
        mode: body.mode === 'convergence' ? 'convergence' : 'divergence',
        author: body.mode === 'convergence' ? '팀 합의' : session.user.name,
        actorId: session.user.id,
        teamId: session.user.team,
        text,
        timestamp: new Date().toISOString(),
        replies: []
      };
      const state = projectState(projectId);
      state.notes.unshift(note);
      addEvent(projectId, session.user, note.mode === 'convergence' ? 'convergence_note_created' : 'idea_created', note.stage, note.mode, { noteId: note.id, text });
      saveStore();
      broadcast(projectId);
      return sendJson(res, 201, { note, state: buildState(projectId, session.user) });
    }

    if (req.method === 'POST' && action === 'events') {
      const body = await readBody(req);
      const eventType = body.eventType || 'collaboration_event';
      const event = addEvent(projectId, session.user, eventType, body.cpsStage || 'problem_exploration', body.activityMode || 'divergence', body.payload || {});
      if (eventType === 'artifact_revision_event') {
        store.meta.revisionSeq += 1;
        projectState(projectId).revisions.unshift({
          version: `v0.${store.meta.revisionSeq}`,
          by: session.user.name,
          timestamp: event.timestamp,
          delta: 12 + (store.meta.revisionSeq * 9) % 31,
          title: '결과물 수정',
          note: '팀 논의와 선택 기준을 반영해 결과물을 업데이트했습니다.',
          type: 'edit'
        });
      }
      saveStore();
      broadcast(projectId);
      return sendJson(res, 201, { event, state: buildState(projectId, session.user) });
    }

    if (req.method === 'POST' && action === 'ai') {
      if (session.user.role !== 'student') return sendJson(res, 403, { error: '학생만 AI 팀원을 호출할 수 있습니다.' });
      const current = buildState(projectId, session.user);
      if (!current.aiUnlock.unlocked) return sendJson(res, 423, { error: '아이디어를 10개 이상 적으면 AI 팀원이 잠금 해제 됩니다!' });
      const body = await readBody(req);
      const response = aiResponses[body.key] || aiResponses.perspective;
      const aiActor = { id: 'ai-01', name: 'AI 팀원', role: 'ai_scaffold', team: session.user.team };
      const event = addEvent(projectId, session.user, 'ai_interaction_event', body.cpsStage || 'problem_exploration', 'divergence', { scaffoldType: body.key, trigger: body.trigger }, aiActor);
      const state = projectState(projectId);
      state.aiFeed.unshift({ by: 'AI', text: response, timestamp: event.timestamp });
      state.revisions.unshift({ version: 'AI', by: 'AI', timestamp: event.timestamp, delta: 7, title: 'AI 힌트', note: response, type: 'ai' });
      saveStore();
      broadcast(projectId);
      return sendJson(res, 201, { response, state: buildState(projectId, session.user) });
    }

    return sendJson(res, 405, { error: '허용되지 않는 요청입니다.' });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
}

function serveStatic(req, res, url) {
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(ROOT, requested));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8'
    };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url);
    return;
  }
  serveStatic(req, res, url);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`PjBL collaboration server running at http://localhost:${PORT}`);
});
