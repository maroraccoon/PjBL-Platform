document.addEventListener('DOMContentLoaded', () => {
  const stages = [
    { id: 'problem_exploration', label: '문제 탐색' },
    { id: 'idea_generation', label: '아이디어 생성' },
    { id: 'solution_design', label: '해결안 구안' },
    { id: 'action_planning', label: '실행 계획 수립' }
  ];

  const state = {
    role: null,
    token: null,
    user: null,
    projects: [],
    currentProject: null,
    projectState: null,
    currentStage: 0,
    activePhase: 'divergence',
    canvasExpanded: false,
    selectedTeacherTeam: '1조',
    stream: null,
    heartbeat: null,
    inputLogTimer: null,
    charts: {},
    rosterSort: 'name',
    teacherDetailStage: null
  };

  const $ = (id) => document.getElementById(id);
  const stageName = (id) => stages.find((stage) => stage.id === id)?.label || id;
  const eventName = (type) => ({
    idea_created: '카드 생성',
    convergence_note_created: '수렴 카드 생성',
    card_updated: '카드 수정',
    card_deleted: '카드 삭제',
    card_selected: '카드 선택',
    note_replied: '답글',
    note_liked: '좋아요',
    ai_interaction_event: 'AI 요청',
    decision_matrix_used: '평가행렬 사용',
    artifact_revision_event: '버전 생성',
    stage_moved: '단계 이동',
    button_clicked: '버튼 클릭',
    input_event: '입력',
    phase_switch: '공간 전환'
  }[type] || type);

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
    $(id)?.classList.add('active');
    iconRefresh();
  }

  function iconRefresh() {
    if (window.lucide) lucide.createIcons();
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
    return data;
  }

  function openLogin() {
    state.role = null;
    $('loginUsername').value = '';
    $('loginPassword').value = '';
    $('loginError').classList.add('hidden');
    showScreen('loginScreen');
  }

  async function login() {
    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({
          username: $('loginUsername').value.trim(),
          password: $('loginPassword').value
        })
      });
      state.token = data.token;
      state.user = data.user;
      await loadProjects();
      renderProjectScreen();
      showScreen('projectScreen');
    } catch (error) {
      $('loginError').textContent = error.message;
      $('loginError').classList.remove('hidden');
    }
  }

  async function signup() {
    const message = $('signupMessage');
    try {
      const data = await api('/api/signup', {
        method: 'POST',
        body: JSON.stringify({
          name: $('signupName').value.trim(),
          username: $('signupUsername').value.trim(),
          password: $('signupPassword').value,
          role: $('signupRole').value,
          teacherCode: $('signupTeacherCode').value.trim()
        })
      });
      message.textContent = `${data.user.name} 계정이 생성되었습니다. 로그인 화면에서 접속하세요.`;
      message.className = 'mt-4 rounded-2xl bg-teal/10 p-3 text-sm font-bold text-teal';
      message.classList.remove('hidden');
      $('signupName').value = '';
      $('signupUsername').value = '';
      $('signupPassword').value = '';
      $('signupTeacherCode').value = '';
      $('signupRole').value = 'student';
      toggleSignupTeacherCode();
    } catch (error) {
      message.textContent = error.message;
      message.className = 'mt-4 rounded-2xl bg-rose/10 p-3 text-sm font-bold text-rose';
      message.classList.remove('hidden');
    }
  }

  async function loadProjects() {
    const data = await api('/api/projects');
    state.projects = data.projects;
  }

  function renderProjectScreen() {
    $('projectRoleLabel').textContent = state.user.role === 'teacher' ? '교수자 공간' : '학생 공간';
    $('projectTitle').textContent = state.user.role === 'teacher' ? '관리할 프로젝트를 선택하세요' : '참여할 프로젝트를 선택하세요';
    $('projectHelp').textContent = 'SSE 기반 부드러운 실시간 방식으로 같은 프로젝트 이벤트 로그를 공유합니다.';
    $('createProjectBtn').classList.toggle('hidden', state.user.role !== 'teacher');
    $('joinProjectPanel').classList.toggle('hidden', state.user.role !== 'student');
    $('projectList').innerHTML = state.projects.map((project) => `
      <article class="project-card cursor-pointer rounded-[22px] border border-white/80 bg-white/82 p-5 text-left shadow-soft transition hover:-translate-y-1" data-project="${project.id}" role="button" tabindex="0">
        <div class="flex items-center justify-between">
          <span class="rounded-full bg-yellow-200 px-3 py-1 text-xs font-bold text-ink">${project.teams || 4}개 팀</span>
          <i data-lucide="arrow-up-right" class="h-5 w-5 text-muted"></i>
        </div>
        <h2 class="mt-5 text-xl font-semibold">${escapeHtml(project.name)}</h2>
        <p class="mt-2 text-sm leading-6 text-muted">${escapeHtml(project.topic)}</p>
        ${state.user.role === 'teacher' ? `<div class="mt-4 rounded-2xl bg-paper p-3 text-xs font-bold text-muted">공유 코드: <span class="text-ink">${escapeHtml(project.shareCode || '미발급')}</span></div><span class="share-code-btn mt-3 inline-flex rounded-xl bg-ink px-3 py-2 text-xs font-bold text-white" data-share-project="${project.id}">프로젝트 코드 공유하기</span>` : ''}
      </article>
    `).join('');
    document.querySelectorAll('.project-card').forEach((card) => {
      card.addEventListener('click', async (event) => {
        if (event.target.closest('[data-share-project]')) return;
        state.currentProject = state.projects.find((project) => project.id === card.dataset.project);
        await enterApp();
      });
    });
    iconRefresh();
  }

  async function createProject() {
    const data = await api('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: $('newProjectName').value.trim() || '새 PjBL 프로젝트',
        topic: $('newProjectTopic').value.trim() || '연구 시연용 CPS 주제'
      })
    });
    await loadProjects();
    state.currentProject = data.project;
    await enterApp();
  }

  async function enterApp() {
    state.currentStage = 0;
    state.activePhase = 'divergence';
    await loadState();
    applyRoleView();
    openStream();
    startHeartbeat();
    showScreen('appScreen');
    renderAll();
  }

  async function loadState() {
    state.projectState = await api(`/api/projects/${state.currentProject.id}/state`);
    state.currentProject = state.projectState.project;
  }

  function openStream() {
    if (state.stream) state.stream.close();
    state.stream = new EventSource(`/api/projects/${state.currentProject.id}/stream?token=${encodeURIComponent(state.token)}`);
    state.stream.addEventListener('project:update', (event) => {
      state.projectState = JSON.parse(event.data);
      state.currentProject = state.projectState.project;
      renderAll();
    });
  }

  function startHeartbeat() {
    if (state.heartbeat) clearInterval(state.heartbeat);
    state.heartbeat = setInterval(() => {
      api('/api/heartbeat', { method: 'POST', body: JSON.stringify({ projectId: state.currentProject.id }) }).catch(() => {});
    }, 10000);
  }

  function applyRoleView() {
    const isStudent = state.user.role === 'student';
    $('appTitle').textContent = state.currentProject.name;
    $('appSubtitle').textContent = '';
    $('headerBadges').innerHTML = isStudent
      ? `<span class="rounded-full bg-white px-3 py-1 shadow-insetLine">${state.user.name}</span><span class="rounded-full bg-white px-3 py-1 shadow-insetLine">${state.user.team}</span>`
      : `<span class="rounded-full bg-white px-3 py-1 shadow-insetLine">프로젝트 관리</span><span class="rounded-full bg-white px-3 py-1 shadow-insetLine">${state.currentProject.shareCode ? `공유 코드 ${escapeHtml(state.currentProject.shareCode)}` : '공유 코드 미발급'}</span>`;
    $('teacherMetrics').classList.toggle('role-hidden', isStudent);
    document.querySelectorAll('[data-view]').forEach((section) => section.classList.toggle('role-hidden', section.dataset.view !== state.user.role));
  }

  function renderAll() {
    if (!state.projectState) return;
    renderWorkspaceShell();
    renderStepBar();
    renderStudentBoard();
    renderAiPanel();
    renderTeamAwareness();
    renderArtifactTimeline();
    renderTeacherDashboard();
    renderEvents();
    iconRefresh();
  }

  function renderWorkspaceShell() {
    const grid = $('workspaceGrid');
    if (!grid) return;
    grid.style.gridTemplateColumns = state.canvasExpanded ? 'minmax(0, 1fr)' : '260px minmax(0, 1fr) 360px';
    grid.style.minHeight = state.canvasExpanded ? '100vh' : '780px';
    grid.style.width = state.canvasExpanded ? '100vw' : '';
    $('leftStagePanel').classList.toggle('hidden', state.canvasExpanded);
    $('rightSupportPanel').classList.toggle('hidden', state.canvasExpanded);
    $('workspaceTopBar').classList.toggle('hidden', state.canvasExpanded);
    $('workspace').classList.toggle('fixed', state.canvasExpanded);
    $('workspace').classList.toggle('inset-0', state.canvasExpanded);
    $('workspace').classList.toggle('z-50', state.canvasExpanded);
    $('workspace').classList.toggle('rounded-none', state.canvasExpanded);
    $('workspace').classList.toggle('h-screen', state.canvasExpanded);
    $('workspace').classList.toggle('w-screen', state.canvasExpanded);
    $('workspace').classList.toggle('overflow-hidden', state.canvasExpanded);
    $('canvasArea').classList.toggle('p-8', state.canvasExpanded);
    $('canvasArea').style.height = state.canvasExpanded ? '100vh' : '';
    $('canvasArea').style.width = state.canvasExpanded ? '100vw' : '';
  }

  function renderStepBar() {
    $('stageTabs').innerHTML = stages.map((stage, index) => `
      <button class="stage-tab flex min-w-[160px] flex-1 items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${index === state.currentStage ? 'bg-ink text-white shadow-soft' : 'bg-white/78 text-muted shadow-insetLine hover:bg-white'}" data-stage="${index}">
        <span class="grid h-8 w-8 place-items-center rounded-full ${index === state.currentStage ? 'bg-yellow-200 text-ink' : 'bg-paper text-ink'}">${index + 1}</span>
        <span><span class="block text-[11px] font-bold uppercase opacity-70">${index + 1}단계</span><strong>${stage.label}</strong></span>
      </button>
    `).join('');
    document.querySelectorAll('.stage-tab').forEach((button) => {
      button.addEventListener('click', async () => {
        const next = Number(button.dataset.stage);
        if (next === state.currentStage) return;
        await logEvent('stage_moved', { from: stages[state.currentStage].id, to: stages[next].id }, 'convergence', stages[next].id);
        state.currentStage = next;
        state.activePhase = 'divergence';
        renderAll();
      });
    });
    $('studentStageTitle').textContent = stages[state.currentStage].label;
    $('stageKicker').textContent = `${String(state.currentStage + 1).padStart(2, '0')}단계`;
    $('phaseDivergeBtn').className = phaseClass('divergence', 'bg-yellow-300 text-ink');
    $('phaseConvergeBtn').className = phaseClass('convergence', 'bg-teal text-white');
  }

  function phaseClass(phase, activeClass) {
    return `phase-btn rounded-xl px-4 py-2 text-sm font-bold ${state.activePhase === phase ? activeClass : 'text-muted hover:bg-white'}`;
  }

  function renderStudentBoard() {
    const stage = stages[state.currentStage].id;
    const notes = state.projectState.notes || [];
    const stageNotes = notes.filter((note) => note.stage === stage);
    const divNotes = stageNotes.filter((note) => note.mode === 'divergence');
    const convNotes = stageNotes.filter((note) => note.mode === 'convergence');
    $('studentStageGuide').innerHTML = guideFor(stage, state.activePhase);
    $('promptCards').innerHTML = state.activePhase === 'divergence'
      ? (['solution_design', 'action_planning'].includes(stage) ? checkCarousel(stage, 'divergence') : promptCards(stage, 'divergence'))
      : '';
    $('divergencePanel').classList.toggle('hidden', state.activePhase !== 'divergence');
    $('convergencePanel').classList.toggle('hidden', state.activePhase !== 'convergence');
    $('convergenceInputRow')?.classList.toggle('hidden', ['problem_exploration', 'idea_generation'].includes(stage) && state.activePhase === 'convergence');
    $('divergenceCards').innerHTML = divNotes.map(renderNoteCard).join('') || emptyCard('아직 발산 카드가 없습니다.');
    $('convergenceCards').innerHTML = convergenceContent(stage, convNotes, divNotes);
  }

  function guideFor(stage, phase) {
    const guides = {
      problem_exploration: {
        divergence: '브레인스토밍으로 관찰, 불편, 질문을 넓게 모읍니다.',
        convergence: '<strong>문제 정의 구조</strong><br>[사용자]는 _______ 이다.<br>왜냐하면 _______ 때문이다.'
      },
      idea_generation: {
        divergence: '가능한 해결 아이디어를 많이 작성합니다.',
        convergence: '평가행렬법으로 실현 가능성, 영향력, 차별성을 1~5점으로 비교합니다.'
      },
      solution_design: {
        divergence: '선택된 아이디어를 구현할 여러 형태를 탐색합니다.',
        convergence: '실제 제작 가능한 형태와 핵심 기능을 정리합니다.'
      },
      action_planning: {
        divergence: '프로토타입 테스트에서 발생할 수 있는 상황을 상상합니다.',
        convergence: '이번 테스트에서 반드시 확인할 한 가지와 성공 기준을 정합니다.'
      }
    };
    return guides[stage][phase];
  }

  function convergenceContent(stage, convNotes, divNotes) {
    if (stage === 'problem_exploration') return problemDefinitionPanel(convNotes);
    if (stage === 'idea_generation') return decisionMatrixPanel(divNotes);
    return [
      teacherFeedbackPanel(stage),
      convNotes.map(renderNoteCard).join('') || emptyCard('아직 수렴 결과가 없습니다.')
    ].join('');
  }

  function checkCarousel(stage, phase = 'convergence') {
    if (!['solution_design', 'action_planning'].includes(stage)) return '';
    const questions = {
      solution_design: [
        ...(phase === 'divergence'
          ? [
            '선택된 아이디어를 구현하는 방법이 여러 가지라면 어떤 형태들이 가능할까요?',
            '영상, 포스터, 앱, 모형, 서비스 절차 중 무엇이 가능할까요?',
            '프로토타입을 만든다면 어떤 재료나 도구를 활용할 수 있을까요?',
            '사용자가 직접 경험해야 할 가장 중요한 순간은 어떤 장면인가요?'
          ]
          : [
            '이 해결안은 현재 가진 시간과 도구로 실제 제작 가능한가요?',
            '사용자가 실제로 경험해야 하는 가장 중요한 장면은 무엇인가요?',
            '반드시 확인해야 할 핵심 기능은 무엇인가요?',
            '가장 큰 위험 요소는 무엇이며 어떻게 줄일 수 있나요?'
          ])
      ],
      action_planning: [
        ...(phase === 'divergence'
          ? [
            '우리 프로토타입을 사용할 사람이 겪을 수 있는 상황은 무엇인가요?',
            '테스트를 통해 확인하고 싶은 것은 무엇인가요?',
            '사용자가 예상과 다르게 반응한다면 어떤 장면일까요?'
          ]
          : [
            '이번 테스트에서 반드시 확인해야 할 한 가지는 무엇인가요?',
            '그것을 확인하기 위한 구체적인 질문은 무엇인가요?',
            '성공했다고 판단할 수 있는 기준은 관찰 가능한가요?',
            '사용자가 예상과 다르게 반응하면 무엇을 기록해야 하나요?'
          ])
      ]
    };
    return `
      <section class="mb-4 rounded-[22px] border border-indigo-300 bg-indigo-50 p-4 shadow-soft">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-base font-semibold">점검해보기</h3>
          <div class="flex gap-2">
            <button class="check-prev rounded-full bg-white px-3 py-1 text-sm font-bold shadow-insetLine" type="button">&lt;</button>
            <button class="check-next rounded-full bg-white px-3 py-1 text-sm font-bold shadow-insetLine" type="button">&gt;</button>
          </div>
        </div>
        <div class="check-carousel" data-check-stage="${stage}" data-check-index="0">
          ${questions[stage].map((question, index) => `<article class="check-item ${index ? 'hidden' : ''} rounded-2xl bg-white p-4 text-sm font-semibold leading-6 text-slate-800 shadow-insetLine" data-check-item="${index}">${question}</article>`).join('')}
        </div>
      </section>
    `;
  }

  function teacherFeedbackPanel(stage) {
    if (!['solution_design', 'action_planning'].includes(stage)) return '';
    const feedback = (state.projectState.events || [])
      .filter((event) => event.eventType === 'teacher_feedback' && event.cpsStage === stage && (!event.payload.teamName || event.payload.teamName === state.user.team))
      .slice(0, 3);
    return `
      <section class="mb-4 rounded-[22px] border border-rose-300 bg-white p-4 shadow-soft">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs font-bold uppercase tracking-[.16em] text-rose">교수자 피드백</p>
            <h3 class="mt-1 text-base font-semibold">교수자 피드백이 입력되면 여기에 표시됩니다.</h3>
          </div>
          <i data-lucide="message-square-quote" class="h-5 w-5 text-rose"></i>
        </div>
        <div class="mt-3 space-y-2">
          ${feedback.length ? feedback.map((item) => `<article class="rounded-2xl border border-rose-100 bg-white p-4 text-sm leading-6 shadow-soft"><strong class="text-ink">${escapeHtml(item.actorName || '교수자')}</strong><p class="mt-1 text-slate-700">${escapeHtml(item.payload.feedback || '')}</p></article>`).join('') : '<article class="rounded-2xl border border-rose-100 bg-white p-4 text-sm text-slate-700 shadow-soft">아직 입력된 교수자 피드백이 없습니다. 피드백이 도착하면 팀은 이 영역에서 확인할 수 있습니다.</article>'}
        </div>
      </section>
    `;
  }

  function promptCards(stage, phase) {
    const prompts = {
      solution_design: {
        divergence: ['선택된 아이디어를 구현하는 방법이 여러 가지라면 어떤 형태들이 가능할까요?', '영상, 포스터, 앱, 모형, 서비스 절차 중 무엇이 가능할까요?', '프로토타입을 만든다면 어떤 재료나 도구를 활용할 수 있을까요?', '사용자가 직접 경험해야 할 가장 중요한 순간은 어떤 장면인가요?'],
        convergence: ['실제 제작 가능한 형태는 무엇인가요?', '선택한 이유는 무엇인가요?', '반드시 확인해야 할 핵심 기능은 무엇인가요?', '누가 언제까지 무엇을 준비해야 하나요?']
      },
      action_planning: {
        divergence: ['우리 프로토타입을 사용할 사람이 겪을 수 있는 상황은?', '테스트를 통해 확인하고 싶은 것은?', '사용자가 예상과 다르게 반응한다면 어떤 장면일까?'],
        convergence: ['이번 테스트에서 반드시 확인해야 할 한 가지는?', '그것을 확인하기 위한 구체적인 질문은?', '성공했다고 판단할 수 있는 기준은?']
      }
    };
    return `<div class="mb-4 grid gap-3 md:grid-cols-2">${(prompts[stage]?.[phase] || []).map((text) => `<button class="rounded-2xl bg-white/88 p-4 text-left text-sm font-semibold leading-6 shadow-insetLine" data-fill-prompt="${escapeHtml(text)}">${escapeHtml(text)}</button>`).join('')}</div>`;
  }

  function problemDefinitionPanel(convNotes) {
    return `
      <div class="rounded-[22px] bg-white p-5 shadow-soft">
        <p class="text-xs font-bold uppercase tracking-[.16em] text-muted">문제 정의</p>
        <div class="mt-4 grid gap-3 md:grid-cols-2">
          <input id="problemUserInput" class="rounded-xl border border-line px-3 py-3 text-sm" placeholder="[사용자] 예: 대학생" />
          <input id="problemPainInput" class="rounded-xl border border-line px-3 py-3 text-sm" placeholder="어려움 예: 과제 관리에 어려움을 겪는다" />
          <input id="problemReasonInput" class="rounded-xl border border-line px-3 py-3 text-sm md:col-span-2" placeholder="왜냐하면 예: 여러 플랫폼에 일정이 흩어져 있기 때문이다" />
          <textarea id="problemHmwInput" class="min-h-20 resize-none rounded-xl border border-line px-3 py-3 text-sm md:col-span-2" placeholder="HMW 문장으로 정리하기 예: 어떻게 하면 대학생이 여러 플랫폼을 오가지 않고 오늘 해야 할 과제를 바로 파악할 수 있을까?"></textarea>
        </div>
        <button id="saveProblemDefinition" class="mt-3 rounded-xl bg-teal px-4 py-2 text-sm font-bold text-white">문제 정의 저장</button>
      </div>
      <div class="mt-4 grid gap-4">${convNotes.map(renderNoteCard).join('')}</div>
    `;
  }

  function decisionMatrixPanel(divNotes) {
    const rows = divNotes;
    if (!rows.length) return emptyCard('먼저 발산 공간에서 아이디어 카드를 작성하세요.');
    const saved = state.projectState.decisions?.idea_generation || {};
    const criteria = saved.criteria?.length ? saved.criteria : ['실현 가능성', '영향력', '차별성', '명확성'];
    return `
      <div class="rounded-[22px] bg-white/90 p-5 shadow-insetLine">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs font-bold uppercase tracking-[.16em] text-muted">평가행렬 워크시트</p>
            <h3 class="mt-1 text-lg font-semibold">아이디어 비교 평가</h3>
          </div>
          <button id="saveDecisionMatrix" class="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white">평가 저장</button>
        </div>
        <div class="mt-4 overflow-auto rounded-xl border border-slate-300">
          <table class="decision-worksheet w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr class="bg-sky-100">
                <th colspan="7" class="border border-white px-3 py-2 text-left">주제 : ${escapeHtml(state.currentProject.topic || state.currentProject.name)}</th>
              </tr>
              <tr class="bg-sky-100 text-center">
                <th rowspan="2" class="w-12 border border-white px-2 py-3"></th>
                <th rowspan="2" class="w-[280px] border border-white px-3 py-3">아이디어</th>
                <th colspan="4" class="border border-white px-3 py-2">평가 준거</th>
                <th rowspan="2" class="w-20 border border-white px-3 py-3">총계</th>
              </tr>
              <tr class="bg-sky-100 text-center">
                ${criteria.map((name, index) => `<th class="border border-white px-3 py-2"><input class="criteria-input w-full rounded bg-white/90 px-2 py-1 text-center font-bold" value="${escapeHtml(name)}" data-criteria-index="${index}" title="평가 준거 ${index + 1}" /></th>`).join('')}
              </tr>
            </thead>
            <tbody>${rows.map((note, rowIndex) => matrixRow(note, rowIndex)).join('')}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function matrixRow(note, rowIndex) {
    const saved = state.projectState.decisions?.idea_generation?.matrix?.find((row) => row.noteId === note.id);
    const scores = saved?.scores || [];
    return `<tr class="bg-slate-50 text-center" data-matrix-note="${note.id}">
      <td class="border border-white bg-sky-50 px-2 py-3 font-semibold">${rowIndex + 1}</td>
      <td class="border border-white bg-sky-50 px-3 py-3 text-left font-semibold">${escapeHtml(note.text)}</td>
      ${['A', 'B', 'C', 'D'].map((key, index) => `<td class="border border-white bg-slate-100 px-2 py-2"><input class="matrix-score w-16 rounded-lg border border-line bg-white px-2 py-1 text-center" data-score="${key}" type="number" min="0" max="5" step="1" value="${scores[index] || ''}" placeholder="0~5" /></td>`).join('')}
      <td class="matrix-total border border-white bg-sky-50 px-3 py-3 font-bold">${scores.reduce((sum, value) => sum + Number(value || 0), 0)}</td>
    </tr>`;
  }

  function renderNoteCard(note) {
    const canEdit = state.user.role === 'teacher' || note.actorId === state.user.id;
    const tone = noteTone(note);
    return `
      <article class="note-card rounded-[20px] border ${tone.border} ${tone.bg} p-4 shadow-soft" data-note-id="${note.id}">
        <p class="min-h-14 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">${escapeHtml(note.text)}</p>
        <div class="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-muted">
          <span class="inline-flex items-center gap-2"><span class="grid h-7 w-7 place-items-center rounded-full bg-paper font-bold text-ink">${escapeHtml(note.author).slice(0, 1)}</span>${escapeHtml(note.author)}</span>
          <span>${formatTime(note.timestamp)}${note.editedAt ? ' · 수정됨' : ''}</span>
        </div>
        <div class="mt-3 flex flex-wrap gap-2 text-xs font-bold">
          <button data-note-action="like" data-note-id="${note.id}" class="rounded-full bg-rose/10 px-3 py-1 text-rose">♥ ${note.likes?.length || 0}</button>
          <button data-note-action="reply" data-note-id="${note.id}" class="rounded-full bg-white px-3 py-1 text-ocean shadow-insetLine">답글</button>
          ${canEdit ? `<button data-note-action="edit" data-note-id="${note.id}" class="rounded-full bg-white px-3 py-1 text-muted shadow-insetLine">수정</button><button data-note-action="delete" data-note-id="${note.id}" class="rounded-full bg-white px-3 py-1 text-rose shadow-insetLine">삭제</button>` : ''}
        </div>
        ${(note.replies || []).length ? `<div class="mt-3 space-y-2">${note.replies.map((reply) => `<div class="rounded-xl bg-paper p-3 text-xs leading-5"><strong>${escapeHtml(reply.author)}</strong> ${escapeHtml(reply.text)}</div>`).join('')}</div>` : ''}
      </article>
    `;
  }

  function noteTone(note) {
    const map = {
      problem_exploration: note.mode === 'divergence'
        ? { bg: 'bg-sky-50', border: 'border-sky-200' }
        : { bg: 'bg-blue-50', border: 'border-blue-300' },
      idea_generation: note.mode === 'divergence'
        ? { bg: 'bg-yellow-50', border: 'border-yellow-300' }
        : { bg: 'bg-amber-50', border: 'border-amber-300' },
      solution_design: note.mode === 'divergence'
        ? { bg: 'bg-emerald-100', border: 'border-emerald-400' }
        : { bg: 'bg-teal-200', border: 'border-teal-500' },
      action_planning: note.mode === 'divergence'
        ? { bg: 'bg-violet-200', border: 'border-violet-500' }
        : { bg: 'bg-purple-100', border: 'border-purple-400' }
    };
    return map[note.stage] || { bg: 'bg-white', border: 'border-line' };
  }

  function renderAiPanel() {
    const usage = state.projectState.aiUsage?.byStage || {};
    $('aiUsageBars').innerHTML = stages.map((stage) => {
      const used = Math.min(5, usage[stage.id] || 0);
      return `<div class="rounded-2xl bg-paper p-3">
        <div class="flex justify-between text-xs font-bold"><span>${stage.label}</span><span>${used}/5</span></div>
        <div class="mt-2 flex gap-1">${Array.from({ length: 5 }, (_, i) => `<span class="h-2 flex-1 rounded-full ${i < used ? (used >= 5 ? 'bg-rose' : 'bg-violet') : 'bg-slate-200'}"></span>`).join('')}</div>
      </div>`;
    }).join('');
    $('aiLockBadge').innerHTML = '<span class="inline-flex items-center gap-1"><i data-lucide="sparkles" class="h-3.5 w-3.5"></i>활성화</span>';
    const currentStage = stages[state.currentStage];
    const usedCurrent = usage[currentStage.id] || 0;
    $('aiGate').textContent = usedCurrent >= 5
      ? `${currentStage.label}에서 AI 도움 기회를 모두 활용하였습니다.`
      : 'AI 도움은 단계별 사용자당 5회까지 사용할 수 있습니다.';
    $('aiGate').className = `mt-4 rounded-2xl border border-dashed p-4 text-sm leading-6 ${usedCurrent >= 5 ? 'border-rose/40 bg-rose/10 text-rose' : 'border-violet/30 bg-purple-50 text-violet'}`;
    const latest = (state.projectState.aiFeed || [])[0];
    $('aiFeed').innerHTML = latest
      ? `<article class="rounded-2xl bg-white p-4 text-sm leading-6 shadow-soft"><strong class="text-violet">AI</strong><p class="mt-2 whitespace-pre-wrap text-muted">${escapeHtml(compactAiText(latest.text))}</p></article>`
      : '<article class="rounded-2xl bg-white p-4 text-sm leading-6 text-muted shadow-insetLine">요약, 질문, 빠진 관점, 자기점검 중 하나를 선택하면 이곳에 표시됩니다.</article>';
  }

  function compactAiText(text) {
    const lines = String(text || '').split('\n');
    const stopAt = lines.findIndex((line, index) =>
      index > 0 && /^(반복 의견|빠진 관점|추가 탐색 질문|자기점검)/.test(line)
    );
    return (stopAt > 0 ? lines.slice(0, stopAt) : lines).join('\n');
  }

  function renderTeamAwareness() {
    const team = state.projectState.teams?.find((item) => item.name === state.user.team) || state.projectState.teams?.[0];
    $('studentAwarenessList').innerHTML = (team?.members || []).map((member) => `<div class="flex items-center justify-between rounded-xl bg-paper p-3 text-sm"><span>${escapeHtml(member.name)} ${badges(member.badges)}</span><strong>${member.eventCount}</strong></div>`).join('');
    $('studentBalanceRatio').textContent = `${team?.temperature || 32}°C`;
    $('studentBalanceBar').innerHTML = `<div class="bg-teal" style="width:${Math.min(100, ((team?.temperature || 32) - 30) * 10)}%"></div>`;
  }

  function renderArtifactTimeline() {
    const revisions = state.projectState.revisions || [];
    $('artifactTimeline').innerHTML = revisions.slice(0, 6).map((revision) => `
      <button class="rounded-2xl bg-white p-3 text-left shadow-insetLine" data-version="${escapeHtml(revision.version)}" data-version-note="${escapeHtml(revision.note)}">
        <div class="flex items-center gap-3">
          <span class="grid h-8 w-8 place-items-center rounded-full bg-ink text-white"><i data-lucide="git-commit-horizontal" class="h-4 w-4"></i></span>
          <span><strong class="block text-sm">${escapeHtml(revision.version)}</strong><span class="text-[11px] text-muted">${escapeHtml(revision.by)} · Δ${revision.delta}</span></span>
        </div>
      </button>
    `).join('') || emptyCard('아직 산출물 수정 기록이 없습니다.');
  }

  function renderTeacherDashboard() {
    if (state.user.role !== 'teacher') return;
    const teams = state.projectState.teams || [];
    const active = teams.filter((team) => team.active).length;
    const aiTotal = teams.reduce((sum, team) => sum + team.aiTotal, 0);
    const avgTemp = teams.length ? (teams.reduce((sum, team) => sum + team.temperature, 0) / teams.length).toFixed(1) : '32.0';
    $('metricEvents').textContent = teams.length;
    $('metricUnlock').textContent = active;
    $('metricRatio').textContent = `${avgTemp}°C`;
    $('teacherSummary').innerHTML = summaryCard('총 팀 수', teams.length, 'users') + summaryCard('현재 활성 팀', active, 'radio') + summaryCard('전체 AI 사용량', aiTotal, 'sparkles') + summaryCard('평균 협동 온도', `${avgTemp}°C`, 'thermometer');
    $('teamCards').innerHTML = teams.map((team) => `
      <article class="rounded-[24px] bg-white/88 p-5 shadow-insetLine">
        <div class="flex items-start justify-between"><h3 class="text-xl font-semibold">${team.name}</h3><span class="rounded-full bg-yellow-200 px-3 py-1 text-xs font-bold">${team.temperature}°C</span></div>
        <p class="mt-3 text-sm text-muted">현재 단계: <strong class="text-ink">${stageName(team.currentStage)}</strong></p>
        <p class="mt-1 text-sm text-muted">AI 사용량: <strong class="text-ink">${team.aiTotal}/5</strong></p>
        <button class="mt-4 rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white" data-team-view="${team.name}">팀 보기</button>
      </article>
    `).join('');
    renderTeacherDetail();
    renderAiVisualization();
    renderRoster();
    renderCharts();
  }

  function summaryCard(label, value, icon) {
    return `<article class="rounded-[24px] bg-white/88 p-5 shadow-insetLine"><div class="flex items-center justify-between"><p class="text-sm text-muted">${label}</p><i data-lucide="${icon}" class="h-5 w-5 text-muted"></i></div><p class="mt-3 text-3xl font-semibold">${value}</p></article>`;
  }

  function renderTeacherDetail() {
    const team = state.projectState.teams?.find((item) => item.name === state.selectedTeacherTeam) || state.projectState.teams?.[0];
    const detailStage = state.teacherDetailStage || team?.currentStage || 'problem_exploration';
    const notes = (state.projectState.notes || []).filter((note) => note.teamId === team?.name && note.stage === detailStage);
    const ai = (state.projectState.aiFeed || []).slice(0, 4);
    const events = (state.projectState.events || []).filter((event) => event.teamId === team?.name && event.cpsStage === detailStage).slice(0, 5);
    $('teacherTeamDetail').innerHTML = team ? `
      <div>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div><h3 class="text-xl font-semibold">${team.name} 학습자 화면 보기</h3><p class="mt-1 text-sm text-muted">현재 단계: ${stageName(team.currentStage)}</p></div>
          <span class="rounded-full bg-yellow-200 px-3 py-1 text-xs font-bold text-ink">협동 온도 ${team.temperature}°C</span>
        </div>
        <div class="board-grid mt-4 rounded-[26px] border border-line bg-white p-4">
          <div class="flex flex-wrap gap-2">${stages.map((stage) => `<button class="rounded-xl px-3 py-2 text-xs font-bold ${stage.id === detailStage ? 'bg-ink text-white' : 'bg-paper text-muted'}" data-teacher-stage="${stage.id}">${stage.label}</button>`).join('')}</div>
          <div class="mt-4 grid gap-4 lg:grid-cols-2">
            <section class="rounded-[22px] border border-yellow-300 bg-yellow-50 p-4">
              <h4 class="font-semibold">발산 공간</h4>
              <div class="mt-3 grid gap-3">${notes.filter((n) => n.mode === 'divergence').slice(0, 6).map(renderTeacherNoteCard).join('') || '<p class="text-sm text-muted">작성된 카드가 없습니다.</p>'}</div>
            </section>
            <section class="rounded-[22px] border border-teal-300 bg-teal-50 p-4">
              <h4 class="font-semibold">수렴 공간</h4>
              <div class="mt-3 grid gap-3">${notes.filter((n) => n.mode === 'convergence').slice(0, 6).map(renderTeacherNoteCard).join('') || '<p class="text-sm text-muted">정리된 카드가 없습니다.</p>'}</div>
            </section>
          </div>
          <div class="mt-4 grid gap-3 md:grid-cols-2">
            <div class="rounded-2xl bg-white p-4 shadow-insetLine"><strong>AI 도움 사용 내역</strong><p class="mt-2 text-sm text-muted">${ai.map((a) => `${stageName(a.stage)} · ${formatTime(a.timestamp)}`).join('<br>') || '없음'}</p></div>
            <div class="rounded-2xl bg-white p-4 shadow-insetLine"><strong>최근 이벤트 로그</strong><p class="mt-2 text-sm text-muted">${events.map((e) => `${eventName(e.eventType)} · ${formatTime(e.timestamp)}`).join('<br>') || '없음'}</p></div>
          </div>
        </div>
        <div class="mt-4 rounded-2xl bg-ink p-4 text-white">
          <strong>교수자 피드백 입력</strong>
          <div class="mt-3 grid gap-2 md:grid-cols-[160px_1fr_auto]">
            <select id="teacherFeedbackStage" class="rounded-xl border border-white/20 bg-white px-3 py-2 text-sm text-ink">
              <option value="solution_design">해결안 구안</option>
              <option value="action_planning">실행 계획 수립</option>
            </select>
            <input id="teacherFeedbackInput" class="rounded-xl border border-white/20 bg-white px-3 py-2 text-sm text-ink" placeholder="팀에 전달할 피드백을 입력하세요." />
            <button id="sendTeacherFeedback" class="rounded-xl bg-yellow-300 px-4 py-2 text-sm font-bold text-ink" data-feedback-team="${team.name}">전송</button>
          </div>
        </div>
      </div>` : '';
  }

  function renderTeacherNoteCard(note) {
    return `<article class="rounded-2xl bg-white p-3 text-sm leading-6 shadow-insetLine">
      <p class="font-semibold text-slate-800">${escapeHtml(note.text)}</p>
      <div class="mt-2 flex justify-between border-t border-slate-100 pt-2 text-xs text-muted"><span>${escapeHtml(note.author)}</span><span>${formatTime(note.timestamp)}</span></div>
    </article>`;
  }

  function renderAiVisualization() {
    const teams = state.projectState.teams || [];
    const totalByStage = Object.fromEntries(stages.map((stage) => [stage.id, teams.reduce((sum, team) => sum + (team.aiByStage?.[stage.id] || 0), 0)]));
    const maxStage = stages.slice().sort((a, b) => totalByStage[b.id] - totalByStage[a.id])[0];
    $('aiStageUsage').innerHTML = stages.map((stage) => {
      const used = Math.min(5, totalByStage[stage.id]);
      return `<div class="rounded-2xl bg-white/88 p-4 shadow-insetLine"><div class="flex justify-between text-sm font-bold"><span>${stage.label}</span><span>${used}/5</span></div><div class="mt-2 flex gap-1">${Array.from({ length: 5 }, (_, i) => `<span class="h-3 flex-1 rounded-full ${i < used ? 'bg-violet' : 'bg-slate-200'}"></span>`).join('')}</div></div>`;
    }).join('');
    $('aiBiasWarning').textContent = totalByStage[maxStage.id] >= 4 ? `AI 사용이 ${maxStage.label} 단계에 집중되어 있음` : 'AI 사용 편향 경고 없음';
  }

  function renderRoster() {
    const roster = sortedRoster();
    $('studentRosterCount').textContent = `${roster.length}명`;
    $('studentRosterList').innerHTML = `
      <div class="grid grid-cols-[1.1fr_.7fr_.7fr_.7fr_.7fr] gap-2 border-b border-line bg-paper px-4 py-3 text-xs font-bold text-muted">
        <span>이름</span><span>팀</span><span>접속</span><span>이벤트</span><span>분당</span>
      </div>
      ${roster.map((student) => `<div class="grid grid-cols-[1.1fr_.7fr_.7fr_.7fr_.7fr] gap-2 border-b border-line/60 px-4 py-3 text-sm">
        <span class="font-semibold">${escapeHtml(student.name)} ${badges(student.badges)}</span>
        <span>${escapeHtml(student.team)}</span>
        <span class="${student.online ? 'text-teal font-bold' : 'text-muted'}">${student.online ? '접속중' : '오프라인'}</span>
        <span>${student.eventCount}개</span>
        <span>${student.rate.toFixed(2)}개</span>
      </div>`).join('')}
    `;
  }

  function sortedRoster() {
    const roster = [...(state.projectState.roster || [])];
    const sorters = {
      name: (a, b) => a.name.localeCompare(b.name, 'ko'),
      team: (a, b) => a.team.localeCompare(b.team, 'ko') || a.name.localeCompare(b.name, 'ko'),
      event: (a, b) => b.eventCount - a.eventCount || a.name.localeCompare(b.name, 'ko'),
      rate: (a, b) => b.rate - a.rate || a.name.localeCompare(b.name, 'ko'),
      online: (a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'ko')
    };
    return roster.sort(sorters[state.rosterSort] || sorters.name);
  }

  function renderEvents() {
    const events = state.projectState.events || [];
    $('eventTimeline').innerHTML = stages.map((stage) => {
      const logs = events.filter((event) => event.cpsStage === stage.id).slice(0, 8);
      return `<div class="rounded-[22px] bg-paper p-4"><h3 class="font-semibold">${stage.label} 로그</h3><div class="mt-3 space-y-2">${logs.map((event) => `<div class="rounded-xl bg-white p-3 text-xs"><strong>${eventName(event.eventType)}</strong> · ${escapeHtml(event.actorName || '')} · ${formatTime(event.timestamp, true)}</div>`).join('') || '<p class="text-sm text-muted">로그 없음</p>'}</div></div>`;
    }).join('');
  }

  function renderCharts() {
    if (!window.Chart) return;
    destroyCharts();
    const teams = state.projectState.teams || [];
    state.charts.temperature = new Chart($('memberChart'), {
      type: 'bar',
      data: { labels: teams.map((t) => t.name), datasets: [{ label: '협동 온도', data: teams.map((t) => t.temperature), backgroundColor: '#facc15' }] },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, max: 45 } } }
    });
    state.charts.ai = new Chart($('ratioChart'), {
      type: 'doughnut',
      data: { labels: stages.map((s) => s.label), datasets: [{ data: stages.map((s) => teams.reduce((sum, t) => sum + (t.aiByStage?.[s.id] || 0), 0)), backgroundColor: ['#2563eb', '#7c3aed', '#0f9f8f', '#d97706'] }] },
      options: { plugins: { legend: { position: 'bottom' } } }
    });
    state.charts.rate = new Chart($('rateChart'), {
      type: 'bar',
      data: { labels: state.projectState.roster.map((r) => r.name), datasets: [{ label: '분당 이벤트 수', data: state.projectState.roster.map((r) => Number(r.rate.toFixed(2))), backgroundColor: '#0f9f8f' }] },
      options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
    });
  }

  function destroyCharts() {
    Object.values(state.charts).forEach((chart) => chart?.destroy?.());
    state.charts = {};
  }

  async function addNote(mode, text = null) {
    const input = mode === 'divergence' ? $('divergenceInput') : $('convergenceInput');
    const value = (text ?? input.value).trim();
    if (!value) return;
    const data = await api(`/api/projects/${state.currentProject.id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ text: value, mode, stage: stages[state.currentStage].id })
    });
    input.value = '';
    state.projectState = data.state;
    renderAll();
  }

  async function logEvent(eventType, payload = {}, mode = state.activePhase, stage = stages[state.currentStage].id) {
    const data = await api(`/api/projects/${state.currentProject.id}/events`, {
      method: 'POST',
      body: JSON.stringify({ eventType, cpsStage: stage, activityMode: mode, payload })
    });
    state.projectState = data.state;
    renderAll();
  }

  async function logEventSilent(eventType, payload = {}, mode = state.activePhase, stage = stages[state.currentStage].id) {
    await api(`/api/projects/${state.currentProject.id}/events`, {
      method: 'POST',
      body: JSON.stringify({ eventType, cpsStage: stage, activityMode: mode, payload })
    });
  }

  async function requestAI(key = 'summary') {
    const stage = stages[state.currentStage].id;
    try {
      const data = await api(`/api/projects/${state.currentProject.id}/ai`, {
        method: 'POST',
        body: JSON.stringify({ key, cpsStage: stage, activityMode: state.activePhase, trigger: key })
      });
      state.projectState = data.state;
      $('aiResponse').textContent = data.response;
      renderAll();
    } catch (error) {
      $('aiResponse').textContent = error.message;
    }
  }

  async function noteAction(action, noteId) {
    const note = (state.projectState.notes || []).find((item) => item.id === noteId);
    if (!note) return;
    if (action === 'edit') {
      const text = window.prompt('노트 내용을 수정하세요.', note.text);
      if (!text?.trim()) return;
      state.projectState = (await api(`/api/projects/${state.currentProject.id}/notes/${noteId}`, { method: 'PATCH', body: JSON.stringify({ text: text.trim() }) })).state;
    }
    if (action === 'delete') {
      if (!window.confirm('이 카드를 삭제할까요?')) return;
      state.projectState = (await api(`/api/projects/${state.currentProject.id}/notes/${noteId}`, { method: 'DELETE' })).state;
    }
    if (action === 'reply') {
      const text = window.prompt('답글을 입력하세요.');
      if (!text?.trim()) return;
      state.projectState = (await api(`/api/projects/${state.currentProject.id}/notes/${noteId}/replies`, { method: 'POST', body: JSON.stringify({ text: text.trim() }) })).state;
    }
    if (action === 'like' || action === 'select') {
      state.projectState = (await api(`/api/projects/${state.currentProject.id}/notes/${noteId}/${action}`, { method: 'POST' })).state;
    }
    renderAll();
  }

  async function saveProblemDefinition() {
    const user = $('problemUserInput')?.value.trim();
    const pain = $('problemPainInput')?.value.trim();
    const reason = $('problemReasonInput')?.value.trim();
    const hmw = $('problemHmwInput')?.value.trim();
    if (!user || !pain || !reason) return;
    const hmwText = hmw || `어떻게 하면 ${user}가 ${pain.replace('어려움을 겪는다', '쉽게 해결할 수 있을까')}?`;
    await addNote('convergence', `${user}는 ${pain}.\n왜냐하면 ${reason} 때문이다.\n\nHMW: ${hmwText}`);
  }

  async function saveDecisionMatrix() {
    const criteria = [...document.querySelectorAll('.criteria-input')].map((input, index) => input.value.trim() || `준거 ${index + 1}`);
    const rows = [...document.querySelectorAll('[data-matrix-note]')].map((row) => {
      const scores = [...row.querySelectorAll('.matrix-score')].map((input) => Math.max(0, Math.min(5, Number(input.value || 0))));
      return { noteId: row.dataset.matrixNote, scores, total: scores.reduce((a, b) => a + b, 0) };
    });
    const picked = rows.slice().sort((a, b) => b.total - a.total)[0]?.noteId;
    state.projectState = (await api(`/api/projects/${state.currentProject.id}/decision`, { method: 'POST', body: JSON.stringify({ stage: 'idea_generation', criteria, matrix: rows, selectedNoteId: picked }) })).state;
    renderAll();
  }

  function recalcMatrix() {
    document.querySelectorAll('[data-matrix-note]').forEach((row) => {
      const total = [...row.querySelectorAll('.matrix-score')].reduce((sum, input) => {
        const clamped = Math.max(0, Math.min(5, Number(input.value || 0)));
        if (input.value && Number(input.value) !== clamped) input.value = clamped;
        return sum + clamped;
      }, 0);
      row.querySelector('.matrix-total').textContent = total;
    });
  }

  function badges(values = []) {
    const map = { idea: '💡', empathy: '❤️', explorer: '🔍', connector: '🔗', listener: '👂' };
    return values.map((value) => map[value] || '').join('');
  }

  function emptyCard(text) {
    return `<div class="rounded-[22px] border border-dashed border-line bg-white/72 p-6 text-sm text-muted">${text}</div>`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  function formatTime(value, seconds = false) {
    if (!value) return '';
    return new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });
  }

  $('goLoginBtn').addEventListener('click', openLogin);
  $('goSignupBtn').addEventListener('click', () => {
    $('signupMessage').classList.add('hidden');
    showScreen('signupScreen');
  });
  $('backToRoleFromLogin').addEventListener('click', () => showScreen('roleScreen'));
  $('backToRoleFromSignup').addEventListener('click', () => showScreen('roleScreen'));
  $('backToRole').addEventListener('click', () => showScreen('roleScreen'));
  $('loginBtn').addEventListener('click', login);
  $('loginPassword').addEventListener('keydown', (event) => { if (event.key === 'Enter') login(); });
  $('signupBtn').addEventListener('click', signup);
  $('signupRole').addEventListener('change', toggleSignupTeacherCode);
  $('signupPassword').addEventListener('keydown', (event) => { if (event.key === 'Enter') signup(); });
  $('createProjectBtn').addEventListener('click', () => $('createProjectPanel').classList.toggle('hidden'));
  $('saveProjectBtn').addEventListener('click', createProject);
  $('joinProjectBtn').addEventListener('click', joinProjectByCode);
  $('backToProjects').addEventListener('click', async () => {
    if (state.stream) state.stream.close();
    if (state.heartbeat) clearInterval(state.heartbeat);
    await loadProjects();
    renderProjectScreen();
    showScreen('projectScreen');
  });
  $('rosterSort').addEventListener('change', (event) => {
    state.rosterSort = event.target.value;
    renderRoster();
  });
  $('phaseDivergeBtn').addEventListener('click', () => { state.activePhase = 'divergence'; logEvent('button_clicked', { target: 'divergence_tab' }, 'divergence'); renderAll(); });
  $('phaseConvergeBtn').addEventListener('click', () => { state.activePhase = 'convergence'; logEvent('button_clicked', { target: 'convergence_tab' }, 'convergence'); renderAll(); });
  $('addDivergence').addEventListener('click', () => addNote('divergence'));
  $('addConvergence').addEventListener('click', () => addNote('convergence'));
  $('reviseArtifact').addEventListener('click', () => logEvent('artifact_revision_event', { summary: '산출물 버전 생성', detail: '팀 논의를 반영해 버전을 생성했습니다.' }, 'convergence'));
  $('studentHelpBtn').addEventListener('click', () => requestAI('stage_help'));
  document.querySelectorAll('.ai-btn').forEach((button) => button.addEventListener('click', () => requestAI(button.dataset.ai)));

  document.body.addEventListener('click', (event) => {
    const noteButton = event.target.closest('[data-note-action]');
    if (noteButton) noteAction(noteButton.dataset.noteAction, noteButton.dataset.noteId);
    const teamButton = event.target.closest('[data-team-view]');
    if (teamButton) { state.selectedTeacherTeam = teamButton.dataset.teamView; state.teacherDetailStage = null; renderTeacherDetail(); }
    const teacherStageButton = event.target.closest('[data-teacher-stage]');
    if (teacherStageButton) { state.teacherDetailStage = teacherStageButton.dataset.teacherStage; renderTeacherDetail(); }
    const shareButton = event.target.closest('[data-share-project]');
    if (shareButton) shareProjectCode(shareButton.dataset.shareProject);
    const promptButton = event.target.closest('[data-fill-prompt]');
    if (promptButton) $(state.activePhase === 'convergence' ? 'convergenceInput' : 'divergenceInput').value = promptButton.dataset.fillPrompt;
    const versionButton = event.target.closest('[data-version]');
    if (versionButton) window.alert(`${versionButton.dataset.version}\n${versionButton.dataset.versionNote}`);
    if (event.target.id === 'saveProblemDefinition') saveProblemDefinition();
    if (event.target.id === 'saveDecisionMatrix') saveDecisionMatrix();
    if (event.target.id === 'sendTeacherFeedback') sendTeacherFeedback(event.target.dataset.feedbackTeam);
    const checkButton = event.target.closest('.check-prev, .check-next');
    if (checkButton) moveCheckItem(checkButton.classList.contains('check-next') ? 1 : -1);
  });
  document.body.addEventListener('input', (event) => {
    if (event.target.classList.contains('matrix-score')) recalcMatrix();
    if (event.target.matches('textarea,input')) {
      clearTimeout(state.inputLogTimer);
      state.inputLogTimer = setTimeout(() => logEventSilent('input_event', { id: event.target.id || 'field' }).catch(() => {}), 1200);
    }
  });

  function moveCheckItem(direction) {
    const carousel = document.querySelector('.check-carousel');
    if (!carousel) return;
    const items = [...carousel.querySelectorAll('[data-check-item]')];
    if (!items.length) return;
    const current = Number(carousel.dataset.checkIndex || 0);
    const next = (current + direction + items.length) % items.length;
    carousel.dataset.checkIndex = String(next);
    items.forEach((item, index) => item.classList.toggle('hidden', index !== next));
  }

  async function sendTeacherFeedback(teamName) {
    const input = $('teacherFeedbackInput');
    const stage = $('teacherFeedbackStage')?.value || 'solution_design';
    const feedback = input?.value.trim();
    if (!feedback) return;
    await logEvent('teacher_feedback', { teamName, feedback }, 'convergence', stage);
    input.value = '';
  }

  async function shareProjectCode(projectId) {
    const data = await api(`/api/projects/${projectId}/share-code`, { method: 'POST' });
    await loadProjects();
    renderProjectScreen();
    window.alert(`프로젝트 코드: ${data.project.shareCode}`);
  }

  async function joinProjectByCode() {
    const code = $('joinProjectCode').value.trim();
    const message = $('joinProjectMessage');
    if (!code) return;
    try {
      const data = await api('/api/projects/join', { method: 'POST', body: JSON.stringify({ code }) });
      message.textContent = `${data.project.name} 프로젝트가 추가되었습니다.`;
      message.className = 'mt-3 text-sm font-bold text-teal';
      message.classList.remove('hidden');
      $('joinProjectCode').value = '';
      await loadProjects();
      renderProjectScreen();
    } catch (error) {
      message.textContent = error.message;
      message.className = 'mt-3 text-sm font-bold text-rose';
      message.classList.remove('hidden');
    }
  }

  function toggleSignupTeacherCode() {
    const isTeacher = $('signupRole').value === 'teacher';
    $('signupTeacherCode').classList.toggle('hidden', !isTeacher);
    if (!isTeacher) $('signupTeacherCode').value = '';
  }

  iconRefresh();
});
