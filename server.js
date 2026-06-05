const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const STORE_PATH = path.join(ROOT, 'data', 'store.json');

const stages = ['problem_exploration', 'idea_generation', 'solution_design', 'action_planning'];

const demoUsers = [
  { id: 'teacher-01', username: 'teacher', password: 'teacher123', role: 'teacher', name: '김교수', team: '전체' },
  { id: 'stu-01', username: 'minseo', password: 'student123', role: 'student', name: '김민서', team: '1조' },
  { id: 'stu-02', username: 'junho', password: 'student123', role: 'student', name: '이준호', team: '1조' },
  { id: 'stu-03', username: 'seoyeon', password: 'student123', role: 'student', name: '박서연', team: '1조' },
  { id: 'stu-04', username: 'doyoon', password: 'student123', role: 'student', name: '최도윤', team: '2조' },
  { id: 'stu-05', username: 'harin', password: 'student123', role: 'student', name: '정하린', team: '2조' },
  { id: 'stu-06', username: 'jihu', password: 'student123', role: 'student', name: '오지후', team: '3조' },
  { id: 'stu-07', username: 'yujin', password: 'student123', role: 'student', name: '한유진', team: '3조' },
  { id: 'stu-08', username: 'jia', password: 'student123', role: 'student', name: '송지아', team: '4조' },
  { id: 'stu-09', username: 'chanhee', password: 'student123', role: 'student', name: '김찬희', team: '1조' },
  { id: 'stu-10', username: 'ryeowon', password: 'student123', role: 'student', name: '김려원', team: '1조' },
  { id: 'stu-11', username: 'gyeonguk', password: 'student123', role: 'student', name: '정경욱', team: '2조' },
  { id: 'stu-12', username: 'sumin', password: 'student123', role: 'student', name: '이수민', team: '2조' },
  { id: 'stu-13', username: 'yejin', password: 'student123', role: 'student', name: '최예진', team: '3조' },
  { id: 'stu-14', username: 'taeho', password: 'student123', role: 'student', name: '강태호', team: '3조' },
  { id: 'stu-15', username: 'narin', password: 'student123', role: 'student', name: '윤나린', team: '4조' },
  { id: 'stu-16', username: 'hyunwoo', password: 'student123', role: 'student', name: '박현우', team: '4조' },
  { id: 'stu-17', username: 'eunseo', password: 'student123', role: 'student', name: '오은서', team: '5조' },
  { id: 'stu-18', username: 'minjae', password: 'student123', role: 'student', name: '서민재', team: '5조' },
  { id: 'stu-19', username: 'seojin', password: 'student123', role: 'student', name: '한서진', team: '5조' },
  { id: 'stu-20', username: 'yuna', password: 'student123', role: 'student', name: '장유나', team: '5조' }
];

const sessions = new Map();
const streams = new Map();
let store = loadStore();

function loadStore() {
  try {
    const loaded = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    if (!loaded.meta || !loaded.projects || !loaded.states) throw new Error('bad store');
    if (!loaded.projects.length) {
      const fresh = createDefaultStore();
      saveStore(fresh);
      return fresh;
    }
    return normalizeStore(loaded);
  } catch {
    const fresh = createDefaultStore();
    saveStore(fresh);
    return fresh;
  }
}

function normalizeStore(next) {
  next.meta = { eventSeq: 0, noteSeq: 0, revisionSeq: 0, ...(next.meta || {}) };
  next.projects ||= [];
  next.states ||= {};
  next.users ||= [];
  next.projects.forEach((project) => {
    project.enrolledStudents ||= [];
    if (typeof project.visibleToAll !== 'boolean') project.visibleToAll = project.createdBy !== 'teacher';
    if (!project.shareCode && project.createdBy === 'teacher') project.shareCode = null;
    next.states[project.id] ||= emptyProjectState();
    const state = next.states[project.id];
    state.notes ||= [];
    state.events ||= [];
    state.revisions ||= [];
    state.aiFeed ||= [];
    state.decisions ||= {};
    state.notes.forEach((note) => {
      note.replies ||= [];
      note.likes ||= [];
    });
  });
  return next;
}

function saveStore(nextStore = store) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(nextStore, null, 2), 'utf8');
}

function allUsers() {
  return [...demoUsers, ...(store.users || [])];
}

function createDefaultStore() {
  const now = Date.now();
  const projects = [
    { id: 'project-1', name: '대학생 과제 관리 서비스', topic: '여러 플랫폼에 흩어진 과제와 일정을 한곳에서 관리하는 서비스 설계', teams: 5, createdBy: 'system', createdAt: new Date(now).toISOString(), visibleToAll: true, enrolledStudents: [], shareCode: 'DEMO01' },
    { id: 'project-2', name: '학교 휴게 공간 혼잡도 안내 서비스', topic: '학생들이 쉬는 시간에 사용할 수 있는 공간을 쉽게 찾도록 돕는 서비스 설계', teams: 5, createdBy: 'system', createdAt: new Date(now).toISOString(), visibleToAll: true, enrolledStudents: [], shareCode: 'DEMO02' },
    { id: 'project-3', name: '지역 상권 접근성 개선 프로젝트', topic: '지역 주민과 학생이 주변 상점을 더 쉽게 이용할 수 있는 안내 경험 설계', teams: 5, createdBy: 'system', createdAt: new Date(now).toISOString(), visibleToAll: true, enrolledStudents: [], shareCode: 'DEMO03' }
  ];
  const state = emptyProjectState();
  const seedNotes = [
    ['note-1', 'problem_exploration', 'divergence', '김민서', 'stu-01', '1조', '대학생은 과제 공지가 LMS, 메신저, 이메일에 흩어져 있어 마감일을 놓치기 쉽다.'],
    ['note-2', 'problem_exploration', 'divergence', '이준호', 'stu-02', '1조', '팀플 일정과 개인 과제 일정이 서로 겹칠 때 우선순위를 정하기 어렵다.'],
    ['note-3', 'problem_exploration', 'divergence', '박서연', 'stu-03', '1조', '새로운 수업 플랫폼을 매번 확인해야 해서 피로감이 크다.'],
    ['note-4', 'problem_exploration', 'convergence', '박서연', 'stu-03', '1조', '대학생은 과제 관리에 어려움을 겪는다.\n왜냐하면 여러 플랫폼에 일정과 제출물이 흩어져 있기 때문이다.\n\nHMW: 어떻게 하면 대학생이 여러 플랫폼을 오가지 않고 오늘 해야 할 과제를 바로 파악할 수 있을까?'],
    ['note-5', 'idea_generation', 'divergence', '김민서', 'stu-01', '1조', '모든 과제 마감일을 자동으로 모아 보여주는 통합 캘린더'],
    ['note-6', 'idea_generation', 'divergence', '이준호', 'stu-02', '1조', '마감 임박 과제를 색상과 알림으로 알려주는 우선순위 보드'],
    ['note-7', 'idea_generation', 'divergence', '박서연', 'stu-03', '1조', '팀플 역할과 개인 할 일을 함께 관리하는 공동 체크리스트'],
    ['note-8', 'idea_generation', 'convergence', '김민서', 'stu-01', '1조', '최종 선택 아이디어는 통합 캘린더와 우선순위 보드를 결합한 과제 관리 대시보드이다.'],
    ['note-9', 'solution_design', 'divergence', '이준호', 'stu-02', '1조', '웹앱 형태로 만들고, 첫 화면에는 오늘 할 일과 이번 주 마감 과제만 보여준다.'],
    ['note-10', 'solution_design', 'divergence', '박서연', 'stu-03', '1조', '프로토타입은 피그마 화면과 클릭 가능한 간단한 HTML로 제작할 수 있다.'],
    ['note-11', 'solution_design', 'convergence', '김민서', 'stu-01', '1조', '실제 제작 형태는 모바일 우선 웹 대시보드이며, 핵심 기능은 과제 자동 모음, 우선순위 표시, 완료 체크이다.'],
    ['note-12', 'action_planning', 'divergence', '박서연', 'stu-03', '1조', '사용자는 수업 직후 알림을 보고 오늘 해야 할 과제를 확인하는 상황을 테스트한다.'],
    ['note-13', 'action_planning', 'convergence', '이준호', 'stu-02', '1조', '테스트 기준은 첫 방문자가 1분 안에 가장 급한 과제를 찾고 완료 체크 방법을 설명할 수 있는지이다.'],
    ['note-14', 'idea_generation', 'divergence', '최도윤', 'stu-04', '2조', '위치 기반으로 학교 휴게 공간 혼잡도를 보여주는 지도'],
    ['note-15', 'idea_generation', 'divergence', '정하린', 'stu-05', '2조', '빈 강의실을 임시 학습 공간으로 예약하는 서비스']
  ];
  state.notes = seedNotes.map(([id, stage, mode, author, actorId, teamId, text], index) => ({
    id, stage, mode, author, actorId, teamId, text, replies: [], likes: [],
    timestamp: new Date(now - (index + 1) * 600000).toISOString()
  }));
  state.notes[0].likes = ['stu-02', 'stu-03'];
  state.notes[4].likes = ['stu-02'];
  state.notes[4].replies = [{ id: 'reply-1', author: '이준호', actorId: 'stu-02', text: '자동 수집이 어렵다면 처음에는 학생이 직접 추가하는 방식으로 시작해도 좋겠습니다.', timestamp: new Date(now - 420000).toISOString() }];
  state.decisions.idea_generation = {
    updatedBy: '김민서',
    timestamp: new Date(now - 360000).toISOString(),
    selectedNoteId: 'note-7',
    criteria: ['실현 가능성', '영향력', '차별성', '명확성'],
    matrix: [
      { noteId: 'note-5', scores: [5, 4, 3, 4], total: 16 },
      { noteId: 'note-6', scores: [4, 5, 3, 5], total: 17 },
      { noteId: 'note-7', scores: [4, 4, 5, 5], total: 18 }
    ]
  };
  const fresh = { meta: { eventSeq: 0, noteSeq: seedNotes.length, revisionSeq: 4 }, projects, states: { 'project-1': state, 'project-2': emptyProjectState(), 'project-3': emptyProjectState() } };
  state.notes.forEach((note) => {
    const user = allUsers().find((u) => u.id === note.actorId) || demoUsers[1];
    fresh.meta.eventSeq += 1;
    state.events.unshift({
      eventId: `evt-${String(fresh.meta.eventSeq).padStart(4, '0')}`,
      sessionId: 'session-project-1',
      projectId: 'project-1',
      teamId: user.team,
      actorId: user.id,
      actorName: user.name,
      actorRole: 'learner',
      eventType: note.mode === 'convergence' ? 'convergence_note_created' : 'idea_created',
      cpsStage: note.stage,
      activityMode: note.mode,
      timestamp: note.timestamp,
      payload: { noteId: note.id, text: note.text }
    });
  });
  [
    ['artifact_revision_event', 'solution_design', 'convergence', demoUsers[1], { summary: '문제 정의 초안', detail: '사용자와 원인 문장 구조로 문제를 정리했습니다.' }],
    ['decision_matrix_used', 'idea_generation', 'convergence', demoUsers[2], { selectedNoteId: 'note-7', matrix: state.decisions.idea_generation.matrix }],
    ['note_replied', 'idea_generation', 'divergence', demoUsers[2], { noteId: 'note-5', replyId: 'reply-1' }],
    ['note_liked', 'problem_exploration', 'divergence', demoUsers[3], { noteId: 'note-1' }],
    ['ai_interaction_event', 'problem_exploration', 'divergence', { id: 'ai-01', name: 'AI 스캐폴드', role: 'ai_scaffold', team: '1조' }, { requesterId: 'stu-01', key: 'summary' }],
    ['ai_interaction_event', 'idea_generation', 'divergence', { id: 'ai-01', name: 'AI 스캐폴드', role: 'ai_scaffold', team: '1조' }, { requesterId: 'stu-02', key: 'missing' }],
    ['ai_interaction_event', 'solution_design', 'convergence', { id: 'ai-01', name: 'AI 스캐폴드', role: 'ai_scaffold', team: '1조' }, { requesterId: 'stu-03', key: 'check' }],
    ['teacher_feedback', 'solution_design', 'convergence', demoUsers[0], { teamName: '1조', feedback: '핵심 기능을 세 가지로 줄이고, 첫 화면에서 사용자가 가장 먼저 보는 정보를 더 명확히 정리해 보세요.' }],
    ['teacher_feedback', 'action_planning', 'convergence', demoUsers[0], { teamName: '1조', feedback: '테스트 성공 기준을 “좋았다”가 아니라 관찰 가능한 행동으로 적어보면 더 좋겠습니다.' }]
  ].forEach(([eventType, cpsStage, activityMode, user, payload]) => {
    fresh.meta.eventSeq += 1;
    state.events.unshift({
      eventId: `evt-${String(fresh.meta.eventSeq).padStart(4, '0')}`,
      sessionId: 'session-project-1',
      projectId: 'project-1',
      teamId: user.team,
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role === 'teacher' ? 'instructor' : user.role === 'ai_scaffold' ? 'ai_scaffold' : 'learner',
      eventType,
      cpsStage,
      activityMode,
      timestamp: new Date(now - fresh.meta.eventSeq * 70000).toISOString(),
      payload
    });
  });
  state.aiFeed.unshift(
    { by: 'AI', text: '주요 문제 요약: 과제 정보가 여러 플랫폼에 분산되어 확인 부담이 큽니다.\n반복 의견: 마감일 누락, 우선순위 혼란, 플랫폼 피로감.\n추가 질문: 학생이 가장 자주 확인하는 채널은 무엇인가요?', stage: 'problem_exploration', requesterId: 'stu-01', timestamp: new Date(now - 240000).toISOString() },
    { by: 'AI', text: '자기점검 질문: 이 해결안은 실제 수업 환경에서 실행 가능한가요?\n가장 큰 위험 요소는 자동 수집 정확도입니다.\n성공 기준을 테스트 문장으로 바꿔보세요.', stage: 'solution_design', requesterId: 'stu-03', timestamp: new Date(now - 180000).toISOString() }
  );
  state.revisions.unshift(
    { version: 'v0.4', by: '이준호', timestamp: new Date(now - 120000).toISOString(), delta: 23, title: '테스트 기준 정리', note: '1분 안에 가장 급한 과제를 찾는지 확인하는 기준을 추가했습니다.', type: 'edit' },
    { version: 'v0.3', by: '박서연', timestamp: new Date(now - 240000).toISOString(), delta: 18, title: '프로토타입 형태 확정', note: '모바일 우선 웹 대시보드 형태로 산출물을 정리했습니다.', type: 'edit' },
    { version: 'v0.2', by: '김민서', timestamp: new Date(now - 420000).toISOString(), delta: 15, title: '평가행렬 반영', note: '아이디어 3개를 비교하고 공동 체크리스트 결합안을 선택했습니다.', type: 'edit' },
    { version: 'v0.1', by: '김민서', timestamp: new Date(now - 600000).toISOString(), delta: 12, title: '문제 정의 초안', note: '문제 정의와 HMW 문장을 작성했습니다.', type: 'edit' }
  );
  return fresh;
}

function emptyProjectState() {
  return { notes: [], events: [], revisions: [], aiFeed: [], decisions: {} };
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
      if (body.length > 1_000_000) reject(new Error('요청 본문이 너무 큽니다.'));
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('JSON 형식이 올바르지 않습니다.')); }
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

function visibleProjectsFor(user) {
  if (user.role === 'teacher') return store.projects;
  return store.projects.filter((project) =>
    project.visibleToAll || (project.enrolledStudents || []).includes(user.id)
  );
}

function canViewProject(project, user) {
  return user.role === 'teacher' || project.visibleToAll || (project.enrolledStudents || []).includes(user.id);
}

function generateShareCode() {
  let code = '';
  do {
    code = crypto.randomBytes(3).toString('hex').toUpperCase();
  } while (store.projects.some((project) => project.shareCode === code));
  return code;
}

function projectState(projectId) {
  store.states[projectId] ||= emptyProjectState();
  return store.states[projectId];
}

function addEvent(projectId, user, eventType, cpsStage, activityMode, payload = {}, persist = true, actorOverride = null) {
  store.meta.eventSeq += 1;
  const actor = actorOverride || user;
  const event = {
    eventId: `evt-${String(store.meta.eventSeq).padStart(4, '0')}`,
    sessionId: `session-${projectId}`,
    projectId,
    teamId: actor.team || user.team || 'all',
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
  if (persist) saveStore();
  return event;
}

function buildState(projectId, viewer) {
  const project = store.projects.find((item) => item.id === projectId);
  const state = projectState(projectId);
  const users = allUsers();
  const enrolled = project.visibleToAll
    ? users.filter((user) => user.role === 'student').map((user) => user.id)
    : (project.enrolledStudents || []);
  const students = users.filter((user) => user.role === 'student' && enrolled.includes(user.id));
  const now = Date.now();
  const roster = students.map((student) => {
    const session = [...sessions.values()].find((item) => item.user.id === student.id && item.projectId === projectId);
    const online = Boolean(session && now - session.lastSeen < 30000);
    const minutes = session ? Math.max((now - session.loginAt) / 60000, 0.1) : 0;
    const events = state.events.filter((event) => event.actorId === student.id);
    const notes = state.notes.filter((note) => note.actorId === student.id);
    return {
      id: student.id,
      username: student.username,
      name: student.name,
      team: student.team,
      online,
      minutes,
      eventCount: events.length,
      rate: minutes ? events.length / minutes : 0,
      badges: badgesForStudent(student.id, state)
    };
  });
  const teams = [...new Set(students.map((student) => student.team))].map((team) => teamStats(team, state, roster));
  const team = viewer.role === 'student' ? viewer.team : teams[0]?.name || '1조';
  return {
    project,
    notes: state.notes,
    events: state.events,
    revisions: state.revisions,
    aiFeed: state.aiFeed,
    decisions: state.decisions,
    roster,
    teams,
    aiUsage: aiUsage(state, viewer, team),
    stageLogs: stageLogs(state),
    selectedTeam: team
  };
}

function aiUsage(state, viewer, team) {
  const users = viewer.role === 'student'
    ? [viewer.id]
    : allUsers().filter((user) => user.role === 'student' && user.team === team).map((user) => user.id);
  const byStage = Object.fromEntries(stages.map((stage) => [stage, 0]));
  state.events.forEach((event) => {
    if (event.eventType === 'ai_interaction_event' && users.includes(event.payload.requesterId || event.actorId)) {
      byStage[event.cpsStage] = (byStage[event.cpsStage] || 0) + 1;
    }
  });
  return { limit: 5, byStage };
}

function stageLogs(state) {
  return Object.fromEntries(stages.map((stage) => [stage, state.events.filter((event) => event.cpsStage === stage).length]));
}

function teamStats(team, state, roster) {
  const members = roster.filter((student) => student.team === team);
  const events = state.events.filter((event) => event.teamId === team);
  const aiEvents = events.filter((event) => event.eventType === 'ai_interaction_event');
  const counts = members.map((member) => state.events.filter((event) => event.actorId === member.id).length);
  const total = counts.reduce((sum, value) => sum + value, 0);
  const mean = total / Math.max(1, counts.length);
  const variance = counts.reduce((sum, value) => sum + Math.abs(value - mean), 0) / Math.max(1, counts.length);
  const balance = total ? Math.max(0, 1 - variance / Math.max(1, mean + 1)) : 0;
  const temperature = Number((32 + balance * 8 + Math.min(4, total / 10)).toFixed(1));
  return {
    name: team,
    eventCount: events.length,
    active: members.some((member) => member.online),
    currentStage: latestStage(events),
    aiTotal: aiEvents.length,
    aiByStage: Object.fromEntries(stages.map((stage) => [stage, aiEvents.filter((event) => event.cpsStage === stage).length])),
    temperature,
    members
  };
}

function latestStage(events) {
  return events[0]?.cpsStage || 'problem_exploration';
}

function badgesForStudent(studentId, state) {
  const events = state.events.filter((event) => event.actorId === studentId);
  const notes = state.notes.filter((note) => note.actorId === studentId);
  const replyCount = state.notes.flatMap((note) => note.replies || []).filter((reply) => reply.actorId === studentId).length;
  const badges = [];
  if (events.filter((event) => event.eventType === 'idea_created').length >= 3) badges.push('idea');
  if (replyCount + events.filter((event) => event.eventType === 'note_liked').length >= 2) badges.push('empathy');
  if (notes.some((note) => note.text.length > 80) || events.filter((event) => event.eventType === 'convergence_note_created').length >= 1) badges.push('explorer');
  if (events.filter((event) => ['note_replied', 'ai_interaction_event'].includes(event.eventType)).length >= 2) badges.push('connector');
  if (!badges.length && events.length) badges.push('listener');
  return badges.slice(0, 3);
}

function broadcast(projectId) {
  const clients = streams.get(projectId);
  if (!clients) return;
  for (const client of clients) {
    client.res.write('event: project:update\n');
    client.res.write(`data: ${JSON.stringify(buildState(projectId, client.user))}\n\n`);
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
  res.write('event: project:update\n');
  res.write(`data: ${JSON.stringify(buildState(projectId, user))}\n\n`);
  return () => streams.get(projectId)?.delete(client);
}

function aiResponse(stage, notes, key = 'summary') {
  const recent = notes.slice(0, 5).map((note) => note.text).join(' / ') || '아직 입력된 카드가 없습니다.';
  const bank = {
    summary: `자동 요약: 현재 입력은 정보 분산, 우선순위 혼란, 첫 사용 경험의 어려움과 연결됩니다.\n현재 근거: ${recent}`,
    question: '추가 탐색 질문: 두 명 이상의 사용자에게 반복해서 나타나는 불편은 무엇인가요?',
    missing: '빠진 관점: 처음 사용하는 학생, 접근성, 알림 피로, 개인정보 동의 과정을 함께 점검해 보세요.',
    check: [
      '자기점검:',
      '- 이 해결안은 현재 시간과 도구로 실제 제작 가능한가요?',
      '- 사용자가 직접 경험해야 하는 가장 중요한 장면은 무엇인가요?',
      '- 성공 여부를 어떻게 판단할 수 있나요?'
    ].join('\n')
  };
  if (key === 'stage_help') return ['solution_design', 'action_planning'].includes(stage) ? bank.check : bank.summary;
  return bank[key] || bank.summary;
}

async function handleApi(req, res, url) {
  try {
    if (req.method === 'POST' && url.pathname === '/api/login') {
      const body = await readBody(req);
      const user = allUsers().find((item) => item.username === body.username && item.password === body.password);
      if (!user) return sendJson(res, 401, { error: '데모 계정 정보가 올바르지 않습니다.' });
      const token = crypto.randomBytes(24).toString('hex');
      sessions.set(token, { token, user: publicUser(user), loginAt: Date.now(), lastSeen: Date.now(), projectId: null });
      return sendJson(res, 200, { token, user: publicUser(user) });
    }

    if (req.method === 'POST' && url.pathname === '/api/signup') {
      const body = await readBody(req);
      const username = String(body.username || '').trim();
      const password = String(body.password || '').trim();
      const name = String(body.name || username).trim();
      if (!username || !password || !name) return sendJson(res, 400, { error: '이름, 아이디, 비밀번호를 모두 입력하세요.' });
      if (allUsers().some((user) => user.username === username)) return sendJson(res, 409, { error: '이미 사용 중인 아이디입니다.' });
      store.users ||= [];
      const user = {
        id: `stu-custom-${Date.now()}`,
        username,
        password,
        role: 'student',
        name,
        team: '1조'
      };
      store.users.push(user);
      saveStore();
      return sendJson(res, 201, { user: publicUser(user) });
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
      return sendJson(res, 200, { projects: visibleProjectsFor(session.user) });
    }

    if (req.method === 'POST' && url.pathname === '/api/projects/join') {
      if (session.user.role !== 'student') return sendJson(res, 403, { error: '학습자만 프로젝트 코드로 참여할 수 있습니다.' });
      const body = await readBody(req);
      const code = String(body.code || '').trim().toUpperCase();
      const project = store.projects.find((item) => item.shareCode === code);
      if (!project) return sendJson(res, 404, { error: '일치하는 프로젝트 코드가 없습니다.' });
      project.enrolledStudents ||= [];
      if (!project.enrolledStudents.includes(session.user.id)) project.enrolledStudents.push(session.user.id);
      saveStore();
      return sendJson(res, 200, { project });
    }

    if (req.method === 'POST' && url.pathname === '/api/projects') {
      if (session.user.role !== 'teacher') return sendJson(res, 403, { error: '교수자만 사용할 수 있습니다.' });
      const body = await readBody(req);
      const project = {
        id: `project-${Date.now()}`,
        name: String(body.name || '새 프로젝트').trim(),
        topic: String(body.topic || 'PjBL 연구 주제').trim(),
        teams: 4,
        createdBy: 'teacher',
        createdAt: new Date().toISOString(),
        visibleToAll: false,
        enrolledStudents: [],
        shareCode: null
      };
      store.projects.unshift(project);
      store.states[project.id] = emptyProjectState();
      saveStore();
      return sendJson(res, 201, { project });
    }

    const shareRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/share-code$/);
    if (req.method === 'POST' && shareRoute) {
      if (session.user.role !== 'teacher') return sendJson(res, 403, { error: '교수자만 프로젝트 코드를 발급할 수 있습니다.' });
      const project = store.projects.find((item) => item.id === shareRoute[1]);
      if (!project) return sendJson(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
      project.shareCode = generateShareCode();
      saveStore();
      return sendJson(res, 200, { project });
    }

    const noteRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/notes\/([^/]+)(?:\/(replies|like|select))?$/);
    if (noteRoute) return handleNoteRoute(req, res, session, noteRoute);

    const route = url.pathname.match(/^\/api\/projects\/([^/]+)\/(state|stream|notes|events|ai|decision)$/);
    if (!route) return sendJson(res, 404, { error: 'API를 찾을 수 없습니다.' });
    const [, projectId, action] = route;
    const project = store.projects.find((item) => item.id === projectId);
    if (!project) return sendJson(res, 404, { error: '프로젝트를 찾을 수 없습니다.' });
    if (!canViewProject(project, session.user)) return sendJson(res, 403, { error: '프로젝트 코드 입력 후 참여할 수 있습니다.' });
    session.projectId = projectId;

    if (req.method === 'GET' && action === 'state') return sendJson(res, 200, buildState(projectId, session.user));
    if (req.method === 'GET' && action === 'stream') {
      const cleanup = addStream(projectId, session.user, res);
      req.on('close', cleanup);
      return;
    }
    if (req.method === 'POST' && action === 'notes') return handleCreateNote(req, res, session, projectId);
    if (req.method === 'POST' && action === 'events') return handleCreateEvent(req, res, session, projectId);
    if (req.method === 'POST' && action === 'ai') return handleAi(req, res, session, projectId);
    if (req.method === 'POST' && action === 'decision') return handleDecision(req, res, session, projectId);

    return sendJson(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
}

async function handleCreateNote(req, res, session, projectId) {
  if (session.user.role !== 'student') return sendJson(res, 403, { error: '학생만 사용할 수 있습니다.' });
  const body = await readBody(req);
  const text = String(body.text || '').trim();
  if (!text) return sendJson(res, 400, { error: 'Text required.' });
  store.meta.noteSeq += 1;
  const note = {
    id: `note-${store.meta.noteSeq}`,
    stage: body.stage || 'problem_exploration',
    mode: body.mode === 'convergence' ? 'convergence' : 'divergence',
    author: session.user.name,
    actorId: session.user.id,
    teamId: session.user.team,
    text,
    replies: [],
    likes: [],
    selected: false,
    timestamp: new Date().toISOString()
  };
  projectState(projectId).notes.unshift(note);
  addEvent(projectId, session.user, note.mode === 'convergence' ? 'convergence_note_created' : 'idea_created', note.stage, note.mode, { noteId: note.id, text });
  broadcast(projectId);
  return sendJson(res, 201, { note, state: buildState(projectId, session.user) });
}

async function handleCreateEvent(req, res, session, projectId) {
  const body = await readBody(req);
  const event = addEvent(projectId, session.user, body.eventType || 'button_clicked', body.cpsStage || 'problem_exploration', body.activityMode || 'divergence', body.payload || {});
  if (event.eventType === 'artifact_revision_event') {
    store.meta.revisionSeq += 1;
    projectState(projectId).revisions.unshift({
      version: `v0.${store.meta.revisionSeq}`,
      by: session.user.name,
      timestamp: event.timestamp,
      delta: 8 + (store.meta.revisionSeq * 7) % 28,
      title: body.payload?.summary || '산출물 수정',
      note: body.payload?.detail || '팀 논의를 반영해 산출물을 수정했습니다.',
      type: 'edit'
    });
    saveStore();
  }
  if (event.eventType !== 'input_event') broadcast(projectId);
  return sendJson(res, 201, { event, state: buildState(projectId, session.user) });
}

async function handleAi(req, res, session, projectId) {
  if (session.user.role !== 'student') return sendJson(res, 403, { error: '학생만 사용할 수 있습니다.' });
  const body = await readBody(req);
  const stage = body.cpsStage || 'problem_exploration';
  const usage = projectState(projectId).events.filter((event) =>
    event.eventType === 'ai_interaction_event' &&
    event.payload.requesterId === session.user.id &&
    event.cpsStage === stage
  ).length;
  if (usage >= 5) return sendJson(res, 429, { error: '이 단계의 AI 도움 5회를 모두 사용했습니다.' });
  const response = aiResponse(stage, projectState(projectId).notes.filter((note) => note.stage === stage), body.key || 'summary');
  const aiActor = { id: 'ai-01', name: 'AI 스캐폴드', role: 'ai_scaffold', team: session.user.team };
  const event = addEvent(projectId, session.user, 'ai_interaction_event', stage, body.activityMode || 'divergence', {
    requesterId: session.user.id,
    trigger: body.trigger || 'ai_panel',
    key: body.key || 'summary'
  }, true, aiActor);
  projectState(projectId).aiFeed.unshift({ by: 'AI', text: response, stage, requesterId: session.user.id, timestamp: event.timestamp });
  saveStore();
  broadcast(projectId);
  return sendJson(res, 201, { response, state: buildState(projectId, session.user) });
}

async function handleDecision(req, res, session, projectId) {
  const body = await readBody(req);
  const state = projectState(projectId);
  state.decisions[body.stage || 'idea_generation'] = {
    criteria: body.criteria || [],
    matrix: body.matrix || [],
    selectedNoteId: body.selectedNoteId || null,
    updatedBy: session.user.name,
    timestamp: new Date().toISOString()
  };
  addEvent(projectId, session.user, 'decision_matrix_used', body.stage || 'idea_generation', 'convergence', { selectedNoteId: body.selectedNoteId, criteria: body.criteria || [], matrix: body.matrix || [] });
  saveStore();
  broadcast(projectId);
  return sendJson(res, 200, { state: buildState(projectId, session.user) });
}

async function handleNoteRoute(req, res, session, match) {
  const [, projectId, noteId, action] = match;
  const state = projectState(projectId);
  const note = state.notes.find((item) => item.id === noteId);
  if (!note) return sendJson(res, 404, { error: '노트를 찾을 수 없습니다.' });
  if (action === 'replies' && req.method === 'POST') {
    const body = await readBody(req);
    const text = String(body.text || '').trim();
    if (!text) return sendJson(res, 400, { error: '답글 내용을 입력하세요.' });
    const reply = { id: `reply-${Date.now()}`, author: session.user.name, actorId: session.user.id, text, timestamp: new Date().toISOString() };
    note.replies.unshift(reply);
    addEvent(projectId, session.user, 'note_replied', note.stage, note.mode, { noteId, replyId: reply.id, text });
  } else if (action === 'like' && req.method === 'POST') {
    note.likes ||= [];
    if (note.likes.includes(session.user.id)) note.likes = note.likes.filter((id) => id !== session.user.id);
    else note.likes.push(session.user.id);
    addEvent(projectId, session.user, 'note_liked', note.stage, note.mode, { noteId });
  } else if (action === 'select' && req.method === 'POST') {
    state.notes.forEach((item) => { if (item.stage === note.stage) item.selected = false; });
    note.selected = true;
    addEvent(projectId, session.user, 'card_selected', note.stage, note.mode, { noteId });
  } else if (!action && req.method === 'PATCH') {
    if (session.user.role !== 'teacher' && note.actorId !== session.user.id) return sendJson(res, 403, { error: '작성자만 수정할 수 있습니다.' });
    const body = await readBody(req);
    note.text = String(body.text || note.text).trim();
    note.editedAt = new Date().toISOString();
    addEvent(projectId, session.user, 'card_updated', note.stage, note.mode, { noteId, text: note.text });
  } else if (!action && req.method === 'DELETE') {
    if (session.user.role !== 'teacher' && note.actorId !== session.user.id) return sendJson(res, 403, { error: '작성자만 삭제할 수 있습니다.' });
    state.notes = state.notes.filter((item) => item.id !== noteId);
    addEvent(projectId, session.user, 'card_deleted', note.stage, note.mode, { noteId });
  } else {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }
  saveStore();
  broadcast(projectId);
  return sendJson(res, 200, { state: buildState(projectId, session.user) });
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
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
    res.writeHead(200, { 'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  return serveStatic(req, res, url);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`PjBL V2 server running at http://localhost:${PORT}`);
});
