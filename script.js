document.addEventListener('DOMContentLoaded', () => {
  const stages = [
    { id: 'problem_exploration', label: '문제 탐색', guide: '우리 주변에서 해결하고 싶은 문제를 찾고, 왜 중요한지 이야기합니다.', div: '문제에 대해 떠오르는 점 적기', conv: '팀이 중요하다고 본 문제 정하기' },
    { id: 'idea_generation', label: '아이디어 생성', guide: '가능한 해결 아이디어를 많이 내고, 비슷한 아이디어끼리 묶어봅니다.', div: '새로운 해결 아이디어 적기', conv: '함께 발전시킬 아이디어 고르기' },
    { id: 'solution_design', label: '해결안 구안', guide: '선택한 아이디어를 실제로 해볼 수 있는 해결안으로 구체화합니다.', div: '해결안의 모습 상상하기', conv: '실행 가능한 해결안 정리하기' },
    { id: 'action_planning', label: '실행 계획 수립', guide: '누가, 언제, 무엇을 할지 정하고 필요한 준비물을 확인합니다.', div: '필요한 일과 걱정되는 점 적기', conv: '역할과 일정 확정하기' }
  ];

  const state = {
    selectedRole: null,
    token: null,
    user: null,
    projects: [],
    currentProject: null,
    projectState: null,
    currentStage: 0,
    activePhase: 'divergence',
    stream: null,
    heartbeat: null,
    memberChart: null,
    ratioChart: null,
    rateChart: null
  };

  const $ = (id) => document.getElementById(id);

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('active'));
    $(id)?.classList.add('active');
    if (window.lucide) lucide.createIcons();
  }

  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.token}`
    };
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

  function chooseRole(role) {
    state.selectedRole = role;
    $('loginRoleLabel').textContent = role === 'teacher' ? 'Instructor Login' : 'Student Login';
    $('loginHelp').textContent = role === 'teacher'
      ? '교수자 계정으로 로그인하면 프로젝트 생성과 전체 대시보드를 사용할 수 있습니다.'
      : '학생 계정으로 로그인하면 교수자가 만든 프로젝트에 참여할 수 있습니다.';
    $('loginUsername').value = role === 'teacher' ? 'teacher' : 'minseo';
    $('loginPassword').value = role === 'teacher' ? 'teacher123' : 'student123';
    $('loginError').classList.add('hidden');
    showScreen('loginScreen');
  }

  async function login() {
    try {
      const username = $('loginUsername').value.trim();
      const password = $('loginPassword').value;
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ role: state.selectedRole, username, password })
      });
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('pjbl_session', JSON.stringify({ token: state.token, user: state.user, role: state.selectedRole }));
      await loadProjects();
      showProjectScreen();
    } catch (error) {
      $('loginError').textContent = error.message;
      $('loginError').classList.remove('hidden');
    }
  }

  async function loadProjects() {
    const data = await api('/api/projects');
    state.projects = data.projects;
  }

  function showProjectScreen() {
    const role = state.user.role;
    $('projectRoleLabel').textContent = role === 'teacher' ? 'Instructor Space' : 'Student Space';
    $('projectTitle').textContent = role === 'teacher' ? '관리할 프로젝트를 선택하세요' : '참여할 프로젝트를 선택하세요';
    $('projectHelp').textContent = role === 'teacher'
      ? '교수자는 기존 프로젝트를 확인하거나 새 프로젝트를 만들 수 있습니다.'
      : '학생은 교수자가 만들어 둔 프로젝트 목록 중 하나를 선택합니다.';
    $('createProjectBtn').classList.toggle('hidden', role !== 'teacher');
    $('createProjectPanel').classList.add('hidden');
    renderProjectList();
    showScreen('projectScreen');
  }

  function renderProjectList() {
    const list = $('projectList');
    list.innerHTML = state.projects.map((project) => `
      <button class="project-card rounded-lg panel p-5 text-left transition hover:-translate-y-1 hover:shadow-soft" data-project="${project.id}">
        <div class="flex items-center justify-between gap-3">
          <span class="rounded-full bg-white px-3 py-1 text-xs font-semibold text-muted shadow-insetLine">${project.teams || 1} teams</span>
          <i data-lucide="arrow-right" class="h-4 w-4 text-muted"></i>
        </div>
        <h2 class="mt-5 text-xl font-semibold">${escapeHtml(project.name)}</h2>
        <p class="mt-3 text-sm leading-6 text-muted">${escapeHtml(project.topic)}</p>
        ${project.createdBy === 'teacher' ? '<p class="mt-4 text-xs font-semibold text-teal">교수자 생성 프로젝트</p>' : ''}
      </button>
    `).join('') || '<div class="rounded-lg border border-dashed border-line bg-white/72 p-6 text-sm text-muted">아직 프로젝트가 없습니다.</div>';

    document.querySelectorAll('.project-card').forEach((card) => {
      card.addEventListener('click', async () => {
        state.currentProject = state.projects.find((project) => project.id === card.dataset.project);
        await enterApp();
      });
    });
    if (window.lucide) lucide.createIcons();
  }

  async function createProject() {
    const name = $('newProjectName').value.trim() || `새 프로젝트 ${state.projects.length + 1}`;
    const topic = $('newProjectTopic').value.trim() || '새로운 PjBL 탐구 주제';
    const data = await api('/api/projects', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, topic })
    });
    $('newProjectName').value = '';
    $('newProjectTopic').value = '';
    $('createProjectPanel').classList.add('hidden');
    await loadProjects();
    state.currentProject = data.project;
    await enterApp();
  }

  async function enterApp() {
    state.currentStage = 0;
    state.activePhase = 'divergence';
    await loadProjectState();
    applyRoleView();
    renderAll();
    openProjectStream();
    startHeartbeat();
    document.title = state.user.role === 'student' ? 'PjBL 협업 시스템' : 'AI-PjBL 교수자 대시보드';
    showScreen('appScreen');
  }

  async function loadProjectState() {
    const data = await api(`/api/projects/${state.currentProject.id}/state`);
    state.projectState = data;
    state.currentProject = data.project;
  }

  function openProjectStream() {
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
    sendHeartbeat();
    state.heartbeat = setInterval(sendHeartbeat, 10000);
  }

  async function sendHeartbeat() {
    if (!state.token || !state.currentProject) return;
    try {
      await api('/api/heartbeat', {
        method: 'POST',
        body: JSON.stringify({ projectId: state.currentProject.id })
      });
    } catch (error) {
      console.warn(error.message);
    }
  }

  function applyRoleView() {
    const isStudent = state.user.role === 'student';
    $('sidebarTitle').textContent = isStudent ? 'PjBL 협업 시스템' : 'AI-PjBL CPS Lab';
    $('sidebarSub').textContent = isStudent ? `Student Workspace · ${state.user.name}` : `Instructor Dashboard · ${state.user.name}`;
    $('currentProjectAside').textContent = state.currentProject?.name || '프로젝트 미선택';
    $('appTitle').textContent = isStudent ? 'PjBL 협업 시스템' : 'AI-PjBL 교수자 대시보드';
    $('appSubtitle').textContent = isStudent
      ? `${state.currentProject.name}에서 팀 활동을 단계별 협업 보드로 진행합니다.`
      : `${state.currentProject.name}의 실시간 행동 이벤트와 팀별 협업 상태를 확인합니다.`;
    $('headerBadges').innerHTML = isStudent
      ? ['프로젝트 활동', state.user.team, 'AI 팀원 잠금 조건: 아이디어 10개'].map((text) => badge(text)).join('')
      : ['Live Analytics', 'Behavior Event Timeline', 'Event Rate'].map((text) => badge(text)).join('');
    $('teacherMetrics').classList.toggle('role-hidden', isStudent);
    document.querySelectorAll('[data-view]').forEach((section) => {
      section.classList.toggle('role-hidden', section.dataset.view !== state.user.role);
    });
    $('sideNav').innerHTML = isStudent ? `
      <a href="#workspace" class="flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-ink hover:bg-white"><i data-lucide="layout-dashboard" class="h-4 w-4"></i>프로젝트 활동</a>
    ` : `
      <a href="#awareness" class="flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-ink hover:bg-white"><i data-lucide="activity" class="h-4 w-4"></i>그룹 인식</a>
      <a href="#orchestration" class="flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-muted hover:bg-white hover:text-ink"><i data-lucide="sliders-horizontal" class="h-4 w-4"></i>교수자 조율</a>
      <a href="#studentRoster" class="flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-muted hover:bg-white hover:text-ink"><i data-lucide="users-round" class="h-4 w-4"></i>학생 명단</a>
      <a href="#eventlog" class="flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-muted hover:bg-white hover:text-ink"><i data-lucide="list-tree" class="h-4 w-4"></i>행동 이벤트</a>
    `;
  }

  function renderStages() {
    const icons = ['compass', 'lightbulb', 'hammer', 'check-circle'];
    $('stageTabs').innerHTML = stages.map((stage, index) => `
      <button class="stage-tab flex w-full items-center gap-3 rounded-lg p-3 text-left text-sm font-semibold transition ${index === state.currentStage ? 'stage-active' : 'bg-white/72 text-muted shadow-insetLine hover:bg-white'}" data-stage="${index}">
        <span class="grid h-8 w-8 place-items-center rounded-lg ${index === state.currentStage ? 'bg-white/16 text-white' : 'bg-paper text-ocean'}">
          <i data-lucide="${icons[index]}" class="h-4 w-4"></i>
        </span>
        <span><span class="block text-xs opacity-70">Step ${index + 1}</span>${stage.label}</span>
      </button>
    `).join('');
    document.querySelectorAll('.stage-tab').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const next = Number(btn.dataset.stage);
        if (next === state.currentStage) return;
        const previous = stages[state.currentStage].id;
        state.currentStage = next;
        await addEvent('cps_stage_transition', { fromStage: previous, toStage: stages[next].id }, 'convergence');
      });
    });

    const stage = stages[state.currentStage];
    $('stageKicker').textContent = `Step ${String(state.currentStage + 1).padStart(2, '0')}`;
    $('studentStageTitle').textContent = stage.label;
    $('studentStageGuide').textContent = stage.guide;
    $('convTitle').textContent = stage.conv;
    $('prevStageBtn').disabled = state.currentStage === 0;
    $('nextStageBtn').disabled = state.currentStage === stages.length - 1;
    $('prevStageBtn').classList.toggle('opacity-45', state.currentStage === 0);
    $('nextStageBtn').classList.toggle('opacity-45', state.currentStage === stages.length - 1);
    renderPhase();
  }

  function renderPhase() {
    $('phaseDivergeBtn').className = `phase-btn rounded-md px-3 py-2 text-xs font-semibold ${state.activePhase === 'divergence' ? 'bg-amber text-white shadow-sm' : 'text-muted hover:bg-white'}`;
    $('phaseConvergeBtn').className = `phase-btn rounded-md px-3 py-2 text-xs font-semibold ${state.activePhase === 'convergence' ? 'bg-teal text-white shadow-sm' : 'text-muted hover:bg-white'}`;
    $('divergencePanel').classList.toggle('hidden', state.activePhase !== 'divergence');
    $('convergencePanel').classList.toggle('hidden', state.activePhase !== 'convergence');
  }

  function renderStudentBoard() {
    const stageId = stages[state.currentStage].id;
    const notes = state.projectState.notes || [];
    const stageNotes = notes.filter((note) => note.stage === stageId && note.mode === 'divergence');
    const convNotes = notes.filter((note) => note.stage === stageId && note.mode === 'convergence');
    const colors = ['bg-amber-50 border-amber-200', 'bg-blue-50 border-blue-200', 'bg-emerald-50 border-emerald-200'];

    $('divergenceCards').innerHTML = stageNotes.map((note, index) => renderNoteCard(note, `${colors[index % colors.length]} ${index % 2 ? '-rotate-1' : 'rotate-1'}`)).join('')
      || '<div class="rounded-lg border border-dashed border-line bg-white/72 p-6 text-sm text-muted">아직 추가된 생각 카드가 없습니다.</div>';

    $('convergenceCards').innerHTML = convNotes.map((note) => renderNoteCard(note, 'border-emerald-100 bg-white/92')).join('')
      || '<div class="rounded-lg border border-dashed border-line bg-white/72 p-6 text-sm text-muted">아직 정리된 내용이 없습니다.</div>';
  }

  function renderNoteCard(note, styleClass) {
    const canModify = state.user.role === 'teacher' || note.actorId === state.user.id;
    const replies = Array.isArray(note.replies) ? note.replies : [];
    return `
      <article class="note-card ${styleClass} rounded-xl border p-4 shadow-sm" data-note-id="${note.id}">
        <p class="min-h-16 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">${escapeHtml(note.text)}</p>
        <div class="mt-4 flex items-center justify-between border-t border-white/70 pt-3 text-xs text-muted">
          <span class="inline-flex items-center gap-2"><span class="grid h-6 w-6 place-items-center rounded-full bg-white text-[10px] font-bold text-ink shadow-insetLine">${note.author.slice(0, 1)}</span>${escapeHtml(note.author)}</span>
          <span>${formatTime(note.timestamp)}${note.editedAt ? ' · 수정됨' : ''}</span>
        </div>
        <div class="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
          <button class="rounded-full bg-white px-3 py-1 text-ocean shadow-insetLine hover:bg-paper" data-note-action="reply" data-note-id="${note.id}">답글</button>
          ${canModify ? `<button class="rounded-full bg-white px-3 py-1 text-muted shadow-insetLine hover:bg-paper" data-note-action="edit" data-note-id="${note.id}">수정</button>
          <button class="rounded-full bg-white px-3 py-1 text-rose shadow-insetLine hover:bg-rose/10" data-note-action="delete" data-note-id="${note.id}">삭제</button>` : ''}
        </div>
        ${replies.length ? `
          <div class="mt-3 space-y-2 border-t border-white/70 pt-3">
            ${replies.map((reply) => `
              <div class="rounded-lg bg-white/72 p-3 text-xs leading-5 text-slate-700 shadow-insetLine">
                <div class="mb-1 flex items-center justify-between gap-2 font-semibold">
                  <span>${escapeHtml(reply.author)}</span>
                  <span class="text-muted">${formatTime(reply.timestamp)}</span>
                </div>
                <p class="whitespace-pre-wrap">${escapeHtml(reply.text)}</p>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </article>
    `;
  }

  function renderStudentAwareness() {
    const roster = state.projectState.roster || [];
    const currentTeam = state.user.team;
    const teamMembers = roster.filter((student) => student.team === currentTeam);
    $('studentAwarenessList').innerHTML = teamMembers.map((student) => `
      <div>
        <div class="mb-1 flex justify-between text-xs">
          <span class="font-semibold text-ink">${escapeHtml(student.name)}</span>
          <span class="text-muted">${student.eventCount} events · ${student.rate.toFixed(2)}/분</span>
        </div>
        <div class="flex h-2 overflow-hidden rounded-full bg-slate-100">
          <div class="bg-amber" style="width:${Math.min(100, student.divergence * 12)}%"></div>
          <div class="bg-teal" style="width:${Math.min(100, student.convergence * 12)}%"></div>
        </div>
      </div>
    `).join('') || '<p class="text-sm text-muted">아직 팀 활동 데이터가 없습니다.</p>';

    const events = state.projectState.events || [];
    const divergence = events.filter((event) => event.activityMode === 'divergence').length;
    const convergence = events.filter((event) => event.activityMode === 'convergence').length;
    const total = divergence + convergence || 1;
    const divPct = Math.round((divergence / total) * 100);
    $('studentBalanceRatio').textContent = `${divPct}% / ${100 - divPct}%`;
    $('studentBalanceBar').innerHTML = `<div class="bg-amber" style="width:${divPct}%"></div><div class="bg-teal" style="width:${100 - divPct}%"></div>`;
  }

  function renderArtifactTimeline() {
    const revisions = state.projectState.revisions || [];
    $('artifactTimeline').innerHTML = revisions.slice(0, 4).map((revision) => `
      <article class="relative z-10 rounded-lg bg-white p-3 text-center shadow-insetLine">
        <div class="mx-auto grid h-8 w-8 place-items-center rounded-full ${revision.type === 'ai' ? 'bg-violet text-white' : 'bg-ocean text-white'}">
          <i data-lucide="${revision.type === 'ai' ? 'sparkles' : 'git-commit-horizontal'}" class="h-4 w-4"></i>
        </div>
        <p class="mt-2 text-xs font-semibold">${escapeHtml(revision.version)}</p>
        <p class="mt-1 truncate text-[11px] text-muted">${escapeHtml(revision.title)}</p>
        <p class="mt-1 text-[10px] text-muted">${formatTime(revision.timestamp)}</p>
      </article>
    `).join('') || '<div class="col-span-4 rounded-lg border border-dashed border-line bg-white/72 p-4 text-center text-sm text-muted">아직 산출물 수정 기록이 없습니다.</div>';
  }

  function renderAIFeed() {
    const feed = state.projectState.aiFeed || [];
    $('aiFeed').innerHTML = feed.map((item) => `
      <article class="rounded-lg ${item.by === 'AI' ? 'border border-purple-100 bg-white' : 'border border-blue-100 bg-blue-50'} p-3 text-sm leading-6 shadow-sm">
        <div class="mb-1 flex items-center justify-between text-xs">
          <strong class="${item.by === 'AI' ? 'text-violet' : 'text-ocean'}">${escapeHtml(item.by)}</strong>
          <span class="text-muted">${formatTime(item.timestamp)}</span>
        </div>
        <p class="text-slate-700">${escapeHtml(item.text)}</p>
      </article>
    `).join('');
  }

  function renderEvents() {
    const colors = {
      cps_stage_transition: 'bg-ocean/10 text-ocean',
      phase_switch: 'bg-teal/10 text-teal',
      idea_created: 'bg-amber/10 text-amber',
      convergence_note_created: 'bg-teal/10 text-teal',
      note_updated: 'bg-blue-100 text-blue-700',
      note_deleted: 'bg-rose/10 text-rose',
      note_replied: 'bg-violet/10 text-violet',
      ai_interaction_event: 'bg-violet/10 text-violet',
      collaboration_event: 'bg-indigo-100 text-indigo-700',
      artifact_revision_event: 'bg-rose/10 text-rose'
    };
    const events = state.projectState.events || [];
    $('eventTimeline').innerHTML = events.slice(0, 48).map((event, index) => `
      <div class="${index === 0 ? 'event-enter' : ''} rounded-lg bg-paper p-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="rounded-full px-3 py-1 text-xs font-semibold ${colors[event.eventType] || 'bg-slate-100 text-muted'}">${event.eventType}</span>
          <span class="text-xs text-muted">${formatTime(event.timestamp, true)}</span>
        </div>
        <div class="mt-3 grid gap-2 text-xs text-muted md:grid-cols-4">
          <span><strong class="text-ink">stage</strong> ${event.cpsStage}</span>
          <span><strong class="text-ink">mode</strong> ${event.activityMode}</span>
          <span><strong class="text-ink">actor</strong> ${event.actorName || event.actorId}</span>
          <span><strong class="text-ink">team</strong> ${event.teamId}</span>
        </div>
      </div>
    `).join('') || '<div class="rounded-lg border border-dashed border-line bg-white/72 p-6 text-sm text-muted">아직 이벤트가 없습니다.</div>';
  }

  function renderMetrics() {
    const events = state.projectState.events || [];
    const divergence = events.filter((event) => event.activityMode === 'divergence').length;
    const convergence = events.filter((event) => event.activityMode === 'convergence').length;
    const total = divergence + convergence || 1;
    const divPercent = Math.round((divergence / total) * 100);
    const teamIdeaCount = state.projectState.aiUnlock?.teamIdeaCount || 0;
    const unlocked = state.projectState.aiUnlock?.unlocked || false;

    $('metricEvents').textContent = events.length;
    $('metricUnlock').textContent = unlocked ? 'Open' : `Locked ${teamIdeaCount}/10`;
    $('metricUnlock').className = `mt-1 text-xl font-semibold ${unlocked ? 'text-teal' : 'text-amber'}`;
    $('metricRatio').textContent = `${divPercent}/${100 - divPercent}`;

    $('aiLockBadge').innerHTML = unlocked
      ? '<span class="inline-flex items-center gap-1"><i data-lucide="unlock" class="h-3.5 w-3.5"></i>사용 가능</span>'
      : '<span class="inline-flex items-center gap-1"><i data-lucide="lock" class="h-3.5 w-3.5"></i>Locked</span>';
    $('aiLockBadge').className = `rounded-full px-3 py-1 text-xs font-semibold ${unlocked ? 'bg-teal/10 text-teal' : 'bg-amber/10 text-amber'}`;
    $('aiGate').textContent = unlocked
      ? 'AI 팀원이 잠금 해제되었습니다. 질문 방향, 놓친 점, 선택 기준을 함께 점검할 수 있습니다.'
      : `아이디어를 10개 이상 적으면 AI 팀원이 잠금 해제 됩니다! 현재 ${teamIdeaCount}/10개입니다.`;

    document.querySelectorAll('.ai-btn').forEach((btn) => {
      btn.disabled = !unlocked;
      btn.classList.toggle('disabled-control', !unlocked);
    });
    $('studentHelpBtn').disabled = !unlocked;
    $('studentHelpBtn').classList.toggle('disabled-control', !unlocked);
  }

  function renderCharts() {
    if (state.user.role !== 'teacher' || !window.Chart) return;
    const roster = state.projectState.roster || [];
    const events = state.projectState.events || [];
    const labels = roster.map((student) => student.name);

    const destroy = (chart) => chart && chart.destroy();
    destroy(state.memberChart);
    destroy(state.ratioChart);
    destroy(state.rateChart);

    state.memberChart = new Chart($('memberChart'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Divergence', data: roster.map((s) => s.divergence), backgroundColor: '#2563eb' },
          { label: 'Convergence', data: roster.map((s) => s.convergence), backgroundColor: '#0f9f8f' }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' }, title: { display: true, text: '학생별 활동량' } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });

    const eventCounts = ['idea_created', 'convergence_note_created', 'ai_interaction_event', 'artifact_revision_event'].map((type) => events.filter((event) => event.eventType === type).length);
    state.ratioChart = new Chart($('ratioChart'), {
      type: 'doughnut',
      data: {
        labels: ['Idea', 'Convergence', 'AI', 'Revision'],
        datasets: [{ data: eventCounts, backgroundColor: ['#2563eb', '#0f9f8f', '#d97706', '#e11d48'], borderWidth: 0 }]
      },
      options: { cutout: '68%', plugins: { legend: { position: 'bottom' }, title: { display: true, text: '이벤트 유형 비율' } } }
    });

    state.rateChart = new Chart($('rateChart'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'events / min', data: roster.map((s) => Number(s.rate.toFixed(2))), backgroundColor: '#7c3aed' }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' }, title: { display: true, text: '접속시간 대비 이벤트 생성률' } }, scales: { y: { beginAtZero: true } } }
    });
  }

  function renderCollaboration() {
    const roster = state.projectState.roster || [];
    const active = roster.filter((student) => student.online).length;
    const top = [...roster].sort((a, b) => b.rate - a.rate)[0];
    const teamIdeaCount = state.projectState.aiUnlock?.teamIdeaCount || 0;
    const states = [
      ['접속 상태', `${active}명이 현재 프로젝트에 접속 중입니다.`, 'bg-teal'],
      ['AI 팀원 조건', `현재 팀 아이디어 이벤트는 ${teamIdeaCount}/10개입니다.`, teamIdeaCount >= 10 ? 'bg-teal' : 'bg-amber'],
      ['이벤트 생성률', top ? `${top.name}의 분당 이벤트 생성률이 ${top.rate.toFixed(2)}입니다.` : '아직 학생 활동이 없습니다.', 'bg-ocean']
    ];
    $('collabTimeline').innerHTML = states.map(([title, text, color]) => `
      <div class="rounded-lg bg-paper p-4">
        <div class="flex items-center gap-3">
          <span class="h-2.5 w-2.5 rounded-full ${color}"></span>
          <h3 class="font-semibold">${title}</h3>
        </div>
        <p class="mt-2 text-sm leading-6 text-muted">${text}</p>
      </div>
    `).join('');
  }

  function renderTeams() {
    const teams = state.projectState.teams || [];
    $('teamCards').innerHTML = teams.map((team) => {
      const unlocked = team.ideaCount >= 10;
      return `
        <article class="rounded-lg bg-paper p-4">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-lg font-semibold">${team.name}</h3>
            <span class="rounded-full px-3 py-1 text-xs font-semibold ${unlocked ? 'bg-teal/10 text-teal' : 'bg-amber/10 text-amber'}">${unlocked ? 'AI Open' : 'AI Locked'}</span>
          </div>
          <p class="mt-3 text-sm text-muted">아이디어 이벤트</p>
          <p class="font-semibold">${team.ideaCount}/10</p>
          <div class="mt-4">
            <div class="flex justify-between text-sm"><span>팀 이벤트</span><strong>${team.eventCount}</strong></div>
            <div class="mt-2 h-2 rounded-full bg-slate-200"><div class="h-2 rounded-full ${unlocked ? 'bg-teal' : 'bg-amber'}" style="width:${Math.min(100, team.ideaCount * 10)}%"></div></div>
          </div>
          <div class="mt-4 rounded-lg bg-white p-3 text-sm leading-6 text-muted shadow-insetLine">
            <strong class="text-ink">Intervention</strong><br>${unlocked ? 'AI 팀원을 활용해 수렴 기준을 비교하도록 안내' : 'AI 사용 전 학생 아이디어를 먼저 10개 이상 생성하도록 안내'}
          </div>
        </article>
      `;
    }).join('') || '<div class="rounded-lg border border-dashed border-line bg-white/72 p-6 text-sm text-muted">팀 데이터가 없습니다.</div>';
  }

  function renderStudentRoster() {
    const roster = state.projectState.roster || [];
    $('studentRosterCount').textContent = `${roster.length}명`;
    $('studentRosterList').innerHTML = roster.map((student) => {
      const statusClass = student.online ? 'bg-teal/10 text-teal' : student.eventCount ? 'bg-amber/10 text-amber' : 'bg-slate-100 text-muted';
      return `
        <article class="rounded-lg bg-paper p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3">
              <span class="grid h-10 w-10 place-items-center rounded-full bg-white text-sm font-semibold text-ink shadow-insetLine">${student.name.slice(0, 1)}</span>
              <div>
                <h3 class="font-semibold">${escapeHtml(student.name)}</h3>
                <p class="text-xs text-muted">${student.team} · ${student.username}</p>
              </div>
            </div>
            <span class="rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass}">${student.online ? '접속 중' : '오프라인'}</span>
          </div>
          <div class="mt-3 grid grid-cols-3 gap-2 text-xs text-muted">
            <span>접속 ${student.minutes.toFixed(1)}분</span>
            <span>이벤트 ${student.eventCount}</span>
            <span>${student.rate.toFixed(2)}/분</span>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderAll() {
    if (!state.projectState) return;
    renderStages();
    renderStudentBoard();
    renderStudentAwareness();
    renderArtifactTimeline();
    renderAIFeed();
    renderEvents();
    renderMetrics();
    renderCollaboration();
    renderTeams();
    renderStudentRoster();
    renderCharts();
    if (window.lucide) lucide.createIcons();
  }

  async function addEvent(eventType, payload = {}, mode = null) {
    const data = await api(`/api/projects/${state.currentProject.id}/events`, {
      method: 'POST',
      body: JSON.stringify({
        eventType,
        cpsStage: stages[state.currentStage].id,
        activityMode: mode || state.activePhase,
        payload
      })
    });
    state.projectState = data.state;
    renderAll();
  }

  async function addNote(mode) {
    const input = mode === 'divergence' ? $('divergenceInput') : $('convergenceInput');
    const text = input.value.trim();
    if (!text) return;
    const data = await api(`/api/projects/${state.currentProject.id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ text, mode, stage: stages[state.currentStage].id })
    });
    input.value = '';
    state.projectState = data.state;
    renderAll();
  }

  function findNote(noteId) {
    return (state.projectState.notes || []).find((note) => note.id === noteId);
  }

  async function editNote(noteId) {
    const note = findNote(noteId);
    if (!note) return;
    const text = window.prompt('노트 내용을 수정하세요.', note.text);
    if (text === null || !text.trim()) return;
    const data = await api(`/api/projects/${state.currentProject.id}/notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify({ text: text.trim() })
    });
    state.projectState = data.state;
    renderAll();
  }

  async function deleteNote(noteId) {
    const note = findNote(noteId);
    if (!note) return;
    if (!window.confirm('이 노트를 삭제할까요? 답글도 함께 삭제됩니다.')) return;
    const data = await api(`/api/projects/${state.currentProject.id}/notes/${noteId}`, {
      method: 'DELETE'
    });
    state.projectState = data.state;
    renderAll();
  }

  async function replyToNote(noteId) {
    const note = findNote(noteId);
    if (!note) return;
    const text = window.prompt('답글을 입력하세요.');
    if (text === null || !text.trim()) return;
    const data = await api(`/api/projects/${state.currentProject.id}/notes/${noteId}/replies`, {
      method: 'POST',
      body: JSON.stringify({ text: text.trim() })
    });
    state.projectState = data.state;
    renderAll();
  }

  async function requestAI(key, trigger) {
    if (!state.projectState.aiUnlock?.unlocked) return;
    const data = await api(`/api/projects/${state.currentProject.id}/ai`, {
      method: 'POST',
      body: JSON.stringify({ key, trigger, cpsStage: stages[state.currentStage].id })
    });
    state.projectState = data.state;
    $('aiResponse').textContent = data.response;
    renderAll();
  }

  function badge(text) {
    return `<span class="rounded-full bg-white px-3 py-1 shadow-insetLine">${escapeHtml(text)}</span>`;
  }

  function formatTime(value, withSeconds = false) {
    if (!value) return '';
    return new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}) });
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  document.querySelectorAll('[data-role-select]').forEach((button) => {
    button.addEventListener('click', () => chooseRole(button.dataset.roleSelect));
  });
  $('backToRoleFromLogin').addEventListener('click', () => showScreen('roleScreen'));
  $('backToRole').addEventListener('click', () => showScreen('roleScreen'));
  $('loginBtn').addEventListener('click', login);
  $('loginPassword').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') login();
  });
  $('createProjectBtn').addEventListener('click', () => $('createProjectPanel').classList.toggle('hidden'));
  $('saveProjectBtn').addEventListener('click', createProject);

  document.querySelectorAll('.phase-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      state.activePhase = btn.dataset.phase;
      await addEvent('phase_switch', { mode: state.activePhase, source: 'phase_tab' }, state.activePhase);
    });
  });
  $('prevStageBtn').addEventListener('click', async () => {
    if (state.currentStage === 0) return;
    const previous = stages[state.currentStage].id;
    state.currentStage -= 1;
    await addEvent('cps_stage_transition', { fromStage: previous, toStage: stages[state.currentStage].id, direction: 'previous' }, 'convergence');
  });
  $('nextStageBtn').addEventListener('click', async () => {
    if (state.currentStage === stages.length - 1) return;
    const previous = stages[state.currentStage].id;
    state.currentStage += 1;
    await addEvent('cps_stage_transition', { fromStage: previous, toStage: stages[state.currentStage].id, direction: 'next' }, 'convergence');
  });
  $('addDivergence').addEventListener('click', () => addNote('divergence'));
  $('addConvergence').addEventListener('click', () => addNote('convergence'));
  ['divergenceCards', 'convergenceCards'].forEach((containerId) => {
    $(containerId).addEventListener('click', (event) => {
      const button = event.target.closest('[data-note-action]');
      if (!button) return;
      const { noteAction, noteId } = button.dataset;
      if (noteAction === 'edit') editNote(noteId);
      if (noteAction === 'delete') deleteNote(noteId);
      if (noteAction === 'reply') replyToNote(noteId);
    });
  });
  $('studentHelpBtn').addEventListener('click', () => {
    const keys = ['perspective', 'counter', 'elaborate', 'criteria'];
    requestAI(keys[(state.projectState.events.length + state.currentStage) % keys.length], 'student_help_button');
  });
  document.querySelectorAll('.ai-btn').forEach((btn) => {
    btn.addEventListener('click', () => requestAI(btn.dataset.ai, 'ai_scaffold_panel'));
  });
  $('reviseArtifact').addEventListener('click', () => addEvent('artifact_revision_event', { artifactId: 'artifact-01' }, 'convergence'));
  $('interventionBtn').addEventListener('click', () => addEvent('collaboration_event', {
    action: 'instructor_intervention_suggestion',
    suggestion: 'AI 사용 전 학생 아이디어를 먼저 10개 이상 생성하도록 팀 규칙을 조정'
  }, 'convergence'));
  $('exportLog').addEventListener('click', () => {
    $('jsonOutput').textContent = JSON.stringify(state.projectState.events, null, 2);
    $('jsonModal').classList.remove('hidden');
  });
  $('closeModal').addEventListener('click', () => $('jsonModal').classList.add('hidden'));

  if (window.lucide) lucide.createIcons();
});
